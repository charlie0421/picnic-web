export type Eligibility = {
  initialized: boolean;
  auth: 'unknown' | 'anonymous' | 'authenticated';
  ads: 'unknown' | 'denied' | 'granted';
  adsEverLoaded: boolean;
  exactPublicRoute: boolean;
};

export function isEligible(value: Eligibility): boolean {
  return value.initialized === true && value.auth === 'anonymous' && value.ads === 'denied'
    && value.adsEverLoaded === false && value.exactPublicRoute === true;
}

export type Phase = 'WAITING' | 'LOADING' | 'ARMED' | 'RECORDING' | 'CLOSED';
export type Reason = 'ineligible' | 'hidden' | 'expired' | 'schema' | 'budget' | 'sequence'
  | 'overlap' | 'worker-timeout' | 'fetch-timeout' | 'http' | 'abort' | 'sdk';
export type Gate = { phase: Phase; generation: number };
export type SdkHandle = { start(): void; stop(): Promise<void>; flush(): Promise<void> };
export type Cleanup = 'pending' | 'resolved' | 'rejected';
export type TrialReport = {
  normal: 'pass' | 'fail' | 'not-run'; barrier: 'pass' | 'fail' | 'not-run';
  finiteCleanup: 'pass' | 'fail' | 'not-run'; limits: 'pass' | 'fail' | 'not-run'; isolation: 'pass' | 'fail' | 'not-run';
  expectedLimitations: { case: 'hung-processor' | 'hung-sdk-worker' | 'direct-restart'; observed: boolean }[];
  unverified: string[];
};
export type NodeState = {
  parent: number | null; children: number[]; kind: number; tag?: string;
  text?: string; isStyle?: boolean; attrs: Record<string, string>; style: Record<string, string>;
  /** Contract-owned marks. The engine copies them with the state and never reads them. */
  shadow?: 'host' | 'root'; svg?: true; mark?: string;
};
export type ProjectionState = {
  replayId: string | null; nextSegment: number; sessionStartMs: number | null;
  nodes: Map<number, NodeState>; tombstones: Set<number>;
};
export type Projected = { bytes: Uint8Array; next: ProjectionState; segment: number };
export type ProjectResult = { ok: true; value: Projected } | { ok: false; reason: Reason };
export type Transform = (input: import('@sentry/core').Envelope, state: ProjectionState, signal: AbortSignal) => Promise<ProjectResult>;

export function emptyProjectionState(): ProjectionState {
  return { replayId: null, nextSegment: 0, sessionStartMs: null, nodes: new Map(), tombstones: new Set() };
}
