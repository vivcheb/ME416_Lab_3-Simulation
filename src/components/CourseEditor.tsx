import React, { useState } from 'react';
import { WaypointInput } from '../types/robotics';

interface CourseEditorProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: WaypointInput[];
  onSaveWaypoints: (wps: WaypointInput[]) => void;
}

export const CourseEditor: React.FC<CourseEditorProps> = ({
  isOpen,
  onClose,
  waypoints,
  onSaveWaypoints,
}) => {
  const [localWps, setLocalWps] = useState<WaypointInput[]>(waypoints);

  if (!isOpen) return null;

  const handleUpdate = (idx: number, field: keyof WaypointInput, value: any) => {
    const updated = [...localWps];
    updated[idx] = { ...updated[idx], [field]: value };
    setLocalWps(updated);
  };

  const handleAdd = () => {
    const newId = `wp_${Date.now()}`;
    // Insert before goal
    const updated = [...localWps];
    const insertIdx = Math.max(1, updated.length - 1);
    updated.splice(insertIdx, 0, {
      id: newId,
      x: 0,
      y: 0,
      thetaDeg: 45,
      isGate: true,
    });
    setLocalWps(updated);
  };

  const handleDelete = (idx: number) => {
    if (localWps.length <= 2) return; // Keep at least start & goal
    const updated = localWps.filter((_, i) => i !== idx);
    setLocalWps(updated);
  };

  const handleSave = () => {
    onSaveWaypoints(localWps);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-sm text-slate-100">Course Waypoint & Gate Configuration</h3>
            <p className="text-xs text-slate-400">
              Define course poses in the RASTIC room frame (x ∈ [-4.5, 4.5] m, y ∈ [-2.5, 2.5] m).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          <div className="space-y-2">
            {localWps.map((wp, idx) => {
              const isStart = idx === 0;
              const isGoal = idx === localWps.length - 1;

              return (
                <div
                  key={wp.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                >
                  <span className="font-mono font-semibold text-slate-400 w-16">
                    {isStart ? 'Start' : isGoal ? 'Goal' : `Gate ${idx}`}
                  </span>

                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-slate-500">X (m):</span>
                    <input
                      type="number"
                      step="0.1"
                      min="-4.5"
                      max="4.5"
                      value={wp.x}
                      onChange={(e) =>
                        handleUpdate(idx, 'x', parseFloat(e.target.value) || 0)
                      }
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-slate-500">Y (m):</span>
                    <input
                      type="number"
                      step="0.1"
                      min="-2.5"
                      max="2.5"
                      value={wp.y}
                      onChange={(e) =>
                        handleUpdate(idx, 'y', parseFloat(e.target.value) || 0)
                      }
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-slate-500">θ (°):</span>
                    <input
                      type="number"
                      step="5"
                      min="-180"
                      max="180"
                      value={wp.thetaDeg}
                      onChange={(e) =>
                        handleUpdate(idx, 'thetaDeg', parseFloat(e.target.value) || 0)
                      }
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {!isStart && !isGoal && (
                    <button
                      onClick={() => handleDelete(idx)}
                      className="px-2 py-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors"
                      title="Delete Gate"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-start">
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 flex items-center gap-1"
            >
              <span>+</span>
              <span>Add Intermediate Gate</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-950 border-t border-slate-800 text-xs">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors"
          >
            Apply & Re-Plan Trajectory
          </button>
        </div>
      </div>
    </div>
  );
};
