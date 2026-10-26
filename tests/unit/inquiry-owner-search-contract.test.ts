import { describe, expect, it } from 'vitest';
import { InquiryOwnerSearchRequestSchema, InquiryOwnerSearchResultSchema } from '../../packages/contracts/src';

const clinic = '10000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000002';
const newer = { id: '10000000-0000-4000-8000-000000000012', display_name: 'Lina Synthétique', source: 'phone', status: 'new', follow_up_at: null, created_at: '2026-10-26T19:00:00.000002Z' } as const;
const older = { ...newer, id: '10000000-0000-4000-8000-000000000011', created_at: '2026-10-26T20:00:00.000001+01:00' };

describe('inquiry owner search v1 contract', () => {
  it('requires canonical Unicode-code-point bounds and rejects extra search dimensions', () => {
    expect(InquiryOwnerSearchRequestSchema.parse({ name: 'Lina' })).toEqual({ name: 'Lina' });
    expect(InquiryOwnerSearchRequestSchema.safeParse({ name: '😀' }).success).toBe(false);
    expect(InquiryOwnerSearchRequestSchema.safeParse({ name: '😀'.repeat(41) }).success).toBe(true);
    for (const body of [{ name: ' Lina ' }, { name: 'L' }, { name: 'x'.repeat(81) }, { name: 'Li\tna' }, { name: 'Lina', source: 'phone' }, { name: 'Lina', contact_email: 'private@example.invalid' }]) {
      expect(InquiryOwnerSearchRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('accepts a minimal bounded scope-echoed result in exact order', () => {
    expect(InquiryOwnerSearchResultSchema.parse({ clinic_id: clinic, owner_user_id: owner, items: [newer, older], truncated: false }).items).toEqual([newer, older]);
  });

  it('rejects contact data, match scores, clinic/owner fields in items and wrong order', () => {
    for (const extra of [{ contact_phone: '+212000000000' }, { match_score: 1 }, { clinic_id: clinic }, { owner_user_id: owner }]) {
      expect(InquiryOwnerSearchResultSchema.safeParse({ clinic_id: clinic, owner_user_id: owner, items: [{ ...newer, ...extra }], truncated: false }).success).toBe(false);
    }
    expect(InquiryOwnerSearchResultSchema.safeParse({ clinic_id: clinic, owner_user_id: owner, items: [older, newer], truncated: false }).success).toBe(false);
  });

  it('uses descending UUID as the deterministic equal-time tie-break', () => {
    const sameTimeOlderId = { ...newer, id: older.id };
    expect(InquiryOwnerSearchResultSchema.safeParse({ clinic_id: clinic, owner_user_id: owner, items: [newer, sameTimeOlderId], truncated: false }).success).toBe(true);
    expect(InquiryOwnerSearchResultSchema.safeParse({ clinic_id: clinic, owner_user_id: owner, items: [sameTimeOlderId, newer], truncated: false }).success).toBe(false);
  });

  it('rejects duplicate inquiry identifiers before rendering or counting results', () => {
    expect(InquiryOwnerSearchResultSchema.safeParse({ clinic_id: clinic, owner_user_id: owner, items: [newer, newer], truncated: false }).success).toBe(false);
  });

  it('requires exactly 50 results for an explicit partial response and fails safely on malformed time', () => {
    expect(InquiryOwnerSearchResultSchema.safeParse({ clinic_id: clinic, owner_user_id: owner, items: [], truncated: true }).success).toBe(false);
    const fifty = Array.from({ length: 50 }, (_, index) => ({ ...newer, id: `10000000-0000-4000-8000-${String(50 - index).padStart(12, '0')}` }));
    expect(InquiryOwnerSearchResultSchema.safeParse({ clinic_id: clinic, owner_user_id: owner, items: fifty, truncated: true }).success).toBe(true);
    const malformed = { clinic_id: clinic, owner_user_id: owner, items: [{ ...newer, created_at: 'not-a-time' }], truncated: false };
    expect(() => InquiryOwnerSearchResultSchema.safeParse(malformed)).not.toThrow();
    expect(InquiryOwnerSearchResultSchema.safeParse(malformed).success).toBe(false);
  });
});
