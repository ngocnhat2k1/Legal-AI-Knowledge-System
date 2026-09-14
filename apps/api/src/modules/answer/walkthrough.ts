/**
 * Stub of the classification walkthrough mode (plan 08). The runner builds against these three exports; the real module
 * replaces this file.
 */
import type { ClassifyInput, Violation, WalkthroughOutput } from './types';

export function buildWalkthroughPrompt(input: ClassifyInput): string {
  throw new Error(`walkthrough mode is not implemented yet (${input.candidates.length} candidates)`);
}

export const walkthroughSchema: Record<string, unknown> = {};

export function validateWalkthrough(output: WalkthroughOutput, input: ClassifyInput): Violation[] {
  return output.sections.length && input.candidates.length ? [] : [{ rule: 'walkthrough-stub', detail: 'walkthrough mode is not implemented yet' }];
}
