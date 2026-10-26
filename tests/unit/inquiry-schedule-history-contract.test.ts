import { describe, expect, it } from 'vitest';
import { InquiryScheduleHistorySchema } from '../../packages/contracts/src';

const inquiryId = '10000000-0000-4000-8000-000000000011';
const changed = {
  previous_follow_up_at: '2026-10-26T19:00:00.000001Z',
  follow_up_at: '2026-10-26T20:00:00.000002Z',
  changed: true,
  recorded_at: '2026-10-26T18:00:00.000002Z',
  event_version: 1,
} as const;

describe('inquiry schedule history v1 contract', () => {
  it('accepts bounded newest-first changed and no-op outcomes', () => {
    const noOp = { ...changed, previous_follow_up_at: null, follow_up_at: null, changed: false, recorded_at: '2026-10-26T18:00:00.000001Z' };
    expect(InquiryScheduleHistorySchema.parse({ inquiry_id: inquiryId, items: [changed, noOp], truncated: false }).items).toEqual([changed, noOp]);
  });

  it('rejects hidden identifiers, payloads and inconsistent change claims', () => {
    for (const extra of [{ actor_id: inquiryId }, { request_key: inquiryId }, { normalized_payload: {} }, { contact_email: 'private@example.invalid' }]) {
      expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: [{ ...changed, ...extra }], truncated: false }).success).toBe(false);
    }
    expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: [{ ...changed, changed: false }], truncated: false }).success).toBe(false);
    expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: [{ ...changed, previous_follow_up_at: null, follow_up_at: null }], truncated: false }).success).toBe(false);
  });

  it('preserves offset and microsecond precision when checking newest-first order', () => {
    const equivalentNewer = { ...changed, recorded_at: '2026-10-26T19:00:00.000002+01:00' };
    const older = { ...changed, recorded_at: '2026-10-26T18:00:00.000001Z' };
    expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: [equivalentNewer, older], truncated: false }).success).toBe(true);
    expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: [older, equivalentNewer], truncated: false }).success).toBe(false);
  });

  it('requires exactly 50 returned outcomes when additional receipts exist', () => {
    expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: [], truncated: true }).success).toBe(false);
    expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: Array.from({ length: 50 }, () => changed), truncated: true }).success).toBe(true);
  });

  it('fails safely for malformed timestamps and response-level private fields', () => {
    const malformed = { inquiry_id: inquiryId, items: [{ ...changed, recorded_at: 'not-a-timestamp' }], truncated: false };
    expect(() => InquiryScheduleHistorySchema.safeParse(malformed)).not.toThrow();
    expect(InquiryScheduleHistorySchema.safeParse(malformed).success).toBe(false);
    expect(InquiryScheduleHistorySchema.safeParse({ inquiry_id: inquiryId, items: [], truncated: false, owner_user_id: inquiryId }).success).toBe(false);
  });
});
