import type { RefinementObservation } from '@/lib/refinement-observation';

type Group = { requests: number };
export interface RefinementAnalyticsReport {
  channels: Array<{ source: string; requests: number; credits: number; inputTokens: number; outputTokens: number; costUsd: number }>;
  optional: {
    samples: number; generativeSamples: number; fallbackSamples: number; initial: number; followUps: number; redos: number; maxRedoDepth: number; knownBaselines: number;
    matches: Array<{ label: string; requests: number }>;
    techniques: Array<{ label: string; requests: number }>;
    changes: Array<{ label: string; requests: number }>;
  };
}

export function refinementAnalyticsAccumulator() {
  const channels = new Map<string, RefinementAnalyticsReport['channels'][number]>();
  const matches = new Map<string, Group>(); const techniques = new Map<string, Group>(); const changes = new Map<string, Group>();
  const optional: RefinementAnalyticsReport['optional'] = { samples: 0, generativeSamples: 0, fallbackSamples: 0, initial: 0, followUps: 0, redos: 0, maxRedoDepth: 0, knownBaselines: 0, matches: [], techniques: [], changes: [] };
  function add(group: Map<string, Group>, label: string) {
    const bucket = group.get(label) ?? { requests: 0 };
    bucket.requests++; group.set(label, bucket);
  }
  const rows = (groups: Map<string, Group>) => [...groups].map(([label, group]) => ({ label, requests: group.requests })).sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
  return {
    add(event: { tenantId: string; source: string | null; status: string; creditsCharged: number; inputTokens: number | null; outputTokens: number | null; providerCostUsd: number | null; qualityTier: string | null; refinement: RefinementObservation | null }) {
      const source = event.source ?? 'unknown';
      const bucket = channels.get(source) ?? { source, requests: 0, credits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      bucket.requests++; bucket.credits += event.creditsCharged; bucket.inputTokens += event.inputTokens ?? 0; bucket.outputTokens += event.outputTokens ?? 0; bucket.costUsd += event.providerCostUsd ?? 0; channels.set(source, bucket);
      const observation = event.refinement;
      if (!observation || event.status !== 'succeeded') return;
      optional.samples++;
      if (event.qualityTier === 'generative') {
        optional.generativeSamples++;
        add(matches, observation.match);
        add(techniques, `${observation.requested} → ${observation.detected.join(' + ') || 'Uncertain'}`);
      } else optional.fallbackSamples++;
      if (observation.revision) {
        const revision = observation.revision;
        optional[revision.kind === 'redo' ? 'redos' : revision.kind === 'follow_up' ? 'followUps' : 'initial']++;
        optional.maxRedoDepth = Math.max(optional.maxRedoDepth, revision.depth);
        if (revision.baselineKnown) optional.knownBaselines++;
        for (const key of revision.changedParameters) add(changes, key);
      }
    },
    finish(): RefinementAnalyticsReport {
      optional.matches = rows(matches);
      optional.techniques = rows(techniques);
      optional.changes = rows(changes);
      return { channels: [...channels.values()].sort((a, b) => a.source.localeCompare(b.source)), optional };
    },
  };
}
