import type { RefinementObservation } from '@/lib/refinement-observation';

type Group = { requests: number; tenants: Set<string> };
export interface RefinementAnalyticsReport {
  channels: Array<{ source: string; requests: number; credits: number; inputTokens: number; outputTokens: number; costUsd: number }>;
  channelsSuppressed: boolean;
  optional: {
    samples: number; generativeSamples: number; fallbackSamples: number; initial: number; followUps: number; redos: number; maxRedoDepth: number; knownBaselines: number;
    suppressed: boolean;
    matches: Array<{ label: string; requests: number }>;
    techniques: Array<{ label: string; requests: number }>;
    changes: Array<{ label: string; requests: number }>;
    matchesSuppressed: boolean; techniquesSuppressed: boolean; changesSuppressed: boolean;
  };
}

export function refinementAnalyticsAccumulator(minimum: number) {
  const channels = new Map<string, RefinementAnalyticsReport['channels'][number] & { tenants: Set<string> }>();
  const participants = new Set<string>();
  const matches = new Map<string, Group>(); const techniques = new Map<string, Group>(); const changes = new Map<string, Group>();
  const optional: RefinementAnalyticsReport['optional'] = { samples: 0, generativeSamples: 0, fallbackSamples: 0, initial: 0, followUps: 0, redos: 0, maxRedoDepth: 0, knownBaselines: 0, suppressed: false, matches: [], techniques: [], changes: [], matchesSuppressed: false, techniquesSuppressed: false, changesSuppressed: false };
  function add(group: Map<string, Group>, label: string, tenant: string) {
    const bucket = group.get(label) ?? { requests: 0, tenants: new Set<string>() };
    bucket.requests++; bucket.tenants.add(tenant); group.set(label, bucket);
  }
  const small = (groups: Iterable<{ tenants: Set<string> }>) => [...groups].some(group => group.tenants.size < minimum);
  const rows = (groups: Map<string, Group>) => [...groups].map(([label, group]) => ({ label, requests: group.requests })).sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
  return {
    add(event: { tenantId: string; source: string | null; status: string; creditsCharged: number; inputTokens: number | null; outputTokens: number | null; providerCostUsd: number | null; qualityTier: string | null; refinement: RefinementObservation | null }) {
      const source = event.source ?? 'unknown';
      const bucket = channels.get(source) ?? { source, requests: 0, credits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, tenants: new Set<string>() };
      bucket.requests++; bucket.credits += event.creditsCharged; bucket.inputTokens += event.inputTokens ?? 0; bucket.outputTokens += event.outputTokens ?? 0; bucket.costUsd += event.providerCostUsd ?? 0; bucket.tenants.add(event.tenantId); channels.set(source, bucket);
      const observation = event.refinement;
      if (!observation || event.status !== 'succeeded') return;
      participants.add(event.tenantId); optional.samples++;
      if (event.qualityTier === 'generative') {
        optional.generativeSamples++;
        add(matches, observation.match, event.tenantId);
        add(techniques, `${observation.requested} → ${observation.detected.join(' + ') || 'Uncertain'}`, event.tenantId);
      } else optional.fallbackSamples++;
      if (observation.revision) {
        const revision = observation.revision;
        optional[revision.kind === 'redo' ? 'redos' : revision.kind === 'follow_up' ? 'followUps' : 'initial']++;
        optional.maxRedoDepth = Math.max(optional.maxRedoDepth, revision.depth);
        if (revision.baselineKnown) optional.knownBaselines++;
        for (const key of revision.changedParameters) add(changes, key, event.tenantId);
      }
    },
    finish(): RefinementAnalyticsReport {
      const suppressed = participants.size > 0 && participants.size < minimum;
      optional.suppressed = suppressed;
      optional.matchesSuppressed = suppressed || small(matches.values());
      optional.techniquesSuppressed = suppressed || small(techniques.values());
      optional.changesSuppressed = suppressed || small(changes.values());
      optional.matches = optional.matchesSuppressed ? [] : rows(matches);
      optional.techniques = optional.techniquesSuppressed ? [] : rows(techniques);
      optional.changes = optional.changesSuppressed ? [] : rows(changes);
      if (suppressed) for (const key of ['samples', 'generativeSamples', 'fallbackSamples', 'initial', 'followUps', 'redos', 'maxRedoDepth', 'knownBaselines'] as const) optional[key] = 0;
      const channelsSuppressed = small(channels.values());
      return { channelsSuppressed, channels: channelsSuppressed ? [] : [...channels.values()].map(({ tenants: _tenants, ...bucket }) => bucket).sort((a, b) => a.source.localeCompare(b.source)), optional };
    },
  };
}
