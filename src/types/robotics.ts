export type FSMState = 'WAIT' | 'GO' | 'STOP' | 'CSTOP' | 'HALT';

export type ControllerType = 'ff' | 'lqr';

export interface Pose2D {
  x: number;     // meters, arena frame x in [-4.5, 4.5]
  y: number;     // meters, arena frame y in [-2.5, 2.5]
  theta: number; // radians, heading from +x toward +y
}

export interface WaypointInput {
  id: string;
  x: number;        // meters
  y: number;        // meters
  thetaDeg: number; // degrees
  isGate?: boolean;
}

export type DubinsWord = 'LSL' | 'RSR' | 'LSR' | 'RSL' | 'RLR' | 'LRL';

export interface DubinsSegment {
  type: 'L' | 'S' | 'R';
  length: number;    // meters
  radius: number;    // meters (positive, 0 for straight)
  startPose: Pose2D;
  endPose: Pose2D;
  center?: { x: number; y: number }; // for arcs
  startAngle?: number;
  deltaAngle?: number;
}

export interface DubinsPath {
  word: DubinsWord;
  totalLength: number; // meters
  segments: DubinsSegment[];
  startPose: Pose2D;
  goalPose: Pose2D;
}

export interface TrajectoryPoint {
  s: number;        // arc length along entire trajectory (m)
  x: number;        // m
  y: number;        // m
  theta: number;    // rad
  kappa: number;    // curvature (1/m)
  vRef: number;     // m/s
  phiFF: number;    // rad
  legIndex: number;
  word: DubinsWord;
}

export interface Trajectory {
  totalLength: number;      // S in meters
  predictedTime_s: number;  // T_pred in seconds
  vMax: number;             // m/s
  aMax: number;             // m/s^2
  rMin: number;             // m
  points: TrajectoryPoint[];
  legs: {
    startIdx: number;
    endIdx: number;
    word: DubinsWord;
    legLength: number;
  }[];
}

export interface RunLogEntry {
  time_s: number;
  xRef_m: number;
  yRef_m: number;
  thetaRef_rad: number;
  x_m: number;
  y_m: number;
  theta_rad: number;
  speedCmd_mps: number;
  steerCmd_rad: number;
  crossTrackErr_m: number;
  headingErr_rad: number;
}

export interface RunSummary {
  id: string;
  course: string;
  controller: ControllerType;
  rmsCrossTrack_m: number;
  maxCrossTrack_m: number;
  finalPosErr_m: number;
  finalHeadingErr_deg: number;
  predictedTime_s: number;
  runTime_s: number;
  passedRms: boolean;      // < 0.05 m
  passedClearance: boolean; // all gates < 0.15 m
  passedGoal: boolean;     // < 0.10 m and < 10 deg
  timestamp: string;
  log: RunLogEntry[];
}

export interface VehicleParams {
  wheelbase_m: number;     // L = 0.20 m
  track_m: number;         // 0.175 m
  length_m: number;        // 0.322 m
  width_m: number;         // 0.220 m
  height_m: number;        // 0.251 m
  maxSteer_rad: number;    // 0.45 rad (~25.78 deg)
  maxSpeed_mps: number;    // 0.50 m/s
  minTurnRadius_m: number; // default 0.50 m
}

export interface LQRParams {
  qy: number; // cross-track error weight
  qTheta: number; // heading error weight
  r: number; // steering control weight
}

export interface DisturbanceParams {
  steerBias_rad: number; // constant steering trim bias
  slipNoise_std: number; // slip & actuation Gaussian noise
  mocapStale_ms: number; // simulated mocap lag/delay
}
