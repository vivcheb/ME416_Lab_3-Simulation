import React, { useState } from 'react';
import { COURSE_PRESETS } from '../robotics/courses';
import { ControllerType, DisturbanceParams, FSMState, LQRParams } from '../types/robotics';

interface ControlDockProps {
  fsm: FSMState;
  onFSMCommand: (cmd: FSMState) => void;
  onReset: (perturbDist_m?: number, perturbTheta_deg?: number) => void;
  controller: ControllerType;
  onSelectController: (c: ControllerType) => void;
  activeCourseId: string;
  onSelectCourse: (courseId: string) => void;
  speedMultiplier: number;
  onSetSpeedMultiplier: (mult: number) => void;
  lqrParams: LQRParams;
  onUpdateLQRParams: (params: LQRParams) => void;
  disturbances: DisturbanceParams;
  onUpdateDisturbances: (params: DisturbanceParams) => void;
  lqrGains: [number, number]; // [Ky, Ktheta]
  onOpenCustomEditor: () => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  fsm,
  onFSMCommand,
  onReset,
  controller,
  onSelectController,
  activeCourseId,
  onSelectCourse,
  speedMultiplier,
  onSetSpeedMultiplier,
  lqrParams,
  onUpdateLQRParams,
  disturbances,
  onUpdateDisturbances,
  lqrGains,
  onOpenCustomEditor,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'mission' | 'tuning' | 'disturbance'>('mission');

