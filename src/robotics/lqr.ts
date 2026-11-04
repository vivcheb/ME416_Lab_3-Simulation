import { LQRParams } from '../types/robotics';

export interface LQRMatrices {
  Ad: [[number, number], [number, number]];
  Bd: [number, number];
  P: [[number, number], [number, number]];
  K: [number, number]; // [Ky, Ktheta]
}

/**
 * Solves the Discrete Algebraic Riccati Equation (DARE) for the 2x2 error dynamics:
 * Ad = [[1, v*dt], [0, 1]]
 * Bd = [0.5 * (v^2 / L) * dt^2, (v / L) * dt]^T
 * Q = diag(qy, qTheta)
 * R = r (scalar)
 */
export function solveDiscreteARE(
  Ad: [[number, number], [number, number]],
  Bd: [number, number],
  Q: [[number, number], [number, number]],
  R: number,
  maxIter: number = 100,
  tol: number = 1e-7
): { P: [[number, number], [number, number]]; K: [number, number] } {
  // Initialize P = Q
  let P00 = Q[0][0];
  let P01 = Q[0][1];
  let P10 = Q[1][0];
  let P11 = Q[1][1];

  const a00 = Ad[0][0], a01 = Ad[0][1];
  const a10 = Ad[1][0], a11 = Ad[1][1];
  const b0 = Bd[0], b1 = Bd[1];

  for (let iter = 0; iter < maxIter; iter++) {
    // 1. Compute P * Ad
    const PAd00 = P00 * a00 + P01 * a10;
    const PAd01 = P00 * a01 + P01 * a11;
    const PAd10 = P10 * a00 + P11 * a10;
    const PAd11 = P10 * a01 + P11 * a11;

    // 2. Compute Ad^T * P * Ad
    const AtPAd00 = a00 * PAd00 + a10 * PAd10;
    const AtPAd01 = a00 * PAd01 + a10 * PAd11;
    const AtPAd10 = a01 * PAd00 + a11 * PAd10;
    const AtPAd11 = a01 * PAd01 + a11 * PAd11;

    // 3. Compute P * Bd
    const PBd0 = P00 * b0 + P01 * b1;
    const PBd1 = P10 * b0 + P11 * b1;

    // 4. Compute Bd^T * P * Bd + R (scalar)
    const scalarInv = 1.0 / (R + b0 * PBd0 + b1 * PBd1);

    // 5. Compute Bd^T * P * Ad (1x2 vector)
    const BtPAd0 = b0 * PAd00 + b1 * PAd10;
    const BtPAd1 = b0 * PAd01 + b1 * PAd11;

    // 6. Compute term: (Ad^T * P * Bd) * scalarInv * (Bd^T * P * Ad)
    // Note Ad^T * P * Bd is [BtPAd0, BtPAd1]^T
    const t00 = BtPAd0 * scalarInv * BtPAd0;
    const t01 = BtPAd0 * scalarInv * BtPAd1;
    const t10 = BtPAd1 * scalarInv * BtPAd0;
    const t11 = BtPAd1 * scalarInv * BtPAd1;

    // 7. Update P: P_next = AtPAd - term + Q
    const nextP00 = AtPAd00 - t00 + Q[0][0];
    const nextP01 = AtPAd01 - t01 + Q[0][1];
    const nextP10 = AtPAd10 - t10 + Q[1][0];
    const nextP11 = AtPAd11 - t11 + Q[1][1];

    const diff =
      Math.abs(nextP00 - P00) +
      Math.abs(nextP01 - P01) +
      Math.abs(nextP10 - P10) +
      Math.abs(nextP11 - P11);

    P00 = nextP00;
    P01 = (nextP01 + nextP10) / 2; // enforce symmetry
    P10 = P01;
    P11 = nextP11;

    if (diff < tol) break;
  }

  // Compute final gain K = (R + Bd^T P Bd)^-1 * (Bd^T P Ad)
  const PBd0 = P00 * b0 + P01 * b1;
  const PBd1 = P10 * b0 + P11 * b1;
  const scalarInv = 1.0 / (R + b0 * PBd0 + b1 * PBd1);

  const PAd00 = P00 * a00 + P01 * a10;
  const PAd01 = P00 * a01 + P01 * a11;
  const PAd10 = P10 * a00 + P11 * a10;
  const PAd11 = P10 * a01 + P11 * a11;

  const Ky = scalarInv * (b0 * PAd00 + b1 * PAd10);
  const Ktheta = scalarInv * (b0 * PAd01 + b1 * PAd11);

  return {
    P: [
      [P00, P01],
      [P10, P11],
    ],
    K: [Ky, Ktheta],
  };
}

export function computeLQRGains(
  v: number,
  dt: number,
  wheelbase: number,
  params: LQRParams
): LQRMatrices {
  // If stopped or near 0 speed, use a minimal non-zero speed for numerical stability
  const safeV = Math.max(0.05, Math.abs(v));

  const Ad: [[number, number], [number, number]] = [
    [1.0, safeV * dt],
    [0.0, 1.0],
  ];

  const Bd: [number, number] = [
    0.5 * ((safeV * safeV) / wheelbase) * dt * dt,
    (safeV / wheelbase) * dt,
  ];

  const Q: [[number, number], [number, number]] = [
    [params.qy, 0],
    [0, params.qTheta],
  ];

  const { P, K } = solveDiscreteARE(Ad, Bd, Q, params.r);

  return {
    Ad,
    Bd,
    P,
    K,
  };
}
