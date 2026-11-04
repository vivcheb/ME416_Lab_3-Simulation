import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Arena2D } from './components/Arena2D';
import { Arena3D } from './components/Arena3D';
import { ControlDock } from './components/ControlDock';
import { CourseEditor } from './components/CourseEditor';
import { MetricsAndExport } from './components/MetricsAndExport';
import { TelemetryBar } from './components/TelemetryBar';
import { COURSE_PRESETS } from './robotics/courses';
import { computeLQRGains } from './robotics/lqr';
import { SimState, SimulationEngine } from './robotics/simulation';
import { buildCourseTrajectory } from './robotics/speedProfile';
import {
  ControllerType,
  DisturbanceParams,
  FSMState,
  LQRParams,
  RunLogEntry,
  RunSummary,
  Trajectory,
  VehicleParams,
  WaypointInput,
} from './types/robotics';

const DEFAULT_VEHICLE: VehicleParams = {
  wheelbase_m: 0.20,
  track_m: 0.175,
  length_m: 0.322,
  width_m: 0.220,
  height_m: 0.251,
  maxSteer_rad: 0.45,
  maxSpeed_mps: 0.50,
  minTurnRadius_m: 0.50,
};

const DEFAULT_LQR: LQRParams = {
  qy: 12.0,
  qTheta: 1.5,
  r: 0.5,
};

const DEFAULT_DISTURBANCES: DisturbanceParams = {
  steerBias_rad: 0.0,
  slipNoise_std: 0.0,
  mocapStale_ms: 0,
};

