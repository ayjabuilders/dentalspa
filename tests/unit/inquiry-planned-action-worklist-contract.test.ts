import { describe, expect, it } from 'vitest';
import { InquiryPlannedActionWorklistSchema } from '../../packages/contracts/src';

const clinic = '10000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000002';
const newer = {
  inquiry_id: '10000000-0000-4000-8000-000000000012',
  display_name: 'Lina Synthétique',
  vocabulary_version: 1,
  planned_action: 'review_inquiry',
  revision: 2,
  updated_at: '2026-10-26T19:00:00.000002Z',
} as const;
const older = {
  ...newer,
  inquiry_id: '10000000-0000-4000-8000-000000000011',
  planned_action: 'review_follow_up',
  revision: 1,
  updated_at: '2026-10-26T20:00:00.000001+01:00',
} as const;

const result = (items: unknown[], truncated = false) => ({
  schema_version: 1,
  clinic_id: clinic,
  owner_user_id: owner,
  observed_at: '2026-10-26T19:01:00Z',
  items,
  truncated,
});

describe('inquiry planned-action worklist v1 contract', () => {
  it('accepts the minimal current-owner projection in exact deterministic order', () => {
    expect(InquiryPlannedActionWorklistSchema.parse(result([newer, older])).items).toEqual([newer, older]);
  });

  it('rejects null plans, initial revisions, wrong vocabulary and private or executable-task fields', () => {
    for (const item of [
      { ...newer, planned_action: null },
      { ...newer, revision: 0 },
      { ...newer, vocabulary_version: 2 },
      { ...newer, contact_phone: '+212000000000' },
      { ...newer, actor_user_id: owner },
      { ...newer, due_at: newer.updated_at },
      { ...newer, completed: false },
      { ...newer, priority: 'high' },
    ]) expect(InquiryPlannedActionWorklistSchema.safeParse(result([item])).success).toBe(false);
  });

  it('requires descending update time and descending inquiry ID as the equal-time tie-break', () => {
    expect(InquiryPlannedActionWorklistSchema.safeParse(result([older, newer])).success).toBe(false);
    const sameTimeOlderId = { ...newer, inquiry_id: older.inquiry_id };
    expect(InquiryPlannedActionWorklistSchema.safeParse(result([newer, sameTimeOlderId])).success).toBe(true);
    expect(InquiryPlannedActionWorklistSchema.safeParse(result([sameTimeOlderId, newer])).success).toBe(false);
  });

  it('rejects duplicate inquiry identifiers and malformed trusted timestamps safely', () => {
    expect(InquiryPlannedActionWorklistSchema.safeParse(result([newer, newer])).success).toBe(false);
    const mixedCaseId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    expect(InquiryPlannedActionWorklistSchema.safeParse(result([
      { ...newer, inquiry_id: mixedCaseId },
      { ...newer, inquiry_id: mixedCaseId.toUpperCase() },
    ])).success).toBe(false);
    expect(() => InquiryPlannedActionWorklistSchema.safeParse(result([{ ...newer, updated_at: 'not-a-time' }]))).not.toThrow();
    expect(InquiryPlannedActionWorklistSchema.safeParse(result([{ ...newer, updated_at: 'not-a-time' }])).success).toBe(false);
  });

  it('requires explicit scope echoes for the API and client to compare with verified context', () => {
    const valid = InquiryPlannedActionWorklistSchema.parse(result([]));
    expect(valid.clinic_id).toBe(clinic);
    expect(valid.owner_user_id).toBe(owner);
    const missingClinic: Record<string, unknown> = { ...result([]) };
    const missingOwner: Record<string, unknown> = { ...result([]) };
    delete missingClinic.clinic_id;
    delete missingOwner.owner_user_id;
    expect(InquiryPlannedActionWorklistSchema.safeParse(missingClinic).success).toBe(false);
    expect(InquiryPlannedActionWorklistSchema.safeParse(missingOwner).success).toBe(false);
  });

  it('requires exactly 50 returned items when the list reports truncation', () => {
    expect(InquiryPlannedActionWorklistSchema.safeParse(result([], true)).success).toBe(false);
    const fifty = Array.from({ length: 50 }, (_, index) => ({
      ...newer,
      inquiry_id: `10000000-0000-4000-8000-${String(50 - index).padStart(12, '0')}`,
    }));
    expect(InquiryPlannedActionWorklistSchema.safeParse(result(fifty, true)).success).toBe(true);
  });
});
