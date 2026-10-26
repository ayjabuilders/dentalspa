import { describe, expect, it } from 'vitest';
import {
  InquiryCommunicationLanguageResultSchema,
  InquiryCommunicationLanguageStateSchema,
  SetInquiryCommunicationLanguageSchema,
} from '../../packages/contracts/src';

const ids = {
  inquiry_id: crypto.randomUUID(),
  clinic_id: crypto.randomUUID(),
  owner_user_id: crypto.randomUUID(),
};

describe('inquiry communication language v1 contract', () => {
  it('distinguishes unrecorded state from an explicitly stated absence of preference', () => {
    expect(InquiryCommunicationLanguageStateSchema.parse({ schema_version: 1, ...ids, language: null, revision: 0, updated_at: null }).language).toBeNull();
    expect(InquiryCommunicationLanguageStateSchema.parse({ schema_version: 1, ...ids, language: 'no_preference', revision: 1, updated_at: '2026-10-26T22:00:00Z' }).language).toBe('no_preference');
    expect(InquiryCommunicationLanguageStateSchema.safeParse({ schema_version: 1, ...ids, language: 'fr', revision: 0, updated_at: null }).success).toBe(false);
  });

  it('allows only explicit bounded administrative values and rejects inference or free text', () => {
    for (const language of ['fr', 'ar', 'en', 'other', 'no_preference', null]) {
      expect(SetInquiryCommunicationLanguageSchema.safeParse({ expected_revision: 0, language }).success).toBe(true);
    }
    for (const input of [
      { expected_revision: 0, language: 'darija' },
      { expected_revision: -1, language: 'fr' },
      { expected_revision: 0, language: 'fr', locale: 'fr-MA' },
      { expected_revision: 0, language: 'other', language_label: 'private free text' },
      { expected_revision: 0, language: 'ar', interpreter_required: true },
      { expected_revision: 0, language: 'en', consent: true },
    ]) expect(SetInquiryCommunicationLanguageSchema.safeParse(input).success).toBe(false);
  });

  it('validates minimal receipt transitions including initial and ceiling no-ops', () => {
    const changed = { ...ids, previous_language: null, language: 'fr', previous_revision: 0, revision: 1, changed: true, recorded_at: '2026-10-26T22:00:00Z', event_version: 1 } as const;
    expect(InquiryCommunicationLanguageResultSchema.parse({ receipt: changed, replayed: false }).receipt).toEqual(changed);
    expect(InquiryCommunicationLanguageResultSchema.safeParse({ receipt: { ...changed, revision: 0 }, replayed: false }).success).toBe(false);
    expect(InquiryCommunicationLanguageResultSchema.safeParse({ receipt: { ...changed, consent: true }, replayed: false }).success).toBe(false);
    const initialNoOp = { ...changed, previous_language: null, language: null, previous_revision: 0, revision: 0, changed: false } as const;
    expect(InquiryCommunicationLanguageResultSchema.parse({ receipt: initialNoOp, replayed: true }).replayed).toBe(true);
    expect(InquiryCommunicationLanguageResultSchema.safeParse({ receipt: { ...initialNoOp, previous_language: 'fr' }, replayed: false }).success).toBe(false);
    const ceilingNoOp = { ...changed, previous_language: 'en', language: 'en', previous_revision: 2_147_483_647, revision: 2_147_483_647, changed: false } as const;
    expect(InquiryCommunicationLanguageResultSchema.parse({ receipt: ceilingNoOp, replayed: false }).receipt.revision).toBe(2_147_483_647);
    expect(InquiryCommunicationLanguageResultSchema.safeParse({ receipt: { ...ceilingNoOp, language: 'fr', changed: true }, replayed: false }).success).toBe(false);
  });
});
