import React from 'react';
import { SimState } from '../robotics/simulation';
import { ControllerType, Trajectory, WaypointInput } from '../types/robotics';

interface TelemetryBarProps {
  simState: SimState;
  trajectory: Trajectory;
  waypoints: WaypointInput[];
  controller: ControllerType;
  rmsError_m: number;
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({
  simState,
  trajectory,
  waypoints,
  controller,
  rmsError_m,
}) => {
  const {
    fsm,
    v_mps,
    steer_rad,
    crossTrackErr_m,
    headingErr_rad,
    time_s,
    runStartTime_s,
    progress_s,
    refPoint,
    autoStopReason,
  } = simState;

  const elapsedTime = Math.max(0, time_s - runStartTime_s);
  const steerDeg = (steer_rad * 180) / Math.PI;
  const headingErrDeg = (headingErr_rad * 180) / Math.PI;
  const crossTrackCm = crossTrackErr_m * 100;
  const rmsCm = rmsError_m * 100;

  // Gate clearance status
  let minGateDist = Infinity;
  for (let w = 1; w < waypoints.length - 1; w++) {
    const d = simState.gateDistances[waypoints[w].id];
    if (d !== undefined && d < minGateDist) {
      minGateDist = d;
    }
  }

  // Goal distance
  const goalWp = waypoints[waypoints.length - 1];
  const distToGoal = Math.hypot(simState.x_m - goalWp.x, simState.y_m - goalWp.y);

  // Status badges
  const isRmsPass = rmsCm < 5.0;
  const isGatePass = minGateDist === Infinity || minGateDist < 0.15;
  const isGoalPass = distToGoal < 0.10;

  // FSM badge colors
  const fsmStyles: Record<string, string> = {
    WAIT: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    GO: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    STOP: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    CSTOP: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    HALT: 'bg-red-950 text-red-300 border-red-700',
  };

  return (
    <div className="w-full bg-slate-900 border-b border-slate-800 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-6 text-xs">
        {/* FSM & Controller Mode */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">FSM:</span>
            <span
              className={`px-2 py-0.5 rounded border font-mono font-bold text-xs uppercase ${
                fsmStyles[fsm] || 'bg-slate-800 text-slate-300'
              }`}
            >
              {fsm}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Control:</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono font-semibold">
              {controller === 'lqr' ? 'LQR + Feedforward' : 'Feedforward Alone'}
            </span>
          </div>

          {refPoint && (
            <div className="hidden lg:flex items-center gap-1.5 text-slate-400">
              <span>Segment Word:</span>
              <span className="font-mono font-bold text-sky-400">{refPoint.word}</span>
            </div>
          )}
        </div>

        {/* Digital Telemetry Gauges */}
        <div className="flex flex-wrap items-center gap-5 font-mono tabular-nums text-slate-300">
          <div>
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Speed v</span>
            <span className="font-semibold text-slate-100">{v_mps.toFixed(2)}</span>
            <span className="text-slate-500 text-[11px] ml-0.5">m/s</span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Steering φ</span>
            <span className="font-semibold text-slate-100">{steerDeg.toFixed(1)}°</span>
            <span className="text-slate-500 text-[11px] ml-1">({steer_rad.toFixed(2)} rad)</span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Cross-Track ε_y</span>
            <span
              className={`font-semibold ${
                Math.abs(crossTrackCm) > 5 ? 'text-amber-400' : 'text-slate-100'
              }`}
            >
              {crossTrackCm.toFixed(1)}
            </span>
            <span className="text-slate-500 text-[11px] ml-0.5">cm</span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Heading Err ε_θ</span>
            <span
              className={`font-semibold ${
                Math.abs(headingErrDeg) > 10 ? 'text-amber-400' : 'text-slate-100'
              }`}
            >
              {headingErrDeg.toFixed(1)}°
            </span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Time / Pred</span>
            <span className="font-semibold text-slate-100">{elapsedTime.toFixed(1)}s</span>
            <span className="text-slate-500 text-[11px] ml-0.5">/ {trajectory.predictedTime_s.toFixed(1)}s</span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Progress s</span>
            <span className="font-semibold text-slate-100">{progress_s.toFixed(2)}m</span>
            <span className="text-slate-500 text-[11px] ml-0.5">/ {trajectory.totalLength.toFixed(2)}m</span>
          </div>
        </div>

        {/* Competition Pass/Fail Check Badges */}
        <div className="flex items-center gap-2">
          <div
            className={`px-2 py-0.5 rounded border text-[11px] flex items-center gap-1 font-mono ${
              isRmsPass
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
            }`}
            title="Competition threshold: RMS Cross-Track < 5 cm"
          >
            <span>RMS: {rmsCm.toFixed(1)}cm</span>
            <span>{isRmsPass ? '✓' : '✗'}</span>
          </div>

          {waypoints.length > 2 && (
            <div
              className={`px-2 py-0.5 rounded border text-[11px] flex items-center gap-1 font-mono ${
                isGatePass
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-700/60 text-amber-300'
              }`}
              title="Competition threshold: Gate clearance < 15 cm"
            >
              <span>Gate: {minGateDist === Infinity ? '—' : `${(minGateDist * 100).toFixed(0)}cm`}</span>
              <span>{isGatePass ? '✓' : '✗'}</span>
            </div>
          )}

          <div
            className={`px-2 py-0.5 rounded border text-[11px] flex items-center gap-1 font-mono ${
              isGoalPass
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Goal tolerance: < 10 cm and < 10 deg"
          >
            <span>Goal: {(distToGoal * 100).toFixed(0)}cm</span>
            <span>{isGoalPass ? '✓' : '—'}</span>
          </div>
        </div>
      </div>

      {autoStopReason && (
        <div className="mt-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <span>⚠️ {autoStopReason}</span>
          <span className="text-slate-400 text-[11px]">Click GO to continue or RESET to reposition</span>
        </div>
      )}
    </div>
  );
};
