import { describe, expect, it } from 'vitest';
import { InquiryOwnerSearchPageRequestSchema, InquiryOwnerSearchPageResultSchema } from '../../packages/contracts/src';

const clinic = '10000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000002';
const newer = { id: '10000000-0000-4000-8000-000000000012', display_name: 'Lina Synthétique', source: 'phone', status: 'new', follow_up_at: null, created_at: '2026-10-27T02:00:00.000002Z' } as const;
const older = { ...newer, id: '10000000-0000-4000-8000-000000000011', created_at: '2026-10-27T03:00:00.000001+01:00' } as const;
const request = { name: 'Lina', before: null } as const;
const result = (items: unknown[], truncated = false, nextBefore: unknown = null, before: unknown = null) => ({ clinic_id: clinic, owner_user_id: owner, name: 'Lina', before, items, truncated, next_before: nextBefore });

describe('inquiry owner search page v1 contract', () => {
  it('requires an explicit null or strict tuple comparison bound', () => {
    expect(InquiryOwnerSearchPageRequestSchema.parse(request)).toEqual(request);
    const cursor = { created_at: newer.created_at, inquiry_id: newer.id };
    expect(InquiryOwnerSearchPageRequestSchema.parse({ name: 'Lina', before: cursor }).before).toEqual(cursor);
    for (const body of [{ name: 'Lina' }, { name: 'Lina', before: {} }, { name: 'Lina', before: { ...cursor, owner_user_id: owner } }, { name: 'Lina', before: { ...cursor, created_at: '2026-10-27T02:00:00.0000005Z' } }, { name: 'Lina', before: { ...cursor, created_at: '0000-01-01T00:00:00Z' } }, { name: 'Lina', before: { ...cursor, created_at: '0001-01-01T00:00:00+14:00' } }, { name: ' Lina ', before: null }, { name: 'Lina', before: null, source: 'phone' }]) {
      expect(InquiryOwnerSearchPageRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('accepts a minimal first page in exact newest-first order', () => {
    expect(InquiryOwnerSearchPageResultSchema.parse(result([newer, older])).items).toEqual([newer, older]);
  });

  it('requires each continued result to be strictly below the echoed bound', () => {
    const before = { created_at: newer.created_at, inquiry_id: newer.id };
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([older], false, null, before)).success).toBe(true);
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([newer], false, null, before)).success).toBe(false);
    const sameTimeLower = { ...newer, id: older.id };
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([sameTimeLower], false, null, before)).success).toBe(true);
    const equivalentOffsetBound = { created_at: '2026-10-27T03:00:00.000002+01:00', inquiry_id: newer.id };
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([older], false, null, equivalentOffsetBound)).success).toBe(true);
  });

  it('binds continuation presence and value to an exact 50-item returned page', () => {
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([], true, { created_at: newer.created_at, inquiry_id: newer.id })).success).toBe(false);
    const fifty = Array.from({ length: 50 }, (_, index) => ({ ...newer, id: `10000000-0000-4000-8000-${String(50 - index).padStart(12, '0')}` }));
    const last = fifty.at(-1)!;
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result(fifty, true, { created_at: last.created_at, inquiry_id: last.id })).success).toBe(true);
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result(fifty, true, { created_at: last.created_at, inquiry_id: newer.id })).success).toBe(false);
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([newer], false, { created_at: newer.created_at, inquiry_id: newer.id })).success).toBe(false);
  });

  it('rejects duplicate, misordered, private and malformed trusted results', () => {
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([newer, newer])).success).toBe(false);
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([older, newer])).success).toBe(false);
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([{ ...newer, contact_phone: '+212000000000' }])).success).toBe(false);
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([{ ...newer, created_at: '2026-10-27T02:00:00.0000005Z' }])).success).toBe(false);
    expect(InquiryOwnerSearchPageResultSchema.safeParse({ ...result([]), owner_user_id: undefined }).success).toBe(false);
    expect(() => InquiryOwnerSearchPageResultSchema.safeParse(result([{ ...newer, created_at: 'not-a-time' }]))).not.toThrow();
    expect(InquiryOwnerSearchPageResultSchema.safeParse(result([{ ...newer, created_at: 'not-a-time' }])).success).toBe(false);
  });
});
