import { describe, expect, it } from 'vitest';
import {
  InquiryContactPreferenceResultSchema,
  InquiryContactPreferenceStateSchema,
  SetInquiryContactPreferenceSchema,
} from '../../packages/contracts/src';

const ids = {
  inquiry_id: crypto.randomUUID(),
  clinic_id: crypto.randomUUID(),
  owner_user_id: crypto.randomUUID(),
};

describe('inquiry contact preference v1 contract', () => {
  it('distinguishes unrecorded state from an explicitly stated absence of preference', () => {
    expect(InquiryContactPreferenceStateSchema.parse({
      schema_version: 1,
      ...ids,
      preference: null,
      revision: 0,
      updated_at: null,
    }).preference).toBeNull();

    expect(InquiryContactPreferenceStateSchema.parse({
      schema_version: 1,
      ...ids,
      preference: 'no_preference',
      revision: 1,
      updated_at: '2026-10-26T20:00:00Z',
    }).preference).toBe('no_preference');

    expect(InquiryContactPreferenceStateSchema.safeParse({
      schema_version: 1,
      ...ids,
      preference: 'phone',
      revision: 0,
      updated_at: null,
    }).success).toBe(false);
  });

  it('requires an explicit bounded value and rejects inferred authority or contact fields', () => {
    expect(SetInquiryContactPreferenceSchema.parse({ expected_revision: 0, preference: 'email' })).toEqual({ expected_revision: 0, preference: 'email' });
    expect(SetInquiryContactPreferenceSchema.parse({ expected_revision: 2, preference: null })).toEqual({ expected_revision: 2, preference: null });
    expect(SetInquiryContactPreferenceSchema.safeParse({ expected_revision: -1, preference: 'phone' }).success).toBe(false);
    expect(SetInquiryContactPreferenceSchema.safeParse({ expected_revision: 0, preference: 'whatsapp' }).success).toBe(false);
    for (const extra of [{ consent: true }, { contact_phone: '+212600000000' }, { source: 'phone' }, { owner_user_id: ids.owner_user_id }]) {
      expect(SetInquiryContactPreferenceSchema.safeParse({ expected_revision: 0, preference: 'phone', ...extra }).success).toBe(false);
    }
  });

  it('validates revision and changed invariants on minimal immutable receipts', () => {
    const changed = {
      ...ids,
      previous_preference: null,
      preference: 'phone',
      previous_revision: 0,
      revision: 1,
      changed: true,
      recorded_at: '2026-10-26T20:00:00Z',
      event_version: 1,
    } as const;
    expect(InquiryContactPreferenceResultSchema.parse({ receipt: changed, replayed: false }).receipt).toEqual(changed);
    expect(InquiryContactPreferenceResultSchema.safeParse({ receipt: { ...changed, revision: 0 }, replayed: false }).success).toBe(false);
    expect(InquiryContactPreferenceResultSchema.safeParse({ receipt: { ...changed, consent: true }, replayed: false }).success).toBe(false);

    const noChange = {
      ...changed,
      previous_preference: 'phone',
      preference: 'phone',
      previous_revision: 1,
      revision: 1,
      changed: false,
    } as const;
    expect(InquiryContactPreferenceResultSchema.parse({ receipt: noChange, replayed: true }).replayed).toBe(true);

    const initialNoChange = {
      ...changed,
      previous_preference: null,
      preference: null,
      previous_revision: 0,
      revision: 0,
      changed: false,
    } as const;
    expect(InquiryContactPreferenceResultSchema.parse({ receipt: initialNoChange, replayed: false }).receipt.revision).toBe(0);
    expect(InquiryContactPreferenceResultSchema.safeParse({ receipt: { ...initialNoChange, previous_preference: 'phone' }, replayed: false }).success).toBe(false);
    expect(InquiryContactPreferenceResultSchema.safeParse({ receipt: { ...initialNoChange, preference: 'phone' }, replayed: false }).success).toBe(false);

    const maxRevisionNoChange = {
      ...changed,
      previous_preference: 'email',
      preference: 'email',
      previous_revision: 2_147_483_647,
      revision: 2_147_483_647,
      changed: false,
    } as const;
    expect(InquiryContactPreferenceResultSchema.parse({ receipt: maxRevisionNoChange, replayed: false }).receipt.revision).toBe(2_147_483_647);
    expect(InquiryContactPreferenceResultSchema.safeParse({ receipt: { ...maxRevisionNoChange, preference: 'phone', changed: true }, replayed: false }).success).toBe(false);
  });
});
