import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SimState } from '../robotics/simulation';
import { Trajectory, VehicleParams, WaypointInput } from '../types/robotics';

interface Arena2DProps {
  simState: SimState;
  trajectory: Trajectory;
  waypoints: WaypointInput[];
  vehicle: VehicleParams;
  breadcrumbs: { x: number; y: number; v: number; err: number }[];
  onSetRobotPose: (x: number, y: number, thetaRad?: number) => void;
  onSelectWaypoint?: (wpId: string) => void;
}

export const Arena2D: React.FC<Arena2DProps> = ({
  simState,
  trajectory,
  waypoints,
  vehicle,
  breadcrumbs,
  onSetRobotPose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);

  // Arena physical dimensions
  const arenaWidth = 9.0;  // x in [-4.5, 4.5]
  const arenaHeight = 5.0; // y in [-2.5, 2.5]

  // Coordinate transform helpers:
  // Math coords: center (0,0), +x right, +y up
  // Canvas coords: (0,0) top-left, +x right, +y down
  const getTransform = useCallback((width: number, height: number) => {
    const padding = 45; // pixels
    const availW = width - 2 * padding;
    const availH = height - 2 * padding;
    const scale = Math.min(availW / arenaWidth, availH / arenaHeight);
    const originX = width / 2;
    const originY = height / 2;

    const toCanvasX = (x: number) => originX + x * scale;
    const toCanvasY = (y: number) => originY - y * scale; // inverted for +y up
    const toMathX = (cx: number) => (cx - originX) / scale;
    const toMathY = (cy: number) => (originY - cy) / scale;

    return { scale, originX, originY, toCanvasX, toCanvasY, toMathX, toMathY };
  }, []);

  // Mouse interaction for dragging robot pose in WAIT mode
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (simState.fsm !== 'WAIT') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const { toCanvasX, toCanvasY, toMathX, toMathY } = getTransform(rect.width, rect.height);
    const robotCx = toCanvasX(simState.x_m);
    const robotCy = toCanvasY(simState.y_m);

    const dist = Math.hypot(cx - robotCx, cy - robotCy);
    if (dist < 35) {
      isDraggingRef.current = true;
    } else {
      // Direct click to place near
      const mx = Math.max(-4.4, Math.min(4.4, toMathX(cx)));
      const my = Math.max(-2.4, Math.min(2.4, toMathY(cy)));
      onSetRobotPose(mx, my);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { toMathX, toMathY } = getTransform(rect.width, rect.height);

    const mx = parseFloat(toMathX(cx).toFixed(2));
    const my = parseFloat(toMathY(cy).toFixed(2));
    setHoverCoord({ x: mx, y: my });

    if (isDraggingRef.current && simState.fsm === 'WAIT') {
      const clampedX = Math.max(-4.4, Math.min(4.4, toMathX(cx)));
      const clampedY = Math.max(-2.4, Math.min(2.4, toMathY(cy)));
      onSetRobotPose(clampedX, clampedY);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.save();
    ctx.scale(dpr, dpr);

    const { scale, toCanvasX, toCanvasY } = getTransform(width, height);

    // 1. Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // 2. Usable Arena Rectangle (-4.5 to 4.5, -2.5 to 2.5)
    const arenaLeft = toCanvasX(-4.5);
    const arenaTop = toCanvasY(2.5);
    const arenaPixelW = 9.0 * scale;
    const arenaPixelH = 5.0 * scale;

    // Floor fill
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(arenaLeft, arenaTop, arenaPixelW, arenaPixelH);

    // Grid lines (every 1 meter)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    for (let x = -4; x <= 4; x++) {
      const cx = toCanvasX(x);
      ctx.beginPath();
      ctx.moveTo(cx, arenaTop);
      ctx.lineTo(cx, arenaTop + arenaPixelH);
      ctx.stroke();

      // Tick label
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillText(`${x}m`, cx - 8, arenaTop + arenaPixelH + 14);
    }

    for (let y = -2; y <= 2; y++) {
      const cy = toCanvasY(y);
      ctx.beginPath();
      ctx.moveTo(arenaLeft, cy);
      ctx.lineTo(arenaLeft + arenaPixelW, cy);
      ctx.stroke();

      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillText(`${y}m`, arenaLeft - 26, cy + 3);
    }

    // Origin Crosshairs
    const originCx = toCanvasX(0);
    const originCy = toCanvasY(0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(originCx, arenaTop);
    ctx.lineTo(originCx, arenaTop + arenaPixelH);
    ctx.moveTo(arenaLeft, originCy);
    ctx.lineTo(arenaLeft + arenaPixelW, originCy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Red Tape Border (ME416 Arena Boundary)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(arenaLeft, arenaTop, arenaPixelW, arenaPixelH);

    // Corner Coordinate Callouts
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('[-4.5, -2.5]', arenaLeft + 4, arenaTop + arenaPixelH - 6);
    ctx.fillText('[4.5, 2.5]', arenaLeft + arenaPixelW - 62, arenaTop + 14);

    // 3. Landmarks from ME416 Manual
    ctx.font = '11px Plus Jakarta Sans, sans-serif';
    ctx.fillStyle = '#94a3b8';
    // Comm Ave side (+y, top)
    ctx.fillText('Street (Comm Ave) side · +y', originCx - 70, arenaTop - 12);
    // Hallway windows (+x, right)
    ctx.save();
    ctx.translate(arenaLeft + arenaPixelW + 18, originCy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('Hallway Windows · +x', -55, 0);
    ctx.restore();
    // Doors
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px Plus Jakarta Sans, sans-serif';
    // Hallway door near [4.5, 2.5]
    ctx.fillText('🚪 Hallway Door', arenaLeft + arenaPixelW - 90, arenaTop - 10);
    // Door to main RASTIC room near [-4.5, -2.5]
    ctx.fillText('🚪 Door to Main RASTIC', arenaLeft - 10, arenaTop + arenaPixelH + 28);

    // 4. Planned Dubins Path
    const pts = trajectory.points;
    if (pts.length > 1) {
      // Draw path line with segments colored or labeled
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(toCanvasX(pts[0].x), toCanvasY(pts[0].y));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(toCanvasX(pts[i].x), toCanvasY(pts[i].y));
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Label Dubins words along path legs
      for (const leg of trajectory.legs) {
        const midIdx = Math.floor((leg.startIdx + leg.endIdx) / 2);
        const midPt = pts[midIdx];
        if (midPt) {
          const lcx = toCanvasX(midPt.x);
          const lcy = toCanvasY(midPt.y);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(lcx - 22, lcy - 12, 44, 18);
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1;
          ctx.strokeRect(lcx - 22, lcy - 12, 44, 18);
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(`Word: ${leg.word}`, lcx - 20, lcy + 1);
        }
      }
    }

    // 5. Waypoints & Gate Arches
    waypoints.forEach((wp, idx) => {
      const cx = toCanvasX(wp.x);
      const cy = toCanvasY(wp.y);
      const theta = (wp.thetaDeg * Math.PI) / 180;
      const isStart = idx === 0;
      const isGoal = idx === waypoints.length - 1;

      // Gate clearance circle (15 cm threshold)
      if (wp.isGate) {
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, 0.15 * scale, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Waypoint circle
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
      ctx.fillStyle = isStart ? '#10b981' : isGoal ? '#ec4899' : '#eab308';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Heading arrow (0.4m long)
      const arrowLen = 0.4 * scale;
      const tipX = cx + arrowLen * Math.cos(theta);
      const tipY = cy - arrowLen * Math.sin(theta);
      ctx.strokeStyle = isStart ? '#10b981' : isGoal ? '#ec4899' : '#eab308';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Arrow head
      const headAngle = Math.PI / 6;
      ctx.fillStyle = isStart ? '#10b981' : isGoal ? '#ec4899' : '#eab308';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - 8 * Math.cos(theta - headAngle),
        tipY + 8 * Math.sin(theta - headAngle)
      );
      ctx.lineTo(
        tipX - 8 * Math.cos(theta + headAngle),
        tipY + 8 * Math.sin(theta + headAngle)
      );
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#f8fafc';
      const label = isStart ? 'Start' : isGoal ? 'Goal' : `Gate ${idx}`;
      ctx.fillText(`${label} (${wp.thetaDeg}°)`, cx + 10, cy - 8);
    });

    // 6. Breadcrumb Trail
    if (breadcrumbs.length > 1) {
      for (let i = 1; i < breadcrumbs.length; i++) {
        const b0 = breadcrumbs[i - 1];
        const b1 = breadcrumbs[i];
        const cx0 = toCanvasX(b0.x);
        const cy0 = toCanvasY(b0.y);
        const cx1 = toCanvasX(b1.x);
        const cy1 = toCanvasY(b1.y);

        // Color coded by cross-track error: <0.05m cyan, 0.05-0.15m amber, >0.15m rose
        const err = b1.err;
        ctx.strokeStyle =
          err < 0.05 ? '#06b6d4' : err < 0.15 ? '#f59e0b' : '#f43f5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx1, cy1);
        ctx.stroke();
      }
    }

    // 7. Projected Reference Pose (Ghost on Path)
    const ref = simState.refPoint;
    if (ref) {
      const refCx = toCanvasX(ref.x);
      const refCy = toCanvasY(ref.y);

      // Normal line connecting robot to path reference (cross-track error vector)
      const robotCx = toCanvasX(simState.x_m);
      const robotCy = toCanvasY(simState.y_m);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(robotCx, robotCy);
      ctx.lineTo(refCx, refCy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ghost marker
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.beginPath();
      ctx.arc(refCx, refCy, 5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // 8. AgileX LIMO Robot Footprint (Top-down view)
    const rx = toCanvasX(simState.x_m);
    const ry = toCanvasY(simState.y_m);
    const heading = simState.theta_rad;
    const steer = simState.steer_rad;

    ctx.save();
    ctx.translate(rx, ry);
    // Rotate canvas by -heading because +y in canvas is down
    ctx.rotate(-heading);

    const lengthPx = vehicle.length_m * scale;
    const widthPx = vehicle.width_m * scale;
    const wheelbasePx = vehicle.wheelbase_m * scale;
    const trackPx = vehicle.track_m * scale;

    // Chassis shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(-lengthPx / 2 + 2, -widthPx / 2 + 2, lengthPx, widthPx);

    // Chassis body
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-lengthPx / 2, -widthPx / 2, lengthPx, widthPx);
    ctx.strokeRect(-lengthPx / 2, -widthPx / 2, lengthPx, widthPx);

    // Green Tape ME416 Marker on top center of body
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-0.04 * scale, -0.025 * scale, 0.08 * scale, 0.05 * scale);
    ctx.font = '7px JetBrains Mono, monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('ME416', -0.025 * scale, 0.008 * scale);

    // Forward Direction Arrow on chassis
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(lengthPx / 2 + 8, 0);
    ctx.stroke();

    // Wheels (Four wheels)
    const wheelLenPx = 0.075 * scale;
    const wheelThickPx = 0.025 * scale;
    const halfL = wheelbasePx / 2;
    const halfW = trackPx / 2;

    const drawWheel = (wx: number, wy: number, steerAngle: number) => {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(-steerAngle);
      ctx.fillStyle = '#020617';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.fillRect(-wheelLenPx / 2, -wheelThickPx / 2, wheelLenPx, wheelThickPx);
      ctx.strokeRect(-wheelLenPx / 2, -wheelThickPx / 2, wheelLenPx, wheelThickPx);
      ctx.restore();
    };

    // Rear Wheels (fixed)
    drawWheel(-halfL, -halfW, 0);
    drawWheel(-halfL, halfW, 0);

    // Front Wheels (articulating with steer angle phi)
    drawWheel(halfL, -halfW, steer);
    drawWheel(halfL, halfW, steer);

    // Rear Axle center point (the kinematic reference point)
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(-halfL, 0, 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();

    ctx.restore();
  }, [simState, trajectory, waypoints, vehicle, breadcrumbs, getTransform]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3 text-slate-300">
          <span className="font-semibold text-slate-100">2D Arena Overhead</span>
          <span className="text-slate-500">9.0m × 5.0m RASTIC Usable Field</span>
          {simState.fsm === 'WAIT' && (
            <span className="text-sky-400 font-medium">💡 Drag robot to test perturbation</span>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-slate-400">
          {hoverCoord && (
            <span>
              Cursor: ({hoverCoord.x.toFixed(2)}, {hoverCoord.y.toFixed(2)}) m
            </span>
          )}
          <span className="text-slate-500">Origin at (0,0) Center</span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 w-full h-full relative cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
};
