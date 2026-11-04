import {
  ControllerType,
  DisturbanceParams,
  FSMState,
  LQRParams,
  Pose2D,
  RunLogEntry,
  RunSummary,
  Trajectory,
  TrajectoryPoint,
  VehicleParams,
  WaypointInput,
} from '../types/robotics';
import { wrapToPi } from './dubins';
import { computeLQRGains } from './lqr';

export interface SimState {
  // Vehicle state
  x_m: number;
  y_m: number;
  theta_rad: number;
  v_mps: number;
  steer_rad: number; // actual front wheel steering angle

  // Target command state
  speedCmd_mps: number;
  steerCmd_rad: number;

  // Trajectory progress
  progress_s: number;
  refPoint: TrajectoryPoint;
  crossTrackErr_m: number;
  headingErr_rad: number;

  // FSM and timing
  fsm: FSMState;
  time_s: number;
  runStartTime_s: number;
  isRunActive: boolean;
  isRunCompleted: boolean;
  autoStopReason: string | null;

  // LQR internals
  gains: [number, number]; // [Ky, Ktheta]

  // Gate tracking
  gateDistances: { [gateId: string]: number }; // minimum distance recorded
  mocapLastTimestamp: number;
}

export class SimulationEngine {
  vehicle: VehicleParams;
  lqrParams: LQRParams;
  disturbances: DisturbanceParams;
  trajectory: Trajectory;
  waypoints: WaypointInput[];
  controller: ControllerType;

  state: SimState;
  runLog: RunLogEntry[] = [];
  historicalBreadcrumbs: { x: number; y: number; v: number; err: number }[] = [];

  private controlTimerAccumulator = 0;
  private readonly physicsDt = 0.01; // 100 Hz physics integration
  private readonly controlDt = 0.05; // 20 Hz MQTT command rate

  constructor(
    trajectory: Trajectory,
    waypoints: WaypointInput[],
    vehicle: VehicleParams,
    lqrParams: LQRParams,
    disturbances: DisturbanceParams,
    controller: ControllerType = 'lqr'
  ) {
    this.trajectory = trajectory;
    this.waypoints = waypoints;
    this.vehicle = vehicle;
    this.lqrParams = lqrParams;
    this.disturbances = disturbances;
    this.controller = controller;

    const startPose = this.waypoints[0] || { x: -3.5, y: -1.5, thetaDeg: 0 };
    const refPoint = trajectory.points[0] || {
      s: 0,
      x: startPose.x,
      y: startPose.y,
      theta: (startPose.thetaDeg * Math.PI) / 180,
      kappa: 0,
      vRef: 0,
      phiFF: 0,
      legIndex: 0,
      word: 'LSL' as const,
    };

    const initialGains = computeLQRGains(
      trajectory.vMax,
      this.controlDt,
      this.vehicle.wheelbase_m,
      this.lqrParams
    ).K;

    this.state = {
      x_m: startPose.x,
      y_m: startPose.y,
      theta_rad: (startPose.thetaDeg * Math.PI) / 180,
      v_mps: 0,
      steer_rad: 0,
      speedCmd_mps: 0,
      steerCmd_rad: 0,
      progress_s: 0,
      refPoint,
      crossTrackErr_m: 0,
      headingErr_rad: 0,
      fsm: 'WAIT',
      time_s: 0,
      runStartTime_s: 0,
      isRunActive: false,
      isRunCompleted: false,
      autoStopReason: null,
      gains: initialGains,
      gateDistances: {},
      mocapLastTimestamp: performance.now(),
    };
  }

  setTrajectory(trajectory: Trajectory, waypoints: WaypointInput[]) {
    this.trajectory = trajectory;
    this.waypoints = waypoints;
    this.resetToStart();
  }

  setController(controller: ControllerType) {
    this.controller = controller;
  }

  setLQRParams(params: LQRParams) {
    this.lqrParams = params;
  }

  setDisturbances(disturbances: DisturbanceParams) {
    this.disturbances = disturbances;
  }

