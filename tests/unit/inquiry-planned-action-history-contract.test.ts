import { describe, expect, it } from 'vitest';
import { InquiryPlannedActionHistorySchema } from '../../packages/contracts/src';

const inquiryId = '10000000-0000-4000-8000-000000000011';
const changed = {
  vocabulary_version: 1,
  previous_planned_action: null,
  planned_action: 'review_inquiry',
  previous_revision: 0,
  revision: 1,
  changed: true,
  recorded_at: '2026-10-27T01:00:00.000002Z',
  event_version: 1,
} as const;

describe('inquiry planned-action history v1 contract', () => {
  it('accepts bounded newest-first changed and no-op command outcomes', () => {
    const noOp = { ...changed, previous_planned_action: 'review_inquiry', previous_revision: 1, revision: 1, changed: false, recorded_at: '2026-10-27T01:00:00.000001Z' } as const;
    expect(InquiryPlannedActionHistorySchema.parse({ inquiry_id: inquiryId, items: [changed, noOp], truncated: false }).items).toEqual([changed, noOp]);
  });

  it('accepts clearing while rejecting inconsistent actions, revisions and initial state', () => {
    const cleared = { ...changed, previous_planned_action: 'review_inquiry', planned_action: null, previous_revision: 1, revision: 2 } as const;
    expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: [cleared], truncated: false }).success).toBe(true);
    for (const item of [
      { ...changed, changed: false },
      { ...changed, revision: 0 },
      { ...changed, previous_planned_action: 'review_inquiry' },
      { ...changed, vocabulary_version: 2 },
      { ...changed, planned_action: 'contact_patient' },
    ]) expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: [item], truncated: false }).success).toBe(false);
  });

  it('rejects receipt keys, identities, contacts and executable-task fields', () => {
    for (const extra of [{ actor_id: inquiryId }, { clinic_id: inquiryId }, { request_key: inquiryId }, { normalized_payload: {} }, { contact_email: 'private@example.invalid' }, { completed: false }, { priority: 'high' }]) {
      expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: [{ ...changed, ...extra }], truncated: false }).success).toBe(false);
    }
  });

  it('preserves offset and microsecond precision for newest-first validation', () => {
    const equivalentNewer = { ...changed, recorded_at: '2026-10-27T02:00:00.000002+01:00' };
    const older = { ...changed, recorded_at: '2026-10-27T01:00:00.000001Z' };
    expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: [equivalentNewer, older], truncated: false }).success).toBe(true);
    expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: [older, equivalentNewer], truncated: false }).success).toBe(false);
  });

  it('requires exactly 50 outcomes for truncation and fails safely on malformed trusted data', () => {
    expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: [], truncated: true }).success).toBe(false);
    expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: Array.from({ length: 50 }, () => changed), truncated: true }).success).toBe(true);
    const malformed = { inquiry_id: inquiryId, items: [{ ...changed, recorded_at: 'not-a-time' }], truncated: false };
    expect(() => InquiryPlannedActionHistorySchema.safeParse(malformed)).not.toThrow();
    expect(InquiryPlannedActionHistorySchema.safeParse(malformed).success).toBe(false);
    expect(InquiryPlannedActionHistorySchema.safeParse({ inquiry_id: inquiryId, items: [], truncated: false, owner_user_id: inquiryId }).success).toBe(false);
  });
});
