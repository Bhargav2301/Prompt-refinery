import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { UsageSubjectIdSchema, UserUsageSchema } from './usage-telemetry-schema';

const LegacyUsageSchema = UserUsageSchema.extend({ createdAt: z.instanceof(Timestamp) });

export function projectLegacyUsageEvent(data: unknown, context: {
  uid: string; tenantId: string; workspaceId: string; migrationVersion: number;
}, now: Timestamp) {
  const parsed = LegacyUsageSchema.safeParse(data);
  if (!parsed.success || ![context.uid, context.tenantId, context.workspaceId].every((id) => UsageSubjectIdSchema.safeParse(id).success)) return null;
  const event = parsed.data;
  const createdMs = event.createdAt.toMillis();
  if (createdMs > now.toMillis()) return null;
  // Use the existing root event window from the original event date, not the
  // migration date. An earlier source expiry must never be extended.
  const sourceExpiry = (data as { expiresAt?: unknown }).expiresAt;
  const expiresMs = Math.min(createdMs + 90 * 86400000, sourceExpiry instanceof Timestamp ? sourceExpiry.toMillis() : Infinity);
  if (expiresMs <= now.toMillis()) return null;

  return {
    ...event,
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    createdBy: context.uid,
    legacy: true,
    migrationVersion: context.migrationVersion,
    migratedAt: now,
    expiresAt: Timestamp.fromMillis(expiresMs),
  };
}