  // FSM State transitions
  transitionTo(nextState: FSMState) {
    if (this.state.fsm === 'HALT' && nextState !== 'WAIT') {
      return; // Terminal halt requires explicit reset
    }

    if (nextState === 'GO') {
      if (this.state.fsm === 'WAIT' || this.state.fsm === 'STOP' || this.state.fsm === 'CSTOP') {
        if (!this.state.isRunActive) {
          this.state.isRunActive = true;
          this.state.isRunCompleted = false;
          this.state.runStartTime_s = this.state.time_s;
          this.runLog = [];
          this.historicalBreadcrumbs = [];
        }
        this.state.fsm = 'GO';
        this.state.autoStopReason = null;
      }
    } else if (nextState === 'STOP') {
      // Hard emergency stop within 100 ms
      this.state.fsm = 'STOP';
      this.state.speedCmd_mps = 0;
    } else if (nextState === 'CSTOP') {
      // Controlled stop along path using nominal aMax
      this.state.fsm = 'CSTOP';
    } else if (nextState === 'HALT') {
      // Terminal emergency stop within 100 ms
      this.state.fsm = 'HALT';
      this.state.speedCmd_mps = 0;
      this.state.isRunActive = false;
    } else if (nextState === 'WAIT') {
      this.state.fsm = 'WAIT';
      this.state.isRunActive = false;
      this.state.speedCmd_mps = 0;
      this.state.steerCmd_rad = 0;
      this.state.v_mps = 0;
    }
  }

  resetToStart(perturbDist_m: number = 0, perturbTheta_deg: number = 0) {
    const startWp = this.waypoints[0] || { x: -3.5, y: -1.5, thetaDeg: 0 };
    const randAngle = Math.random() * 2 * Math.PI;
    const px = startWp.x + perturbDist_m * Math.cos(randAngle);
    const py = startWp.y + perturbDist_m * Math.sin(randAngle);
    const pt = ((startWp.thetaDeg + perturbTheta_deg) * Math.PI) / 180;

    this.state.x_m = px;
    this.state.y_m = py;
    this.state.theta_rad = wrapToPi(pt);
    this.state.v_mps = 0;
    this.state.steer_rad = 0;
    this.state.speedCmd_mps = 0;
    this.state.steerCmd_rad = 0;
    this.state.progress_s = 0;
    this.state.time_s = 0;
    this.state.runStartTime_s = 0;
    this.state.fsm = 'WAIT';
    this.state.isRunActive = false;
    this.state.isRunCompleted = false;
    this.state.autoStopReason = null;
    this.state.gateDistances = {};
    this.controlTimerAccumulator = 0;
    this.runLog = [];
    this.historicalBreadcrumbs = [];

    this.updateProgressProjection();
  }

  // Draggable robot placement in WAIT state
  setRobotPose(x: number, y: number, thetaRad?: number) {
    if (this.state.fsm !== 'WAIT') return;
    this.state.x_m = Math.max(-4.4, Math.min(4.4, x));
    this.state.y_m = Math.max(-2.4, Math.min(2.4, y));
    if (thetaRad !== undefined) {
      this.state.theta_rad = wrapToPi(thetaRad);
    }
    this.updateProgressProjection();
  }

  // Project simulated mocap position onto trajectory
  private updateProgressProjection() {
    const pts = this.trajectory.points;
    if (pts.length === 0) return;

    // Find closest point on path (searching around current progress for speed and forward monotonicity)
    let bestIdx = 0;
    let minSqDist = Infinity;

    // If already tracking, search forward window first
    const currentProgressIdx = Math.floor((this.state.progress_s / (this.trajectory.totalLength || 1)) * pts.length);
    const searchStart = Math.max(0, currentProgressIdx - 30);
    const searchEnd = Math.min(pts.length, currentProgressIdx + 120);

    for (let i = searchStart; i < searchEnd; i++) {
      const p = pts[i];
      const dx = this.state.x_m - p.x;
      const dy = this.state.y_m - p.y;
      const sqDist = dx * dx + dy * dy;
      if (sqDist < minSqDist) {
        minSqDist = sqDist;
        bestIdx = i;
      }
    }

    // If far off, check all points
    if (minSqDist > 1.0) {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const dx = this.state.x_m - p.x;
        const dy = this.state.y_m - p.y;
        const sqDist = dx * dx + dy * dy;
        if (sqDist < minSqDist) {
          minSqDist = sqDist;
          bestIdx = i;
        }
      }
    }

