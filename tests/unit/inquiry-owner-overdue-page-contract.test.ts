import { describe, expect, it } from 'vitest';
import { InquiryOwnerOverduePageRequestSchema, InquiryOwnerOverduePageResultSchema } from '../../packages/contracts/src';

const clinic = '10000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000002';
const first = {
  id: '10000000-0000-4000-8000-000000000011', clinic_id: clinic, owner_user_id: owner,
  display_name: 'Demande synthétique A', source: 'phone', status: 'new',
  follow_up_at: '2026-10-27T09:00:00.000001Z', created_at: '2026-10-20T09:00:00Z',
} as const;
const second = { ...first, id: '10000000-0000-4000-8000-000000000012', display_name: 'Demande synthétique B' } as const;
const observed = '2026-10-27T10:00:00Z';
const cursor = { follow_up_at: first.follow_up_at, inquiry_id: first.id };
const result = (items: unknown[], overrides: Record<string, unknown> = {}) => ({
  clinic_id: clinic, owner_user_id: owner, observed_at: observed, after: null,
  items, truncated: false, next_after: null, ...overrides,
});

describe('inquiry owner overdue page v1 contract', () => {
  it('accepts only an explicit null or PostgreSQL-compatible tuple cursor', () => {
    expect(InquiryOwnerOverduePageRequestSchema.parse({ after: null })).toEqual({ after: null });
    expect(InquiryOwnerOverduePageRequestSchema.parse({ after: cursor })).toEqual({ after: cursor });
    for (const body of [
      {}, { after: cursor, limit: 100 }, { after: { ...cursor, owner_user_id: owner } },
      { after: { ...cursor, follow_up_at: '2026-10-27T09:00:00.0000005Z' } },
      { after: { ...cursor, follow_up_at: '0000-01-01T00:00:00Z' } },
      { after: { ...cursor, follow_up_at: '0001-01-01T00:00:00+01:00' } },
    ]) expect(InquiryOwnerOverduePageRequestSchema.safeParse(body).success).toBe(false);
  });

  it('accepts minimal overdue rows in ascending deadline and UUID order', () => {
    expect(InquiryOwnerOverduePageResultSchema.parse(result([first, second])).items).toEqual([first, second]);
    const equivalentOffset = { ...second, follow_up_at: '2026-10-27T10:00:00.000001+01:00' };
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([first, equivalentOffset])).success).toBe(true);
  });

  it('rejects non-overdue, duplicate, private, wrong-scope and misordered rows', () => {
    const letterId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    for (const value of [
      result([{ ...first, follow_up_at: '2026-10-27T10:00:00.000001Z' }]),
      result([first, first]), result([second, first]),
      result([{ ...first, id: letterId }, { ...second, id: letterId.toUpperCase() }]),
      result([{ ...first, contact_email: 'private@example.invalid' }]),
      result([{ ...first, clinic_id: owner }]), result([{ ...first, owner_user_id: clinic }]),
    ]) expect(InquiryOwnerOverduePageResultSchema.safeParse(value).success).toBe(false);
  });

  it('orders equal deadlines by normalized UUID bytes without locale dependence', () => {
    const earlier = { ...first, id: 'abcdefab-cdef-4abc-8def-abcdefabcdee' };
    const later = { ...second, id: 'abcdefab-cdef-4abc-8def-abcdefabcdef' };
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([earlier, later])).success).toBe(true);
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([later, earlier])).success).toBe(false);
  });

  it('requires every returned tuple to be strictly after the echoed cursor', () => {
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([second], { after: cursor })).success).toBe(true);
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([first], { after: cursor })).success).toBe(false);
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([{ ...first, id: '10000000-0000-4000-8000-000000000010' }], { after: cursor })).success).toBe(false);
  });

  it('requires exact 50-item continuation and a null final continuation', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => ({
      ...first, id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }));
    const next = { follow_up_at: fifty.at(-1)!.follow_up_at, inquiry_id: fifty.at(-1)!.id };
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result(fifty, { truncated: true, next_after: next })).success).toBe(true);
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([], { truncated: true, next_after: cursor })).success).toBe(false);
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result(fifty, { truncated: true, next_after: cursor })).success).toBe(false);
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([first], { next_after: cursor })).success).toBe(false);
  });

  it('fails safely on malformed instants and preserves exact scope and cursor echoes', () => {
    expect(() => InquiryOwnerOverduePageResultSchema.safeParse(result([{ ...first, follow_up_at: 'not-a-time' }]))).not.toThrow();
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([{ ...first, follow_up_at: 'not-a-time' }])).success).toBe(false);
    expect(InquiryOwnerOverduePageResultSchema.safeParse(result([second], { after: cursor })).success).toBe(true);
    const missingClinic: Record<string, unknown> = result([]);
    const missingOwner: Record<string, unknown> = result([]);
    delete missingClinic.clinic_id;
    delete missingOwner.owner_user_id;
    for (const value of [missingClinic, missingOwner, result([], { after: { ...cursor, owner_user_id: owner } })]) {
      expect(InquiryOwnerOverduePageResultSchema.safeParse(value).success).toBe(false);
    }
  });
});
