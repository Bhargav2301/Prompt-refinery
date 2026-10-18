import assert from 'node:assert/strict';
import test from 'node:test';
import { assessTechnique, observeRefinement, refinementObservationSchema } from '../src/lib/refinement-observation';
import { compareRefinementParameters, type RefinementParameters } from '../src/lib/refinement-parameters';
import { TenantUsageSchema } from '../src/lib/server/usage-telemetry-schema';
import { refinementAnalyticsAccumulator } from '../src/lib/server/refinement-analytics-report';
import { extensionRefinementSchema } from '../src/lib/server/extension-refinement';

test('technique assessment distinguishes match, different, mixed and uncertain without assuming zero-shot', () => {
  assert.equal(assessTechnique('Role / persona', 'You are an editor. Write a summary.').match, 'matched');
  assert.equal(assessTechnique('Zero-shot', 'Act as a storyteller.').match, 'different');
  assert.deepEqual(assessTechnique('Role / persona', 'Act as a planner. Compare alternative approaches.').detected, ['Tree-of-thoughts', 'Role / persona']);
  assert.equal(assessTechnique('Zero-shot', 'Write a short summary.').match, 'uncertain');
  assert.equal(assessTechnique('Few-shot', 'Example 1: hello. Example 2: goodbye.').match, 'matched');
  assert.equal(assessTechnique('ReAct', 'Thought: plan. Action: search. Observation: inspect.').match, 'matched');
});

test('optional measurement is default-deny and has a server kill switch', () => {
  const result = { refinedPrompt: 'You are an editor. PRIVATE-STORY' };
  assert.equal(observeRefinement(undefined, result), null);
  assert.equal(observeRefinement({ consent: false, requested: 'Zero-shot' }, result), null);
  assert.equal(observeRefinement({ consent: true, requested: 'Zero-shot' }, result, false), null);
  assert.equal(observeRefinement({ consent: true, requested: 'Zero-shot' }, {}), null);
  const measurement = observeRefinement({ consent: true, requested: 'Zero-shot' }, result, true);
  assert.equal(measurement?.match, 'different');
  assert.ok(!JSON.stringify(measurement).includes('PRIVATE-STORY'));
});

test('parameter comparison tracks every supported change without recording values or reference hashes', () => {
  const previous: RefinementParameters = { technique: 'Zero-shot', mode: 'quick_refine', destination: 'general', maximumLength: null, inferenceMode: 'managed', provider: null, references: 'a'.repeat(64), attachments: 'b'.repeat(64) };
  const current: RefinementParameters = { technique: 'Role / persona', mode: 'guided_fix', destination: 'flux', maximumLength: 1000, inferenceMode: 'byok', provider: 'gemini', references: 'c'.repeat(64), attachments: 'd'.repeat(64) };
  const comparison = compareRefinementParameters(current, previous, { kind: 'redo', depth: 2, promptChanged: true });
  assert.deepEqual(comparison.changedParameters, ['prompt', 'technique', 'mode', 'destination', 'maximumLength', 'inferenceMode', 'provider', 'references', 'attachments']);
  assert.equal(comparison.depth, 2); assert.equal(comparison.baselineKnown, true);
  assert.ok(!JSON.stringify(comparison).includes('cccccccc'));
  assert.deepEqual(compareRefinementParameters(current, undefined, { kind: 'follow_up', depth: 0, promptChanged: true }).changedParameters, []);
});

test('observation schema strips unknown payloads and rejects arbitrary categories', () => {
  const valid = { consentVersion: 1, ...assessTechnique('Role / persona', 'Act as an editor.'), revision: { kind: 'redo', depth: 1, baselineKnown: true, changedParameters: ['mode', 'mode'], prompt: 'private' }, output: 'private' };
  const parsed = refinementObservationSchema.parse(valid);
  assert.deepEqual(parsed.revision?.changedParameters, ['mode']); assert.ok(!JSON.stringify(parsed).includes('private'));
  assert.equal(TenantUsageSchema.shape.refinement.parse({ ...valid, detected: ['private'] }), null);
  assert.equal(TenantUsageSchema.shape.refinement.parse({ ...valid, revision: { ...valid.revision, changedParameters: ['https://private.test'] } }), null);
  assert.equal(extensionRefinementSchema.parse({ prompt: 'synthetic', source: 'app', analyticsConsent: false }).analyticsConsent, false);
  assert.equal('source' in extensionRefinementSchema.parse({ prompt: 'synthetic', source: 'app' }), false);
  assert.equal(extensionRefinementSchema.parse({ prompt: 'synthetic' }).analyticsConsent, false);
});

test('report separates channels, successful redo counts, baselines and generative assessments', () => {
  const report = refinementAnalyticsAccumulator(5);
  for (let i = 0; i < 5; i++) for (const source of ['app', 'extension', 'api']) report.add({ tenantId: `tenant${i}`, source, status: 'succeeded', creditsCharged: source === 'app' ? 2 : 1, inputTokens: 100, outputTokens: 20, providerCostUsd: .01, qualityTier: source === 'api' ? 'fallback' : 'generative', refinement: observeRefinement({ consent: true, requested: 'Role / persona', revision: { kind: source === 'extension' ? 'redo' : source === 'app' ? 'follow_up' : 'initial', depth: source === 'extension' ? 2 : 0, baselineKnown: true, changedParameters: ['mode'] } }, { refinedPrompt: 'Act as an editor.' }, true) });
  const output = report.finish();
  assert.equal(output.channels.length, 3); assert.equal(output.channels.find(row => row.source === 'app')?.credits, 10);
  assert.equal(output.optional.samples, 15); assert.equal(output.optional.generativeSamples, 10); assert.equal(output.optional.fallbackSamples, 5);
  assert.equal(output.optional.redos, 5); assert.equal(output.optional.followUps, 5); assert.equal(output.optional.maxRedoDepth, 2);
  assert.deepEqual(output.optional.matches, [{ label: 'matched', requests: 10 }]);
  assert.deepEqual(output.optional.changes, [{ label: 'mode', requests: 15 }]);
  assert.ok(!JSON.stringify(output).includes('tenant0'));
});

test('small groups are suppressed and missing consent does not become a failed quality assessment', () => {
  const report = refinementAnalyticsAccumulator(5);
  for (let i = 0; i < 5; i++) report.add({ tenantId: `tenant${i}`, source: 'app', status: 'succeeded', creditsCharged: 1, inputTokens: null, outputTokens: null, providerCostUsd: null, qualityTier: 'generative', refinement: i === 0 ? observeRefinement({ consent: true, requested: 'Zero-shot' }, { refinedPrompt: 'Hello.' }, true) : null });
  const output = report.finish();
  assert.equal(output.channelsSuppressed, false); assert.equal(output.optional.suppressed, true); assert.equal(output.optional.samples, 0); assert.deepEqual(output.optional.matches, []);
});
