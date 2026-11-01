import { describe, expect, it } from 'vitest';
import { InquiryOwnerAssignmentResultSchema, SetInquiryOwnerSchema } from '../../packages/contracts/src';

const currentOwner = '1590ea9a-5d9d-4da5-8971-4fad9eed4068';
const nextOwner = '3f8a80e1-3003-42b8-8370-9a8ac63293c5';
const inquiryId = 'e7ba1c52-84f5-4a1f-9aa0-2eab628bcf35';
const clinicId = '940395f2-89ab-4e62-86ed-7215525d9aac';

describe('inquiry owner reassignment contract', () => {
  it('requires a strict compare-and-set from the observed owner to a new owner', () => {
    expect(SetInquiryOwnerSchema.parse({ expected_owner_user_id: currentOwner, owner_user_id: nextOwner })).toEqual({ expected_owner_user_id: currentOwner, owner_user_id: nextOwner });
    expect(SetInquiryOwnerSchema.safeParse({ expected_owner_user_id: currentOwner, owner_user_id: nextOwner, clinic_id: clinicId }).success).toBe(false);
    expect(SetInquiryOwnerSchema.safeParse({ expected_owner_user_id: 'not-uuid', owner_user_id: nextOwner }).success).toBe(false);
    expect(SetInquiryOwnerSchema.safeParse({ owner_user_id: nextOwner }).success).toBe(false);
  });

  it('allows an explicit no-op with an immutable replayable receipt', () => {
    const result = {
      receipt: { inquiry_id: inquiryId, clinic_id: clinicId, previous_owner_user_id: currentOwner, owner_user_id: currentOwner, changed: false, recorded_at: '2026-10-28T12:00:00Z', event_version: 1 },
      replayed: true,
    };
    expect(InquiryOwnerAssignmentResultSchema.parse(result)).toEqual(result);
    expect(InquiryOwnerAssignmentResultSchema.safeParse({ ...result, unexpected: true }).success).toBe(false);
  });
});