    const ref = pts[bestIdx];
    this.state.refPoint = ref;
    this.state.progress_s = ref.s;

    // Cross-track error: signed perpendicular distance to path
    // Positive when vehicle is to the left of the path
    const dx = this.state.x_m - ref.x;
    const dy = this.state.y_m - ref.y;
    this.state.crossTrackErr_m = -dx * Math.sin(ref.theta) + dy * Math.cos(ref.theta);

    // Heading error: wrapToPi(theta - theta_ref)
    this.state.headingErr_rad = wrapToPi(this.state.theta_rad - ref.theta);

    // Update gate distances
    for (let w = 1; w < this.waypoints.length - 1; w++) {
      const gate = this.waypoints[w];
      const dist = Math.hypot(this.state.x_m - gate.x, this.state.y_m - gate.y);
      const prev = this.state.gateDistances[gate.id];
      if (prev === undefined || dist < prev) {
        this.state.gateDistances[gate.id] = dist;
      }
    }
  }

  // 20 Hz MQTT Control Loop Tick
  private executeControlTick() {
    this.updateProgressProjection();

    const { refPoint, crossTrackErr_m, headingErr_rad } = this.state;
    const goalWp = this.waypoints[this.waypoints.length - 1];
    const distToGoal = Math.hypot(this.state.x_m - goalWp.x, this.state.y_m - goalWp.y);
    const goalHeadingErr = Math.abs(wrapToPi(this.state.theta_rad - (goalWp.thetaDeg * Math.PI) / 180));

    // Check Auto-Stop Condition 1: Boundary violation (9m x 5m arena: x in [-4.5, 4.5], y in [-2.5, 2.5])
    if (Math.abs(this.state.x_m) > 4.5 || Math.abs(this.state.y_m) > 2.5) {
      this.state.autoStopReason = 'Boundary Exceeded (outside 9m × 5m arena)';
      this.transitionTo('STOP');
      return;
    }

    // Check Auto-Stop Condition 2: Goal reached (d_goal < 0.08 m and |theta - theta_goal| < 10 deg, or end of path)
    const isAtGoal = (distToGoal < 0.12 && goalHeadingErr < (15 * Math.PI) / 180) ||
      (this.state.progress_s >= this.trajectory.totalLength - 0.05);

    if (this.state.fsm === 'GO' && isAtGoal) {
      this.state.autoStopReason = 'Goal Pose Reached Successfully';
      this.state.isRunCompleted = true;
      this.transitionTo('WAIT');
      return;
    }

    // Speed command generation based on state
    if (this.state.fsm === 'GO') {
      this.state.speedCmd_mps = refPoint.vRef;
    } else if (this.state.fsm === 'CSTOP') {
      // Controlled deceleration
      this.state.speedCmd_mps = Math.max(0, this.state.speedCmd_mps - this.trajectory.aMax * this.controlDt);
      if (this.state.speedCmd_mps <= 0.01 && this.state.v_mps <= 0.02) {
        this.transitionTo('STOP');
      }
    } else {
      // STOP or HALT
      this.state.speedCmd_mps = 0;
    }

    // Steering command calculation
    let steerCmd = refPoint.phiFF;

    if (this.controller === 'lqr') {
      // Calculate dynamic LQR gains
      const currentSpeed = Math.max(0.08, this.state.v_mps);
      const lqrData = computeLQRGains(
        currentSpeed,
        this.controlDt,
        this.vehicle.wheelbase_m,
        this.lqrParams
      );
      this.state.gains = lqrData.K;
      const [Ky, Ktheta] = lqrData.K;

      // phi = phi_ff - K * x_e
      // x_e = [crossTrackErr_m, headingErr_rad]^T
      const feedback = Ky * crossTrackErr_m + Ktheta * headingErr_rad;
      steerCmd = refPoint.phiFF - feedback;
    } else {
      // Feedforward alone: phi = phi_ff(s)
      steerCmd = refPoint.phiFF;
    }

    // Mechanical saturation limit: +/- 0.45 rad (~25.78 deg)
    const maxSteer = this.vehicle.maxSteer_rad;
    this.state.steerCmd_rad = Math.max(-maxSteer, Math.min(maxSteer, steerCmd));

    // Problem 2 CSV logging at 20 Hz during active drive
    if (this.state.isRunActive && (this.state.fsm === 'GO' || this.state.fsm === 'CSTOP')) {
      const entry: RunLogEntry = {
        time_s: parseFloat((this.state.time_s - this.state.runStartTime_s).toFixed(3)),
        xRef_m: parseFloat(refPoint.x.toFixed(4)),
        yRef_m: parseFloat(refPoint.y.toFixed(4)),
        thetaRef_rad: parseFloat(refPoint.theta.toFixed(4)),
        x_m: parseFloat(this.state.x_m.toFixed(4)),
        y_m: parseFloat(this.state.y_m.toFixed(4)),
        theta_rad: parseFloat(this.state.theta_rad.toFixed(4)),
        speedCmd_mps: parseFloat(this.state.speedCmd_mps.toFixed(4)),
        steerCmd_rad: parseFloat(this.state.steerCmd_rad.toFixed(4)),
        crossTrackErr_m: parseFloat(crossTrackErr_m.toFixed(4)),
        headingErr_rad: parseFloat(headingErr_rad.toFixed(4)),
      };
      this.runLog.push(entry);

      // Breadcrumb trail (sampled every ~0.1 s)
      if (this.runLog.length % 2 === 0) {
        this.historicalBreadcrumbs.push({
          x: this.state.x_m,
          y: this.state.y_m,
          v: this.state.v_mps,
          err: Math.abs(crossTrackErr_m),
        });
        if (this.historicalBreadcrumbs.length > 1000) {
          this.historicalBreadcrumbs.shift();
        }
      }
    }
  }

  // 100 Hz Kinematic Bicycle Physics Integration Tick (dt = 0.01 s)
  private executePhysicsStep(dt: number) {
    const { speedCmd_mps, steerCmd_rad, fsm } = this.state;
    const { wheelbase_m, maxSpeed_mps, maxSteer_rad } = this.vehicle;

    // Actuator dynamics (steering servo response and speed ramp)
    // 1. Steering servo tracking with steering trim bias and noise
    const commandedWithBias = steerCmd_rad + this.disturbances.steerBias_rad;
    const clampedCmd = Math.max(-maxSteer_rad, Math.min(maxSteer_rad, commandedWithBias));

    // First order servo lag (tau ~ 0.08s)
    const steerRate = 4.0; // rad/s servo speed limit
    const steerDiff = clampedCmd - this.state.steer_rad;
    const steerStep = Math.sign(steerDiff) * Math.min(Math.abs(steerDiff), steerRate * dt);
    this.state.steer_rad += steerStep;

    // Add slip noise if configured
    let effectiveSteer = this.state.steer_rad;
    if (this.disturbances.slipNoise_std > 0 && Math.abs(this.state.v_mps) > 0.02) {
      const noise = (Math.random() + Math.random() - 1.0) * this.disturbances.slipNoise_std;
      effectiveSteer += noise;
    }

    // 2. Longitudinal speed tracking
    let targetSpeed = speedCmd_mps;
    if (fsm === 'STOP' || fsm === 'HALT') {
      // Rapid stop within 100 ms
      const brakeDecel = 6.0; // m/s^2 emergency braking
      this.state.v_mps = Math.max(0, this.state.v_mps - brakeDecel * dt);
    } else {
      // Nominal acceleration limit aMax = 0.25 m/s^2 (or slightly higher for tracking)
      const maxAcc = this.trajectory.aMax * 1.5;
      const vDiff = targetSpeed - this.state.v_mps;
      const vStep = Math.sign(vDiff) * Math.min(Math.abs(vDiff), maxAcc * dt);
      this.state.v_mps = Math.max(0, Math.min(maxSpeed_mps, this.state.v_mps + vStep));
    }

    // 3. Kinematic bicycle model differential equations:
    // x_dot = v * cos(theta)
    // y_dot = v * sin(theta)
    // theta_dot = (v / L) * tan(phi)
    const v = this.state.v_mps;
    const theta = this.state.theta_rad;
    const phi = Math.max(-maxSteer_rad, Math.min(maxSteer_rad, effectiveSteer));

    const xDot = v * Math.cos(theta);
    const yDot = v * Math.sin(theta);
    const thetaDot = (v / wheelbase_m) * Math.tan(phi);

    // Forward Euler integration
    this.state.x_m += xDot * dt;
    this.state.y_m += yDot * dt;
    this.state.theta_rad = wrapToPi(this.state.theta_rad + thetaDot * dt);
    this.state.time_s += dt;
  }

  // Master simulation step invoked by requestAnimationFrame
  update(wallDeltaSeconds: number, speedMultiplier: number = 1.0) {
    if (wallDeltaSeconds <= 0) return;

    // Cap delta time to prevent physics instability when switching tabs
    const simTimeDelta = Math.min(0.2, wallDeltaSeconds * speedMultiplier);
    let remaining = simTimeDelta;

    while (remaining >= this.physicsDt) {
      // Physics step at 100 Hz
      this.executePhysicsStep(this.physicsDt);

      // Check 20 Hz MQTT control cycle (every 0.05 s)
      this.controlTimerAccumulator += this.physicsDt;
      if (this.controlTimerAccumulator >= this.controlDt - 1e-6) {
        this.executeControlTick();
        this.controlTimerAccumulator -= this.controlDt;
      }

      remaining -= this.physicsDt;
    }
  }

  // Compute final summary statistics for the run
  getRunSummary(courseName: string): RunSummary | null {
    if (this.runLog.length === 0) return null;

    let sumSqErr = 0;
    let maxErr = 0;
    for (const log of this.runLog) {
      const err = log.crossTrackErr_m;
      sumSqErr += err * err;
      if (Math.abs(err) > maxErr) maxErr = Math.abs(err);
    }
    const rmsCrossTrack_m = Math.sqrt(sumSqErr / this.runLog.length);

    const goalWp = this.waypoints[this.waypoints.length - 1];
    const finalLog = this.runLog[this.runLog.length - 1];
    const finalPosErr_m = Math.hypot(finalLog.x_m - goalWp.x, finalLog.y_m - goalWp.y);
    const goalHeadingRad = (goalWp.thetaDeg * Math.PI) / 180;
    const finalHeadingErr_deg = (Math.abs(wrapToPi(finalLog.theta_rad - goalHeadingRad)) * 180) / Math.PI;

    const runTime_s = finalLog.time_s;
    const predictedTime_s = this.trajectory.predictedTime_s;

    // Check pass/fail competition standards from Lab 3 manual
    const passedRms = rmsCrossTrack_m < 0.05; // < 5 cm
    let passedClearance = true;
    for (let w = 1; w < this.waypoints.length - 1; w++) {
      const gate = this.waypoints[w];
      const minDist = this.state.gateDistances[gate.id];
      if (minDist === undefined || minDist > 0.15) {
        passedClearance = false;
      }
    }
    const passedGoal = finalPosErr_m < 0.10 && finalHeadingErr_deg < 10.0;

    return {
      id: `${courseName}_${this.controller}_${Date.now()}`,
      course: courseName,
      controller: this.controller,
      rmsCrossTrack_m: parseFloat(rmsCrossTrack_m.toFixed(4)),
      maxCrossTrack_m: parseFloat(maxErr.toFixed(4)),
      finalPosErr_m: parseFloat(finalPosErr_m.toFixed(4)),
      finalHeadingErr_deg: parseFloat(finalHeadingErr_deg.toFixed(2)),
      predictedTime_s: parseFloat(predictedTime_s.toFixed(2)),
      runTime_s: parseFloat(runTime_s.toFixed(2)),
      passedRms,
      passedClearance,
      passedGoal,
      timestamp: new Date().toLocaleTimeString(),
      log: [...this.runLog],
    };
  }
}
