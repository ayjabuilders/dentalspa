import { describe, expect, it } from 'vitest';
import { TeamActivitySchema } from '../../packages/contracts/src';

const event = { kind: 'inquiry_created', actor_display_name: 'Nora Exemple', occurred_at: '2026-10-26T19:00:00.000Z' } as const;

describe('team activity v1 contract', () => {
  it('accepts a bounded newest-first operational activity projection', () => {
    expect(TeamActivitySchema.parse({ observed_at: '2026-10-26T20:00:00.000Z', items: [event], truncated: false }).items).toEqual([event]);
  });

  it('rejects private identifiers, unsupported actions and oldest-first responses', () => {
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:00.000Z', items: [{ ...event, aggregate_id: '10000000-0000-4000-8000-000000000001' }], truncated: false }).success).toBe(false);
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:00.000Z', items: [{ ...event, kind: 'ClinicalNoteSigned' }], truncated: false }).success).toBe(false);
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:00.000Z', items: [event, { ...event, occurred_at: '2026-10-26T19:30:00.000Z' }], truncated: false }).success).toBe(false);
  });

  it('allows a removed or unavailable actor profile without exposing an identifier', () => {
    expect(TeamActivitySchema.parse({ observed_at: '2026-10-26T20:00:00.000Z', items: [{ ...event, actor_display_name: null }], truncated: false }).items[0]!.actor_display_name).toBeNull();
  });

  it('preserves sub-millisecond and offset precision when validating newest-first order', () => {
    const older = { ...event, occurred_at: '2026-10-26T19:00:00.000001Z' };
    const newer = { ...event, occurred_at: '2026-10-26T20:00:00.000002+01:00' };
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:01.000Z', items: [older, newer], truncated: false }).success).toBe(false);
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:01.000Z', items: [newer, older], truncated: false }).success).toBe(true);
  });

  it('requires exactly 50 returned items when more supported events exist', () => {
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:00.000Z', items: [], truncated: true }).success).toBe(false);
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:00.000Z', items: Array.from({ length: 50 }, () => event), truncated: true }).success).toBe(true);
  });

  it('returns a schema failure instead of throwing when an item timestamp is malformed', () => {
    expect(() => TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:00.000Z', items: [event, { ...event, occurred_at: 'not-a-timestamp' }], truncated: false })).not.toThrow();
    expect(TeamActivitySchema.safeParse({ observed_at: '2026-10-26T20:00:00.000Z', items: [event, { ...event, occurred_at: 'not-a-timestamp' }], truncated: false }).success).toBe(false);
  });
});
