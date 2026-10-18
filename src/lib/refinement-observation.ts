import { z } from 'zod';
import { PROMPT_TECHNIQUES, type PromptTechnique } from './constants';

export const techniqueSchema = z.enum(PROMPT_TECHNIQUES.map(item => item.value) as [PromptTechnique, ...PromptTechnique[]]);
export const PARAMETER_KEYS = ['prompt', 'technique', 'mode', 'destination', 'maximumLength', 'inferenceMode', 'provider', 'references', 'attachments', 'context'] as const;
export const revisionObservationSchema = z.object({
  kind: z.enum(['initial', 'follow_up', 'redo']),
  depth: z.number().int().min(0).max(100),
  baselineKnown: z.boolean(),
  changedParameters: z.array(z.enum(PARAMETER_KEYS)).max(PARAMETER_KEYS.length).transform(keys => [...new Set(keys)]),
}).strip();
export type RevisionObservation = z.infer<typeof revisionObservationSchema>;
export const refinementObservationSchema = z.object({
  consentVersion: z.literal(1),
  requested: techniqueSchema,
  detected: z.array(techniqueSchema).max(8),
  match: z.enum(['matched', 'different', 'uncertain']),
  method: z.literal('structural-signals-v1'),
  revision: revisionObservationSchema.nullable(),
}).strip();
export type RefinementObservation = z.infer<typeof refinementObservationSchema>;
export interface RefinementAnalyticsInput { consent: boolean; requested: PromptTechnique; revision?: RevisionObservation }

// A local, conservative structural check, NOT a semantic evaluator or accuracy
// score. Inspect output in memory; persist only these fixed categories. Multiple
// techniques can coexist. No signal is unknown, never an assumed Zero-shot.
export function assessTechnique(requested: PromptTechnique, output: string) {
  const signals: Array<[PromptTechnique, RegExp]> = [
    ['Zero-shot', /\b(?:zero[- ]shot|without (?:worked |demonstration )?examples)\b/i],
    ['Few-shot', /(?:\bexample\s*1\b[\s\S]*\bexample\s*2\b|\bfew[- ]shot\b)/i],
    ['Chain-of-thought', /\b(?:step[- ]by[- ]step|chain[- ]of[- ]thought)\b/i],
    ['Tree-of-thoughts', /\b(?:tree[- ]of[- ]thoughts?|explore (?:multiple|several|alternative) (?:branches|approaches)|compare (?:multiple|alternative) (?:paths|approaches))\b/i],
    ['Role / persona', /(?:^|\n)\s*(?:act as\b|you are (?:an? |the )|role\s*:|persona\s*:)/i],
    ['Prompt chaining', /\b(?:prompt chaining|pass (?:the )?(?:output|result) (?:of|from)|use (?:the )?output of (?:step|stage))\b/i],
    ['ReAct', /(?:\bthought\s*:[\s\S]*\baction\s*:[\s\S]*\bobservation\s*:|\breason[- ]act[- ]observe\b)/i],
    ['Meta / reflection', /\b(?:critique (?:your|the) (?:own )?(?:draft|answer|response)|reflect on (?:your|the) (?:answer|response)|self[- ]reflection)\b/i],
  ];
  const detected = signals.filter(([, pattern]) => pattern.test(output.slice(0, 100_000))).map(([technique]) => technique);
  return { requested, detected, match: detected.includes(requested) ? 'matched' as const : detected.length ? 'different' as const : 'uncertain' as const, method: 'structural-signals-v1' as const };
}

export function observeRefinement(input: RefinementAnalyticsInput | undefined, result: unknown, enabled = process.env.ENABLE_REFINEMENT_ANALYTICS === 'true'): RefinementObservation | null {
  if (!enabled || input?.consent !== true || !result || typeof result !== 'object' || !('refinedPrompt' in result) || typeof result.refinedPrompt !== 'string') return null;
  const parsed = refinementObservationSchema.safeParse({ consentVersion: 1, ...assessTechnique(input.requested, result.refinedPrompt), revision: input.revision ?? null });
  return parsed.success ? parsed.data : null;
}