export default function App() {
  const [activeCourseId, setActiveCourseId] = useState<string>('course1');
  const [waypoints, setWaypoints] = useState<WaypointInput[]>(
    COURSE_PRESETS[0].waypoints
  );
  const [controller, setController] = useState<ControllerType>('lqr');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [layoutView, setLayoutView] = useState<'split' | '2d' | '3d'>('split');
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Trajectory state
  const [trajectory, setTrajectory] = useState<Trajectory>(() => {
    return buildCourseTrajectory(
      COURSE_PRESETS[0].waypoints,
      0.35,
      0.25,
      DEFAULT_VEHICLE.minTurnRadius_m,
      DEFAULT_VEHICLE.wheelbase_m
    ).trajectory;
  });

  // Parameters
  const [lqrParams, setLqrParams] = useState<LQRParams>(DEFAULT_LQR);
  const [disturbances, setDisturbances] = useState<DisturbanceParams>(DEFAULT_DISTURBANCES);

  // Simulation engine instance stored in ref
  const simEngineRef = useRef<SimulationEngine | null>(null);

  // React state reflecting current simulation tick
  const [simState, setSimState] = useState<SimState>(() => {
    const engine = new SimulationEngine(
      trajectory,
      COURSE_PRESETS[0].waypoints,
      DEFAULT_VEHICLE,
      DEFAULT_LQR,
      DEFAULT_DISTURBANCES,
      'lqr'
    );
    simEngineRef.current = engine;
    return engine.state;
  });

  // Breadcrumbs & Logs
  const [breadcrumbs, setBreadcrumbs] = useState<
    { x: number; y: number; v: number; err: number }[]
  >([]);
  const [currentLog, setCurrentLog] = useState<RunLogEntry[]>([]);
  const [runSummaries, setRunSummaries] = useState<RunSummary[]>([]);

  // Initialize or re-create simulation engine on course change
  const recomputeTrajectoryAndEngine = useCallback(
    (newWps: WaypointInput[]) => {
      const { trajectory: newTraj } = buildCourseTrajectory(
        newWps,
        0.35,
        0.25,
        DEFAULT_VEHICLE.minTurnRadius_m,
        DEFAULT_VEHICLE.wheelbase_m
      );
      setTrajectory(newTraj);

      if (simEngineRef.current) {
        simEngineRef.current.setTrajectory(newTraj, newWps);
        setSimState({ ...simEngineRef.current.state });
        setBreadcrumbs([]);
        setCurrentLog([]);
      }
    },
    []
  );

  // Course selection handler
  const handleSelectCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    if (courseId === 'custom') {
      setIsEditorOpen(true);
      return;
    }
    const preset = COURSE_PRESETS.find((p) => p.id === courseId);
    if (preset) {
      setWaypoints(preset.waypoints);
      recomputeTrajectoryAndEngine(preset.waypoints);
    }
  };

  // Save waypoints from custom editor
  const handleSaveWaypoints = (wps: WaypointInput[]) => {
    setWaypoints(wps);
    setActiveCourseId('custom');
    recomputeTrajectoryAndEngine(wps);
  };

  // Controller mode handler
  const handleSelectController = (c: ControllerType) => {
    setController(c);
    if (simEngineRef.current) {
      simEngineRef.current.setController(c);
      setSimState({ ...simEngineRef.current.state });
    }
  };

  // LQR Params handler
  const handleUpdateLQRParams = (params: LQRParams) => {
    setLqrParams(params);
    if (simEngineRef.current) {
      simEngineRef.current.setLQRParams(params);
      setSimState({ ...simEngineRef.current.state });
    }
  };

  // Disturbance handler
  const handleUpdateDisturbances = (dist: DisturbanceParams) => {
    setDisturbances(dist);
    if (simEngineRef.current) {
      simEngineRef.current.setDisturbances(dist);
    }
  };

  // FSM trigger
  const handleFSMCommand = (cmd: FSMState) => {
    if (!simEngineRef.current) return;
    simEngineRef.current.transitionTo(cmd);
    setSimState({ ...simEngineRef.current.state });
  };

  // Reset trigger
  const handleReset = (perturbDist_m: number = 0, perturbTheta_deg: number = 0) => {
    if (!simEngineRef.current) return;
    simEngineRef.current.resetToStart(perturbDist_m, perturbTheta_deg);
    setSimState({ ...simEngineRef.current.state });
    setBreadcrumbs([]);
    setCurrentLog([]);
  };

  // Set robot pose from 2D arena drag
  const handleSetRobotPose = (x: number, y: number, thetaRad?: number) => {
    if (!simEngineRef.current) return;
    simEngineRef.current.setRobotPose(x, y, thetaRad);
    setSimState({ ...simEngineRef.current.state });
  };

  // Master animation & simulation loop
  useEffect(() => {
    let animId = 0;
    let lastTime = performance.now();
    let prevActive = false;

    const tick = (now: number) => {
      animId = requestAnimationFrame(tick);
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;

      const engine = simEngineRef.current;
      if (!engine) return;

      // Advance physics and control loop
      engine.update(deltaSec, speedMultiplier);

      // Check if run just finished
      if (prevActive && !engine.state.isRunActive && engine.state.isRunCompleted) {
        const summary = engine.getRunSummary(activeCourseId);
        if (summary) {
          setRunSummaries((prev) => [summary, ...prev]);
        }
      }
      prevActive = engine.state.isRunActive;

      // Update React state (throttled slightly if needed, or per frame)
      setSimState({ ...engine.state });
      setBreadcrumbs([...engine.historicalBreadcrumbs]);
      setCurrentLog([...engine.runLog]);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [speedMultiplier, activeCourseId]);

  // Compute live LQR gains for telemetry display
  const currentGains = computeLQRGains(
    Math.max(0.1, simState.v_mps || trajectory.vMax),
    0.05,
    DEFAULT_VEHICLE.wheelbase_m,
    lqrParams
  ).K;

  // Compute current RMS error
  const rmsError =
    currentLog.length > 0
      ? Math.sqrt(
          currentLog.reduce((acc, row) => acc + row.crossTrackErr_m * row.crossTrackErr_m, 0) /
            currentLog.length
        )
      : 0;

  // Run automated comparison test (runs FF then LQR on current course)
  const [isAutoComparing, setIsAutoComparing] = useState(false);
  const runComparisonSuite = async () => {
    if (isAutoComparing || !simEngineRef.current) return;
    setIsAutoComparing(true);

    // 1. Run Feedforward with disturbance
    handleSelectController('ff');
    handleReset(0, 0);
    simEngineRef.current.setDisturbances({
      steerBias_rad: 0.025,
      slipNoise_std: 0.005,
      mocapStale_ms: 0,
    });
    setDisturbances({
      steerBias_rad: 0.025,
      slipNoise_std: 0.005,
      mocapStale_ms: 0,
    });
    handleFSMCommand('GO');

    // Wait until completed
    const pollUntilDone = () =>
      new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!simEngineRef.current?.state.isRunActive) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });

    await pollUntilDone();

    // 2. Wait 1 second, then run LQR with identical disturbance
    await new Promise((r) => setTimeout(r, 1000));
    handleSelectController('lqr');
    handleReset(0, 0);
    handleFSMCommand('GO');

    await pollUntilDone();
    setIsAutoComparing(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans select-none">
      {/* 1. Header (Universal Frontend Design Top Bar Contract) */}
      <header className="flex items-center justify-between gap-8 px-5 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center font-mono font-bold text-white text-sm shadow-sm">
            416
          </div>
          <div>
            <span className="font-bold tracking-tight text-slate-100 text-sm whitespace-nowrap">
              ME416 Autonomous Driving Studio
            </span>
            <span className="hidden sm:inline text-slate-500 text-xs ml-2">
              RASTIC Lab 3 · AgileX LIMO
            </span>
          </div>
        </div>

        {/* Zone 2: View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg shrink-0">
          <button
            onClick={() => setLayoutView('split')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              layoutView === 'split'
                ? 'bg-slate-800 text-sky-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Split Dual-View
          </button>
          <button
            onClick={() => setLayoutView('2d')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              layoutView === '2d'
                ? 'bg-slate-800 text-sky-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2D Arena Overhead
          </button>
          <button
            onClick={() => setLayoutView('3d')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              layoutView === '3d'
                ? 'bg-slate-800 text-sky-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3D Robot View
          </button>
        </div>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/me416_lab3_standalone.html"
            download="me416_lab3_autonomous_driving.html"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors whitespace-nowrap flex items-center gap-1"
            title="Download self-contained single-file HTML artifact"
          >
            <span>💾</span>
            <span>Single-File HTML</span>
          </a>

          <button
            onClick={runComparisonSuite}
            disabled={isAutoComparing || simState.fsm === 'GO'}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isAutoComparing
                ? 'bg-amber-600 text-white cursor-wait'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sm'
            }`}
            title="Runs Course with FF then with LQR under +0.025 rad steering bias to record comparison data"
          >
            <span>{isAutoComparing ? '⏳ Running...' : '⚡ Compare FF vs LQR'}</span>
          </button>
        </div>
      </header>

      {/* 2. Real-Time Telemetry Bar */}
      <TelemetryBar
        simState={simState}
        trajectory={trajectory}
        waypoints={waypoints}
        controller={controller}
        rmsError_m={rmsError}
      />

      {/* 3. Central Dual-View Arena Area */}
      <main className="flex-1 min-h-0 w-full p-2.5 grid grid-cols-1 gap-2.5 overflow-hidden">
        {layoutView === 'split' && (
          <div className="w-full h-full grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-h-0">
            <Arena2D
              simState={simState}
              trajectory={trajectory}
              waypoints={waypoints}
              vehicle={DEFAULT_VEHICLE}
              breadcrumbs={breadcrumbs}
              onSetRobotPose={handleSetRobotPose}
            />
            <Arena3D
              simState={simState}
              trajectory={trajectory}
              waypoints={waypoints}
              vehicle={DEFAULT_VEHICLE}
            />
          </div>
        )}

        {layoutView === '2d' && (
          <div className="w-full h-full min-h-0">
            <Arena2D
              simState={simState}
              trajectory={trajectory}
              waypoints={waypoints}
              vehicle={DEFAULT_VEHICLE}
              breadcrumbs={breadcrumbs}
              onSetRobotPose={handleSetRobotPose}
            />
          </div>
        )}

        {layoutView === '3d' && (
          <div className="w-full h-full min-h-0">
            <Arena3D
              simState={simState}
              trajectory={trajectory}
              waypoints={waypoints}
              vehicle={DEFAULT_VEHICLE}
            />
          </div>
        )}
      </main>

      {/* 4. Bottom Collapsible Control Dock */}
      <ControlDock
        fsm={simState.fsm}
        onFSMCommand={handleFSMCommand}
        onReset={handleReset}
        controller={controller}
        onSelectController={handleSelectController}
        activeCourseId={activeCourseId}
        onSelectCourse={handleSelectCourse}
        speedMultiplier={speedMultiplier}
        onSetSpeedMultiplier={setSpeedMultiplier}
        lqrParams={lqrParams}
        onUpdateLQRParams={handleUpdateLQRParams}
        disturbances={disturbances}
        onUpdateDisturbances={handleUpdateDisturbances}
        lqrGains={currentGains}
        onOpenCustomEditor={() => setIsEditorOpen(true)}
      />

      {/* 5. Metrics & Problem 2 CSV Export Drawer */}
      <div className="px-2.5 pb-2.5 max-h-56 overflow-y-auto">
        <MetricsAndExport
          currentLog={currentLog}
          runSummaries={runSummaries}
          onClearHistory={() => setRunSummaries([])}
        />
      </div>

      {/* Course Editor Modal */}
      <CourseEditor
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        waypoints={waypoints}
        onSaveWaypoints={handleSaveWaypoints}
      />
    </div>
  );
}
