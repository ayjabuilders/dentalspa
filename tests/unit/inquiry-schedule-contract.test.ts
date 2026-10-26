import { describe, expect, it } from 'vitest';
import { InquiryScheduleResultSchema, SetInquiryScheduleSchema } from '../../packages/contracts/src';

describe('inquiry follow-up schedule v1 contract', () => {
  it('requires explicit expected and requested values, including null', () => {
    expect(SetInquiryScheduleSchema.parse({ expected_follow_up_at: null, follow_up_at: '2026-10-27T10:00:00.123456+01:00' })).toEqual({ expected_follow_up_at: null, follow_up_at: '2026-10-27T10:00:00.123456+01:00' });
    expect(SetInquiryScheduleSchema.safeParse({ follow_up_at: null }).success).toBe(false);
    expect(SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: null, follow_up_at: '2026-10-27T10:00' }).success).toBe(false);
    expect(SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: null, follow_up_at: '2026-10-27T10:00:00.1234567Z' }).success).toBe(false);
    expect(SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: null, follow_up_at: '0000-01-01T00:00:00Z' }).success).toBe(false);
    expect(SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: null, follow_up_at: '0000-01-01T00:00:00+14:00' }).success).toBe(false);
    expect(SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: null, follow_up_at: '0001-01-01T00:00:00+14:00' }).success).toBe(false);
    expect(SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: null, follow_up_at: '9999-12-31T23:59:59-14:00' }).success).toBe(false);
  });

  it('rejects extra authority, messaging and status fields', () => {
    for (const extra of [{ owner_user_id: crypto.randomUUID() }, { notify: true }, { status: 'contacted' }]) {
      expect(SetInquiryScheduleSchema.safeParse({ expected_follow_up_at: null, follow_up_at: null, ...extra }).success).toBe(false);
    }
  });

  it('returns a minimal immutable receipt rather than an inquiry/contact snapshot', () => {
    const receipt = { inquiry_id: crypto.randomUUID(), clinic_id: crypto.randomUUID(), owner_user_id: crypto.randomUUID(), previous_follow_up_at: null, follow_up_at: '2026-10-27T10:00:00Z', changed: true, recorded_at: '2026-10-26T10:00:00Z', event_version: 1 } as const;
    expect(InquiryScheduleResultSchema.parse({ receipt, replayed: false }).receipt).toEqual(receipt);
    expect(InquiryScheduleResultSchema.safeParse({ receipt: { ...receipt, display_name: 'Forbidden' }, replayed: false }).success).toBe(false);
    expect(InquiryScheduleResultSchema.safeParse({ receipt }).success).toBe(false);
  });
});
