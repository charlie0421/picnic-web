import type { Envelope } from '@sentry/core';
import type { ProjectResult, ProjectionState } from './contract';
import { p0FixtureContract } from './contracts/p0-fixture';
import { projectWithContract } from './engine/envelope';

/** Only the synthetic P0 schema. Never use as a general Replay transport. */
export function projectEnvelope(input: Envelope, state: ProjectionState): Promise<ProjectResult> {
  return projectWithContract(input, state, p0FixtureContract);
}
