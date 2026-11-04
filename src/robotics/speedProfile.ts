import { DubinsPath, DubinsSegment, Pose2D, Trajectory, TrajectoryPoint, WaypointInput } from '../types/robotics';
import { computeShortestDubins, wrapToPi } from './dubins';

export function calculateTrapezoidalProfile(
  totalLength: number,
  vMax: number,
  aMax: number
): {
  predictedTime_s: number;
  dAcc: number;
  isTriangular: boolean;
  vPeak: number;
  speedAtS: (s: number) => number;
} {
  const dAcc = (vMax * vMax) / (2 * aMax);
  const isTriangular = 2 * dAcc > totalLength;

  let predictedTime_s: number;
  let vPeak = vMax;

  if (isTriangular) {
    vPeak = Math.sqrt(Math.max(0, aMax * totalLength));
    const tAcc = aMax > 0 ? vPeak / aMax : 0;
    predictedTime_s = 2 * tAcc;
  } else {
    const tAcc = aMax > 0 ? vMax / aMax : 0;
    const dCruise = totalLength - 2 * dAcc;
    const tCruise = vMax > 0 ? dCruise / vMax : 0;
    predictedTime_s = 2 * tAcc + tCruise;
  }

  const speedAtS = (s: number): number => {
    const clampedS = Math.max(0, Math.min(totalLength, s));
    if (isTriangular) {
      if (clampedS <= totalLength / 2) {
        return Math.max(0.04, Math.sqrt(Math.max(0, 2 * aMax * clampedS)));
      } else {
        return Math.max(0.04, Math.sqrt(Math.max(0, 2 * aMax * (totalLength - clampedS))));
      }
    } else {
      if (clampedS < dAcc) {
        return Math.max(0.04, Math.sqrt(Math.max(0, 2 * aMax * clampedS)));
      } else if (clampedS > totalLength - dAcc) {
        return Math.max(0.04, Math.sqrt(Math.max(0, 2 * aMax * (totalLength - clampedS))));
      } else {
        return vMax;
      }
    }
  };

  return {
    predictedTime_s,
    dAcc,
    isTriangular,
    vPeak,
    speedAtS,
  };
}

// Sample points along a Dubins segment
function sampleSegment(
  seg: DubinsSegment,
  startS: number,
  stepSize: number,
  wheelbase: number,
  legIndex: number,
  speedAtS: (s: number) => number,
  word: DubinsPath['word']
): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  const numSteps = Math.max(2, Math.ceil(seg.length / stepSize));

  for (let i = 0; i <= numSteps; i++) {
    const fraction = i / numSteps;
    const sLocal = fraction * seg.length;
    const sGlobal = startS + sLocal;

    let x: number;
    let y: number;
    let theta: number;
    let kappa: number;

    if (seg.type === 'S') {
      x = seg.startPose.x + sLocal * Math.cos(seg.startPose.theta);
      y = seg.startPose.y + sLocal * Math.sin(seg.startPose.theta);
      theta = seg.startPose.theta;
      kappa = 0;
    } else {
      const radius = seg.radius;
      const center = seg.center!;
      const startAngle = seg.startAngle!;
      const deltaAngle = seg.deltaAngle!;
      const currentAngle = startAngle + fraction * deltaAngle;

      x = center.x + radius * Math.cos(currentAngle);
      y = center.y + radius * Math.sin(currentAngle);

      if (seg.type === 'L') {
        theta = wrapToPi(seg.startPose.theta + fraction * deltaAngle);
        kappa = 1 / radius;
      } else {
        theta = wrapToPi(seg.startPose.theta + fraction * deltaAngle);
        kappa = -1 / radius;
      }
    }

    const vRef = speedAtS(sGlobal);
    const phiFF = Math.atan(wheelbase * kappa);

    points.push({
      s: sGlobal,
      x,
      y,
      theta,
      kappa,
      vRef,
      phiFF,
      legIndex,
      word,
    });
  }

  return points;
}

export function buildCourseTrajectory(
  waypoints: WaypointInput[],
  vMax: number,
  aMax: number,
  rMin: number,
  wheelbase: number = 0.20
): { trajectory: Trajectory; dubinsPaths: DubinsPath[] } {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints are required to build a trajectory.');
  }

  // 1. Compute Dubins path for each leg between consecutive waypoints
  const dubinsPaths: DubinsPath[] = [];
  let totalCourseLength = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const wpA = waypoints[i];
    const wpB = waypoints[i + 1];

    const startPose: Pose2D = {
      x: wpA.x,
      y: wpA.y,
      theta: (wpA.thetaDeg * Math.PI) / 180,
    };
    const goalPose: Pose2D = {
      x: wpB.x,
      y: wpB.y,
      theta: (wpB.thetaDeg * Math.PI) / 180,
    };

    const path = computeShortestDubins(startPose, goalPose, rMin);
    dubinsPaths.push(path);
    totalCourseLength += path.totalLength;
  }

  // 2. Build single continuous trapezoidal speed profile over whole course
  const { predictedTime_s, speedAtS } = calculateTrapezoidalProfile(
    totalCourseLength,
    vMax,
    aMax
  );

  // 3. Sample trajectory points with high resolution (e.g. 0.02m step)
  const stepSize = 0.02;
  const allPoints: TrajectoryPoint[] = [];
  const legsMeta: Trajectory['legs'] = [];
  let sAcc = 0;

  for (let legIdx = 0; legIdx < dubinsPaths.length; legIdx++) {
    const path = dubinsPaths[legIdx];
    const legStartIdx = allPoints.length;

    for (const seg of path.segments) {
      const segPoints = sampleSegment(
        seg,
        sAcc,
        stepSize,
        wheelbase,
        legIdx,
        speedAtS,
        path.word
      );

      // Deduplicate overlapping endpoints if not first segment
      if (allPoints.length > 0 && segPoints.length > 0) {
        segPoints.shift();
      }

      allPoints.push(...segPoints);
      sAcc += seg.length;
    }

    legsMeta.push({
      startIdx: legStartIdx,
      endIdx: allPoints.length - 1,
      word: path.word,
      legLength: path.totalLength,
    });
  }

  return {
    trajectory: {
      totalLength: totalCourseLength,
      predictedTime_s,
      vMax,
      aMax,
      rMin,
      points: allPoints,
      legs: legsMeta,
    },
    dubinsPaths,
  };
}
