import { describe, expect, it } from 'vitest';
import { InquiryContactOutcomeEventSchema, InquiryContactOutcomeListSchema, InquiryContactOutcomeRecordedSchema, RecordInquiryContactOutcomeSchema } from '../../packages/contracts/src/inquiry-contact-outcome';

const event = { id: '10000000-0000-4000-8000-000000000003', clinic_id: '10000000-0000-4000-8000-000000000001', inquiry_id: '10000000-0000-4000-8000-000000000004', outcome: 'reached', recorded_at: '2026-10-29T10:00:00.123Z', event_version: 1 } as const;

describe('inquiry contact outcome contract', () => {
  it('accepts only the five persistable factual outcomes', () => {
    for (const outcome of ['attempted_no_answer', 'reached', 'requested_callback', 'declined', 'unable_to_proceed']) {
      expect(RecordInquiryContactOutcomeSchema.safeParse({ outcome }).success).toBe(true);
    }
    for (const outcome of ['not_attempted', 'urgent', 'qualified', 'converted', 'diagnosis', '']) {
      expect(RecordInquiryContactOutcomeSchema.safeParse({ outcome }).success).toBe(false);
    }
  });

  it('rejects caller-supplied tenant, actor, free-text and timestamp fields', () => {
    for (const extra of [{ clinic_id: event.clinic_id }, { actor_user_id: event.id }, { note: 'private details' }, { recorded_at: event.recorded_at }]) {
      expect(RecordInquiryContactOutcomeSchema.safeParse({ outcome: 'reached', ...extra }).success).toBe(false);
    }
  });

  it('validates minimal events, bounded list projections and no actor details', () => {
    expect(InquiryContactOutcomeEventSchema.parse(event)).toEqual(event);
    expect(InquiryContactOutcomeEventSchema.safeParse({ ...event, clinic_id: 'not-a-uuid' }).success).toBe(false);
    expect(InquiryContactOutcomeEventSchema.safeParse({ ...event, outcome: 'not_attempted' }).success).toBe(false);
    expect(InquiryContactOutcomeEventSchema.safeParse({ ...event, actor_user_id: event.id }).success).toBe(false);
    expect(InquiryContactOutcomeListSchema.safeParse({ clinic_id: event.clinic_id, inquiry_id: event.inquiry_id, items: [event], truncated: false }).success).toBe(true);
    expect(InquiryContactOutcomeListSchema.safeParse({ clinic_id: event.clinic_id, inquiry_id: event.inquiry_id, items: Array(51).fill(event), truncated: false }).success).toBe(false);
  });

  it('requires a receipt and rejects unexpected fields', () => {
    expect(InquiryContactOutcomeRecordedSchema.safeParse({ item: event, replayed: false }).success).toBe(true);
    expect(InquiryContactOutcomeRecordedSchema.safeParse({ item: event, replayed: false, owner_user_id: event.id }).success).toBe(false);
  });
});
