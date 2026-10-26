import { describe, expect, it } from 'vitest';
import { CreateInquirySchema, InquiryCreatedSchema } from '../../packages/contracts/src';

const valid = { display_name: ' Synthetic inquiry ', contact_email: null, contact_phone: '+212 600 000 000', source: 'phone', follow_up_at: null };
describe('manual inquiry v1 contract', () => {
  it('normalizes permitted fields without requiring sensitive notes', () => {
    expect(CreateInquirySchema.parse(valid)).toEqual({ ...valid, display_name: 'Synthetic inquiry' });
  });
  it.each(['clinic_id', 'owner_user_id', 'patient_id', 'status', 'clinical_notes'])('rejects caller-owned %s', field => {
    expect(CreateInquirySchema.safeParse({ ...valid, [field]: 'forged' }).success).toBe(false);
  });
  it('rejects invalid contact values and ambiguous local timestamps', () => {
    expect(CreateInquirySchema.safeParse({ ...valid, contact_email: 'not-an-email' }).success).toBe(false);
    expect(CreateInquirySchema.safeParse({ ...valid, contact_phone: 'private notes' }).success).toBe(false);
    expect(CreateInquirySchema.safeParse({ ...valid, follow_up_at: '2026-10-26T10:00' }).success).toBe(false);
  });
  it('requires a validated item and explicit replay flag before displaying success', () => {
    expect(InquiryCreatedSchema.safeParse({ success: true }).success).toBe(false);
  });
});
