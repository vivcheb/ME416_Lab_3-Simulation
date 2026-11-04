import React, { useState } from 'react';
import { RunLogEntry, RunSummary } from '../types/robotics';

interface MetricsAndExportProps {
  currentLog: RunLogEntry[];
  runSummaries: RunSummary[];
  teamNumber?: string;
  onClearHistory: () => void;
}

export const MetricsAndExport: React.FC<MetricsAndExportProps> = ({
  currentLog,
  runSummaries,
  teamNumber = '01',
  onClearHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'plots' | 'raw'>('summary');

  // Export current run as Problem 2 CSV
  const exportCurrentRunCSV = () => {
    if (currentLog.length === 0) return;

    const headers = [
      'time_s',
      'xRef_m',
      'yRef_m',
      'thetaRef_rad',
      'x_m',
      'y_m',
      'theta_rad',
      'speedCmd_mps',
      'steerCmd_rad',
      'crossTrackErr_m',
      'headingErr_rad',
    ];

    const rows = currentLog.map((row) =>
      [
        row.time_s.toFixed(3),
        row.xRef_m.toFixed(4),
        row.yRef_m.toFixed(4),
        row.thetaRef_rad.toFixed(4),
        row.x_m.toFixed(4),
        row.y_m.toFixed(4),
        row.theta_rad.toFixed(4),
        row.speedCmd_mps.toFixed(4),
        row.steerCmd_rad.toFixed(4),
        row.crossTrackErr_m.toFixed(4),
        row.headingErr_rad.toFixed(4),
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ME416_Lab3_Team${teamNumber}_run_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Summary Table CSV matching Section 7 exactly:
  // course,controller,rmsCrossTrack_m,maxCrossTrack_m,finalPosErr_m,finalHeadingErr_deg,predictedTime_s,runTime_s
  const exportSummaryCSV = () => {
    if (runSummaries.length === 0) return;

    const headers = [
      'course',
      'controller',
      'rmsCrossTrack_m',
      'maxCrossTrack_m',
      'finalPosErr_m',
      'finalHeadingErr_deg',
      'predictedTime_s',
      'runTime_s',
    ];

    const rows = runSummaries.map((s) =>
      [
        s.course,
        s.controller,
        s.rmsCrossTrack_m.toFixed(4),
        s.maxCrossTrack_m.toFixed(4),
        s.finalPosErr_m.toFixed(4),
        s.finalHeadingErr_deg.toFixed(2),
        s.predictedTime_s.toFixed(2),
        s.runTime_s.toFixed(2),
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ME416_Lab3_Team${teamNumber}_summary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">Analysis & Data Verification</span>
          <span className="text-slate-500">·</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'summary'
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Summary Metrics Table ({runSummaries.length})
            </button>
            <button
              onClick={() => setActiveTab('plots')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'plots'
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Real-Time Error Plot
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'raw'
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Problem 2 CSV Log ({currentLog.length} rows)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCurrentRunCSV}
            disabled={currentLog.length === 0}
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
              currentLog.length > 0
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span>📥</span>
            <span>Download Problem 2 Run CSV</span>
          </button>

          <button
            onClick={exportSummaryCSV}
            disabled={runSummaries.length === 0}
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
              runSummaries.length > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span>📊</span>
            <span>Export summary.csv</span>
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="p-3">
        {activeTab === 'summary' && (
          <div className="overflow-x-auto">
            {runSummaries.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No runs recorded yet. Press <strong className="text-emerald-400">GO</strong> in Mission Control to execute a trajectory and record summary performance metrics.
              </div>
            ) : (
              <div>
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 font-sans">
                      <th className="py-2 px-3 font-medium">course</th>
                      <th className="py-2 px-3 font-medium">controller</th>
                      <th className="py-2 px-3 font-medium">rmsCrossTrack_m</th>
                      <th className="py-2 px-3 font-medium">maxCrossTrack_m</th>
                      <th className="py-2 px-3 font-medium">finalPosErr_m</th>
                      <th className="py-2 px-3 font-medium">finalHeadingErr_deg</th>
                      <th className="py-2 px-3 font-medium">predictedTime_s</th>
                      <th className="py-2 px-3 font-medium">runTime_s</th>
                      <th className="py-2 px-3 font-medium">Competition Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 tabular-nums">
                    {runSummaries.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/40 text-slate-300">
                        <td className="py-2 px-3 font-sans font-medium text-slate-100">{s.course}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              s.controller === 'lqr'
                                ? 'bg-sky-950 text-sky-400 border border-sky-800/50'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {s.controller}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={s.rmsCrossTrack_m < 0.05 ? 'text-emerald-400' : 'text-rose-400'}>
                            {s.rmsCrossTrack_m.toFixed(4)}
                          </span>
                        </td>
                        <td className="py-2 px-3">{s.maxCrossTrack_m.toFixed(4)}</td>
                        <td className="py-2 px-3">
                          <span className={s.finalPosErr_m < 0.1 ? 'text-emerald-400' : 'text-slate-300'}>
                            {s.finalPosErr_m.toFixed(4)}
                          </span>
                        </td>
                        <td className="py-2 px-3">{s.finalHeadingErr_deg.toFixed(2)}°</td>
                        <td className="py-2 px-3 text-slate-400">{s.predictedTime_s.toFixed(2)}</td>
                        <td className="py-2 px-3 text-slate-100 font-semibold">{s.runTime_s.toFixed(2)}</td>
                        <td className="py-2 px-3 font-sans">
                          {s.passedRms && s.passedClearance && s.passedGoal ? (
                            <span className="text-emerald-400 font-semibold text-xs">Passed All Checks ✓</span>
                          ) : (
                            <span className="text-amber-400 text-xs">
                              {[
                                !s.passedRms && 'RMS ≥ 5cm',
                                !s.passedClearance && 'Gate > 15cm',
                                !s.passedGoal && 'Goal error',
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={onClearHistory}
                    className="text-xs text-slate-500 hover:text-slate-300 underline"
                  >
                    Clear Run History
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'plots' && (
          <div className="space-y-4">
            <div className="h-44 w-full bg-slate-950 p-2 rounded-lg border border-slate-800 flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1 px-1">
                <span>Cross-Track Error ε_y(t) [meters]</span>
                <span className="font-mono text-emerald-400">Target: |ε_y| &lt; 0.05m (5cm)</span>
              </div>
              <div className="flex-1 w-full relative">
                <SimpleLineChart
                  data={currentLog.map((l) => ({ t: l.time_s, v: l.crossTrackErr_m }))}
                  targetLimit={0.05}
                  color="#38bdf8"
                  unit="m"
                />
              </div>
            </div>

            <div className="h-44 w-full bg-slate-950 p-2 rounded-lg border border-slate-800 flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1 px-1">
                <span>Heading Error ε_θ(t) [deg] & Steering Command φ(t)</span>
                <span className="font-mono text-amber-400">Clamped to ±0.45 rad (±25.8°)</span>
              </div>
              <div className="flex-1 w-full relative">
                <SimpleLineChart
                  data={currentLog.map((l) => ({
                    t: l.time_s,
                    v: (l.headingErr_rad * 180) / Math.PI,
                  }))}
                  color="#f59e0b"
                  unit="°"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'raw' && (
          <div>
            <div className="font-mono text-[11px] text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-56 overflow-y-auto">
              <div className="text-slate-500 font-bold border-b border-slate-800 pb-1 mb-1">
                time_s,xRef_m,yRef_m,thetaRef_rad,x_m,y_m,theta_rad,speedCmd_mps,steerCmd_rad,crossTrackErr_m,headingErr_rad
              </div>
              {currentLog.slice(-50).map((row, idx) => (
                <div key={idx} className="whitespace-nowrap hover:bg-slate-900 px-1 py-0.5 rounded">
                  {[
                    row.time_s.toFixed(3),
                    row.xRef_m.toFixed(4),
                    row.yRef_m.toFixed(4),
                    row.thetaRef_rad.toFixed(4),
                    row.x_m.toFixed(4),
                    row.y_m.toFixed(4),
                    row.theta_rad.toFixed(4),
                    row.speedCmd_mps.toFixed(4),
                    row.steerCmd_rad.toFixed(4),
                    row.crossTrackErr_m.toFixed(4),
                    row.headingErr_rad.toFixed(4),
                  ].join(',')}
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-slate-500 text-xs">
              Showing latest {Math.min(50, currentLog.length)} rows of {currentLog.length} recorded points.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Lightweight canvas line chart for high-frequency telemetry plots
const SimpleLineChart: React.FC<{
  data: { t: number; v: number }[];
  targetLimit?: number;
  color: string;
  unit: string;
}> = ({ data, targetLimit, color, unit }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    if (data.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.fillText('Waiting for trajectory run data...', w / 2 - 80, h / 2);
      return;
    }

    const maxT = Math.max(1, data[data.length - 1].t);
    let maxAbsV = 0.05;
    for (const d of data) {
      if (Math.abs(d.v) > maxAbsV) maxAbsV = Math.abs(d.v);
    }
    if (targetLimit && targetLimit * 1.5 > maxAbsV) {
      maxAbsV = targetLimit * 1.5;
    }

    const padding = 25;
    const toX = (t: number) => padding + (t / maxT) * (w - 2 * padding);
    const toY = (v: number) => h / 2 - (v / maxAbsV) * (h / 2 - padding);

    // Zero baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, h / 2);
    ctx.lineTo(w - padding, h / 2);
    ctx.stroke();

    // Target threshold lines (+/- limit)
    if (targetLimit) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding, toY(targetLimit));
      ctx.lineTo(w - padding, toY(targetLimit));
      ctx.moveTo(padding, toY(-targetLimit));
      ctx.lineTo(w - padding, toY(-targetLimit));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Data Line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(data[0].t), toY(data[0].v));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(data[i].t), toY(data[i].v));
    }
    ctx.stroke();

    // Latest value label
    const latest = data[data.length - 1];
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = color;
    ctx.fillText(`${latest.v.toFixed(3)} ${unit}`, w - 75, 14);
  }, [data, targetLimit, color, unit]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};
