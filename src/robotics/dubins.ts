import { DubinsPath, DubinsSegment, DubinsWord, Pose2D } from '../types/robotics';

export function wrapToPi(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function wrapTo2Pi(angle: number): number {
  const a = angle % (2 * Math.PI);
  return a >= 0 ? a : a + 2 * Math.PI;
}

interface DubinsWordCandidate {
  word: DubinsWord;
  lengths: [number, number, number]; // normalized lengths in radians / normalized distance
  total: number;
}

// Dubins solver using standard normalized coordinate frame
function solveLSL(alpha: number, beta: number, d: number): DubinsWordCandidate | null {
  const p_squared = 2 + d * d - 2 * Math.cos(alpha - beta) + 2 * d * (Math.sin(alpha) - Math.sin(beta));
  if (p_squared < 0) return null;
  const p = Math.sqrt(p_squared);
  const tmp = Math.atan2(Math.cos(beta) - Math.cos(alpha), d + Math.sin(alpha) - Math.sin(beta));
  const t = wrapTo2Pi(-alpha + tmp);
  const q = wrapTo2Pi(beta - tmp);
  return { word: 'LSL', lengths: [t, p, q], total: t + p + q };
}

function solveRSR(alpha: number, beta: number, d: number): DubinsWordCandidate | null {
  const p_squared = 2 + d * d - 2 * Math.cos(alpha - beta) - 2 * d * (Math.sin(alpha) - Math.sin(beta));
  if (p_squared < 0) return null;
  const p = Math.sqrt(p_squared);
  const tmp = Math.atan2(Math.cos(alpha) - Math.cos(beta), d - Math.sin(alpha) + Math.sin(beta));
  const t = wrapTo2Pi(alpha - tmp);
  const q = wrapTo2Pi(-beta + tmp);
  return { word: 'RSR', lengths: [t, p, q], total: t + p + q };
}

function solveLSR(alpha: number, beta: number, d: number): DubinsWordCandidate | null {
  const p_squared = -2 + d * d + 2 * Math.cos(alpha - beta) + 2 * d * (Math.sin(alpha) + Math.sin(beta));
  if (p_squared < 0) return null;
  const p = Math.sqrt(p_squared);
  const tmp = Math.atan2(-Math.cos(alpha) - Math.cos(beta), d + Math.sin(alpha) + Math.sin(beta)) - Math.atan2(-2, p);
  const t = wrapTo2Pi(-alpha + tmp);
  const q = wrapTo2Pi(-wrapTo2Pi(beta) + tmp);
  return { word: 'LSR', lengths: [t, p, q], total: t + p + q };
}

function solveRSL(alpha: number, beta: number, d: number): DubinsWordCandidate | null {
  const p_squared = d * d - 2 + 2 * Math.cos(alpha - beta) - 2 * d * (Math.sin(alpha) + Math.sin(beta));
  if (p_squared < 0) return null;
  const p = Math.sqrt(p_squared);
  const tmp = Math.atan2(Math.cos(alpha) + Math.cos(beta), d - Math.sin(alpha) - Math.sin(beta)) - Math.atan2(2, p);
  const t = wrapTo2Pi(alpha - tmp);
  const q = wrapTo2Pi(beta - tmp);
  return { word: 'RSL', lengths: [t, p, q], total: t + p + q };
}

function solveRLR(alpha: number, beta: number, d: number): DubinsWordCandidate | null {
  const tmp = (6 - d * d + 2 * Math.cos(alpha - beta) + 2 * d * (Math.sin(alpha) - Math.sin(beta))) / 8;
  if (Math.abs(tmp) > 1) return null;
  const p = wrapTo2Pi(2 * Math.PI - Math.acos(tmp));
  const t = wrapTo2Pi(alpha - Math.atan2(Math.cos(alpha) - Math.cos(beta), d - Math.sin(alpha) + Math.sin(beta)) + wrapTo2Pi(p / 2));
  const q = wrapTo2Pi(alpha - beta - t + wrapTo2Pi(p));
  return { word: 'RLR', lengths: [t, p, q], total: t + p + q };
}

function solveLRL(alpha: number, beta: number, d: number): DubinsWordCandidate | null {
  const tmp = (6 - d * d + 2 * Math.cos(alpha - beta) + 2 * d * (-Math.sin(alpha) + Math.sin(beta))) / 8;
  if (Math.abs(tmp) > 1) return null;
  const p = wrapTo2Pi(2 * Math.PI - Math.acos(tmp));
  const t = wrapTo2Pi(-alpha + Math.atan2(-Math.cos(alpha) + Math.cos(beta), d + Math.sin(alpha) - Math.sin(beta)) + wrapTo2Pi(p / 2));
  const q = wrapTo2Pi(beta - alpha - t + wrapTo2Pi(p));
  return { word: 'LRL', lengths: [t, p, q], total: t + p + q };
}

export function computeShortestDubins(
  startPose: Pose2D,
  goalPose: Pose2D,
  rMin: number
): DubinsPath {
  const dx = goalPose.x - startPose.x;
  const dy = goalPose.y - startPose.y;
  const dist = Math.hypot(dx, dy);
  const theta = Math.atan2(dy, dx);

  const alpha = wrapTo2Pi(startPose.theta - theta);
  const beta = wrapTo2Pi(goalPose.theta - theta);
  const d = dist / rMin;

  const candidates: (DubinsWordCandidate | null)[] = [
    solveLSL(alpha, beta, d),
    solveRSR(alpha, beta, d),
    solveLSR(alpha, beta, d),
    solveRSL(alpha, beta, d),
    solveRLR(alpha, beta, d),
    solveLRL(alpha, beta, d),
  ];

  let best: DubinsWordCandidate | null = null;
  for (const c of candidates) {
    if (c !== null) {
      if (best === null || c.total < best.total) {
        best = c;
      }
    }
  }

  // Fallback to straight line or LSL if degenerated
  if (!best) {
    best = { word: 'LSL', lengths: [0.01, dist / rMin, 0.01], total: 0.02 + dist / rMin };
  }

  // Convert normalized candidate into 3 dimensional segments
  const segChars = best.word.split('') as ('L' | 'S' | 'R')[];
  const segLengths = best.lengths; // [t, p, q]

  const segments: DubinsSegment[] = [];
  let currentPose: Pose2D = { ...startPose };

  for (let i = 0; i < 3; i++) {
    const type = segChars[i];
    const lenNorm = segLengths[i];
    if (lenNorm <= 1e-6) continue;

    if (type === 'S') {
      const lengthM = lenNorm * rMin;
      const endPose: Pose2D = {
        x: currentPose.x + lengthM * Math.cos(currentPose.theta),
        y: currentPose.y + lengthM * Math.sin(currentPose.theta),
        theta: currentPose.theta,
      };
      segments.push({
        type: 'S',
        length: lengthM,
        radius: 0,
        startPose: { ...currentPose },
        endPose,
      });
      currentPose = endPose;
    } else {
      // Left or Right arc
      const deltaAngle = type === 'L' ? lenNorm : -lenNorm;
      const lengthM = lenNorm * rMin;
      const normalAngle = currentPose.theta + (type === 'L' ? Math.PI / 2 : -Math.PI / 2);
      const centerX = currentPose.x + rMin * Math.cos(normalAngle);
      const centerY = currentPose.y + rMin * Math.sin(normalAngle);
      const startAngle = Math.atan2(currentPose.y - centerY, currentPose.x - centerX);

      const endTheta = wrapToPi(currentPose.theta + deltaAngle);
      const endPose: Pose2D = {
        x: centerX + rMin * Math.cos(startAngle + deltaAngle),
        y: centerY + rMin * Math.sin(startAngle + deltaAngle),
        theta: endTheta,
      };

      segments.push({
        type,
        length: lengthM,
        radius: rMin,
        startPose: { ...currentPose },
        endPose,
        center: { x: centerX, y: centerY },
        startAngle,
        deltaAngle,
      });
      currentPose = endPose;
    }
  }

  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);

  return {
    word: best.word,
    totalLength,
    segments,
    startPose,
    goalPose,
  };
}
