import type { NodeState, ProjectionState } from '../contract';
import type { Bag } from './values';

export type AttributeInput = { tag: string; key: string; raw: unknown; node: NodeState; diff: boolean };
/** A contract decides every value the engine emits. Every method throws Rejected to close the replay. */
export interface Contract {
  readonly name: string;
  readonly sdkVersion: string;
  readonly metadata: { release: string; environment: string };
  readonly tags: ReadonlySet<string>;
  /** Element keys allowed besides id, type, tagName, attributes and childNodes. */
  readonly elementExtraKeys: readonly string[];
  /** Validates extra keys and raw structure before attributes; returns extra keys to emit. */
  elementExtras(raw: Bag, entry: NodeState, parent: NodeState | undefined, state: ProjectionState): Bag;
  /** Returns the value to emit; undefined omits the key; null deletes it (diff only). */
  attribute(input: AttributeInput): string | null | undefined;
  /** Text node content outside <style>. */
  text(raw: unknown, parent: NodeState | undefined): string;
  /** Text node content inside <style>. */
  styleText(raw: unknown): string;
  /** Runs after an element and its snapshot children are projected and after each attribute change. */
  checkElement(entry: NodeState, state: ProjectionState): void;
  /** Whether a mutation may add a child under this element. */
  childAllowed(parent: NodeState): boolean;
}
