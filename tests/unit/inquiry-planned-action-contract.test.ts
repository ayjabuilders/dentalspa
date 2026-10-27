import { describe, expect, it } from 'vitest';
import { InquiryPlannedActionResultSchema, InquiryPlannedActionStateSchema, InquiryPlannedActionValues, SetInquiryPlannedActionSchema } from '../../packages/contracts/src';

const ids = { inquiry_id: crypto.randomUUID(), clinic_id: crypto.randomUUID(), owner_user_id: crypto.randomUUID() };

describe('inquiry planned action v1 contract', () => {
  it('starts unrecorded with an exact vocabulary version', () => {
    const state = { schema_version: 1, vocabulary_version: 1, ...ids, planned_action: null, revision: 0, updated_at: null } as const;
    expect(InquiryPlannedActionStateSchema.parse(state).planned_action).toBeNull();
    expect(InquiryPlannedActionStateSchema.safeParse({ ...state, vocabulary_version: 2 }).success).toBe(false);
    expect(InquiryPlannedActionStateSchema.safeParse({ ...state, planned_action: 'review_inquiry' }).success).toBe(false);
  });

  it('accepts only internal review intentions and rejects executable or inferred work', () => {
    for (const planned_action of [...InquiryPlannedActionValues, null]) expect(SetInquiryPlannedActionSchema.safeParse({ expected_revision: 0, planned_action }).success).toBe(true);
    for (const input of [
      { expected_revision: 0, planned_action: 'attempt_phone_contact' },
      { expected_revision: 0, planned_action: 'send_email' },
      { expected_revision: 0, planned_action: 'book_appointment' },
      { expected_revision: 0, planned_action: 'review_inquiry', due_at: '2026-10-27T09:00:00Z' },
      { expected_revision: 0, planned_action: 'review_inquiry', completed: true },
      { expected_revision: 0, planned_action: 'review_follow_up', note: 'free text' },
      { expected_revision: -1, planned_action: 'review_inquiry' },
    ]) expect(SetInquiryPlannedActionSchema.safeParse(input).success).toBe(false);
  });

  it('validates minimal receipt transitions including initial and ceiling no-ops', () => {
    const changed = { ...ids, vocabulary_version: 1, previous_planned_action: null, planned_action: 'review_inquiry', previous_revision: 0, revision: 1, changed: true, recorded_at: '2026-10-26T23:59:00Z', event_version: 1 } as const;
    expect(InquiryPlannedActionResultSchema.parse({ receipt: changed, replayed: false }).receipt).toEqual(changed);
    expect(InquiryPlannedActionResultSchema.safeParse({ receipt: { ...changed, revision: 0 }, replayed: false }).success).toBe(false);
    expect(InquiryPlannedActionResultSchema.safeParse({ receipt: { ...changed, task_id: crypto.randomUUID() }, replayed: false }).success).toBe(false);
    const initialNoOp = { ...changed, previous_planned_action: null, planned_action: null, previous_revision: 0, revision: 0, changed: false } as const;
    expect(InquiryPlannedActionResultSchema.parse({ receipt: initialNoOp, replayed: true }).replayed).toBe(true);
    const ceilingNoOp = { ...changed, previous_planned_action: 'review_follow_up', planned_action: 'review_follow_up', previous_revision: 2_147_483_647, revision: 2_147_483_647, changed: false } as const;
    expect(InquiryPlannedActionResultSchema.parse({ receipt: ceilingNoOp, replayed: false }).receipt.revision).toBe(2_147_483_647);
    expect(InquiryPlannedActionResultSchema.safeParse({ receipt: { ...ceilingNoOp, planned_action: 'review_inquiry', changed: true }, replayed: false }).success).toBe(false);
  });
});
