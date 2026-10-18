import { z } from 'zod';
import { CREATIVE_TOOLS } from './prompt-library';
import { techniqueSchema, type RevisionObservation } from './refinement-observation';

// Stored only with the user's private saved chat, never copied into telemetry.
export const refinementParametersSchema = z.object({
  technique: techniqueSchema,
  mode: z.enum(['quick_refine', 'guided_fix', 'full_council']),
  destination: z.enum(CREATIVE_TOOLS),
  maximumLength: z.number().int().min(100).max(50_000).nullable(),
  inferenceMode: z.enum(['managed', 'byok']),
  provider: z.enum(['gemini', 'openrouter']).nullable(),
  references: z.string().regex(/^[a-f0-9]{64}$/),
  attachments: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RefinementParameters = z.infer<typeof refinementParametersSchema>;
export function compareRefinementParameters(current: RefinementParameters, previous: RefinementParameters | undefined, input: { kind: RevisionObservation['kind']; depth: number; promptChanged: boolean }): RevisionObservation {
  const changedParameters: RevisionObservation['changedParameters'] = previous
    ? (Object.keys(current) as Array<keyof RefinementParameters>).filter(key => current[key] !== previous[key]) : [];
  if (previous && input.promptChanged) changedParameters.unshift('prompt');
  return { kind: input.kind, depth: Math.min(100, input.depth), baselineKnown: Boolean(previous), changedParameters };
}