  return (
    <div className="w-full bg-slate-900 border-t border-slate-800 transition-all duration-300">
      {/* Collapse / Expand Toggle Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">Mission Operations & Controls</span>
          <span className="text-slate-500">·</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('mission')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'mission'
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mission Control
            </button>
            <button
              onClick={() => setActiveTab('tuning')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'tuning'
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              LQR Tuning (Q, R)
            </button>
            <button
              onClick={() => setActiveTab('disturbance')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'disturbance'
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Disturbance & Bias
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="px-2 py-0.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {isCollapsed ? '▴ Expand Controls' : '▾ Hide Controls'}
          </button>
        </div>
      </div>

      {/* Main Control Drawer */}
      {!isCollapsed && (
        <div className="p-3 max-w-7xl mx-auto">
          {activeTab === 'mission' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* FSM Command Buttons */}
              <div className="md:col-span-5 flex items-center gap-2">
                <button
                  onClick={() => onFSMCommand('GO')}
                  disabled={fsm === 'GO' || fsm === 'HALT'}
                  className={`flex-1 py-2 px-3 rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                    fsm === 'GO'
                      ? 'bg-emerald-600 text-white cursor-default'
                      : fsm === 'HALT'
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                  }`}
                >
                  <span>▶</span>
                  <span>GO (20Hz)</span>
                </button>

                <button
                  onClick={() => onFSMCommand('STOP')}
                  disabled={fsm === 'STOP' || fsm === 'HALT'}
                  className={`py-2 px-3 rounded-lg font-medium text-xs transition-colors ${
                    fsm === 'STOP'
                      ? 'bg-rose-900 text-rose-200'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                  title="Hard Emergency Stop within 100 ms"
                >
                  STOP (Hard)
                </button>

                <button
                  onClick={() => onFSMCommand('CSTOP')}
                  disabled={fsm !== 'GO'}
                  className={`py-2 px-3 rounded-lg font-medium text-xs transition-colors ${
                    fsm === 'CSTOP'
                      ? 'bg-sky-900 text-sky-200'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                  title="Controlled Stop: Decelerates along path with active steering, preserves alignment"
                >
                  CSTOP (Smooth)
                </button>

                <button
                  onClick={() => onFSMCommand('HALT')}
                  disabled={fsm === 'HALT'}
                  className="py-2 px-3 rounded-lg font-medium text-xs bg-red-950 hover:bg-red-900 text-red-300 border border-red-800/60"
                  title="Terminal stop: Exits run permanently"
                >
                  HALT
                </button>

                <button
                  onClick={() => onReset(0, 0)}
                  className="py-2 px-3 rounded-lg font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  title="Reset to starting pose"
                >
                  Reset
                </button>

                <button
                  onClick={() => onReset(0.15, 10)}
                  className="py-2 px-2.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 whitespace-nowrap"
                  title="Place robot with 15cm & 10° initial placement error (tests planner recovery)"
                >
                  Perturb (±15cm)
                </button>
              </div>

              {/* Course Selector & Custom Course */}
              <div className="md:col-span-4 flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Course:</span>
                <select
                  value={activeCourseId}
                  onChange={(e) => onSelectCourse(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 flex-1 focus:outline-none focus:border-sky-500"
                >
                  {COURSE_PRESETS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="custom">Custom Course (User Poses)</option>
                </select>

                <button
                  onClick={onOpenCustomEditor}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 whitespace-nowrap"
                >
                  Edit Poses
                </button>
              </div>

              {/* Controller Mode & Sim Speed */}
              <div className="md:col-span-3 flex items-center justify-end gap-3">
                {/* Controller Switch */}
                <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                  <button
                    onClick={() => onSelectController('ff')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      controller === 'ff'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Feedforward (ff)
                  </button>
                  <button
                    onClick={() => onSelectController('lqr')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      controller === 'lqr'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    FF + LQR (lqr)
                  </button>
                </div>

                {/* Speed Multiplier */}
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span>Speed:</span>
                  {[1, 2, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => onSetSpeedMultiplier(s)}
                      className={`px-1.5 py-0.5 rounded text-xs font-mono font-medium ${
                        speedMultiplier === s
                          ? 'bg-slate-700 text-sky-300 font-bold'
                          : 'hover:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tuning' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Cross-Track Penalty q_y</span>
                  <span className="font-mono text-sky-400">{lqrParams.qy.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="50"
                  step="0.5"
                  value={lqrParams.qy}
                  onChange={(e) =>
                    onUpdateLQRParams({ ...lqrParams, qy: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Heading Penalty q_θ</span>
                  <span className="font-mono text-sky-400">{lqrParams.qTheta.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={lqrParams.qTheta}
                  onChange={(e) =>
                    onUpdateLQRParams({ ...lqrParams, qTheta: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Steer Effort Penalty R</span>
                  <span className="font-mono text-sky-400">{lqrParams.r.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="5"
                  step="0.05"
                  value={lqrParams.r}
                  onChange={(e) =>
                    onUpdateLQRParams({ ...lqrParams, r: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-500"
                />
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px] uppercase font-sans mb-1">
                  DARE Computed Gains K = [K_y, K_θ]
                </div>
                <div className="text-emerald-400 font-bold">
                  K_y: {lqrGains[0]?.toFixed(3) || '0.000'} | K_θ: {lqrGains[1]?.toFixed(3) || '0.000'}
                </div>
                <div className="text-slate-500 text-[10px] mt-0.5">
                  Steer: φ = φ_ff - (K_y·ε_y + K_θ·ε_θ)
                </div>
              </div>
            </div>
          )}

          {activeTab === 'disturbance' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Steering Trim Bias δφ_bias</span>
                  <span className="font-mono text-amber-400">
                    {disturbances.steerBias_rad.toFixed(3)} rad ({((disturbances.steerBias_rad * 180) / Math.PI).toFixed(1)}°)
                  </span>
                </div>
                <input
                  type="range"
                  min="-0.06"
                  max="0.06"
                  step="0.005"
                  value={disturbances.steerBias_rad}
                  onChange={(e) =>
                    onUpdateDisturbances({
                      ...disturbances,
                      steerBias_rad: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500"
                />
                <div className="text-slate-500 text-[10px] mt-0.5">
                  Simulates mechanical misalignment. Feedforward drifts; LQR corrects.
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Tire Slip & Actuation Noise</span>
                  <span className="font-mono text-amber-400">{disturbances.slipNoise_std.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.04"
                  step="0.002"
                  value={disturbances.slipNoise_std}
                  onChange={(e) =>
                    onUpdateDisturbances({
                      ...disturbances,
                      slipNoise_std: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500"
                />
                <div className="text-slate-500 text-[10px] mt-0.5">
                  Random perturbations applied to tire grip.
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() =>
                    onUpdateDisturbances({ steerBias_rad: 0, slipNoise_std: 0, mocapStale_ms: 0 })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
                >
                  Clear Disturbances
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
