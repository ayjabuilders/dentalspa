import { z } from 'zod';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

export const InquiryPlannedActionVocabularyVersion = 1 as const;
export const InquiryPlannedActionValues = ['review_inquiry', 'review_follow_up'] as const;
export const InquiryPlannedActionSchema = z.enum(InquiryPlannedActionValues);
export type InquiryPlannedAction = z.infer<typeof InquiryPlannedActionSchema>;
export const InquiryPlannedActionRevisionSchema = z.number().int().min(0).max(2_147_483_647);

export const InquiryPlannedActionStateSchema = z.object({
  schema_version: z.literal(1),
  vocabulary_version: z.literal(InquiryPlannedActionVocabularyVersion),
  inquiry_id: z.uuid(), clinic_id: z.uuid(), owner_user_id: z.uuid(),
  planned_action: InquiryPlannedActionSchema.nullable(),
  revision: InquiryPlannedActionRevisionSchema,
  updated_at: InquiryScheduleInstantSchema.nullable(),
}).strict().superRefine((state, context) => {
  if (state.revision === 0 && (state.planned_action !== null || state.updated_at !== null)) context.addIssue({ code: 'custom', message: 'Initial planned action state must be empty' });
  if (state.revision > 0 && state.updated_at === null) context.addIssue({ code: 'custom', message: 'Changed planned action state must have an update time' });
});
export type InquiryPlannedActionState = z.infer<typeof InquiryPlannedActionStateSchema>;

export const SetInquiryPlannedActionSchema = z.object({
  expected_revision: InquiryPlannedActionRevisionSchema,
  planned_action: InquiryPlannedActionSchema.nullable(),
}).strict();
export type SetInquiryPlannedAction = z.infer<typeof SetInquiryPlannedActionSchema>;

export const InquiryPlannedActionReceiptSchema = z.object({
  inquiry_id: z.uuid(), clinic_id: z.uuid(), owner_user_id: z.uuid(),
  vocabulary_version: z.literal(InquiryPlannedActionVocabularyVersion),
  previous_planned_action: InquiryPlannedActionSchema.nullable(),
  planned_action: InquiryPlannedActionSchema.nullable(),
  previous_revision: InquiryPlannedActionRevisionSchema,
  revision: InquiryPlannedActionRevisionSchema,
  changed: z.boolean(), recorded_at: InquiryScheduleInstantSchema, event_version: z.literal(1),
}).strict().superRefine((receipt, context) => {
  const differs = receipt.previous_planned_action !== receipt.planned_action;
  if (receipt.previous_revision === 0 && receipt.previous_planned_action !== null) context.addIssue({ code: 'custom', message: 'Initial previous planned action must be empty' });
  if (receipt.revision === 0 && receipt.planned_action !== null) context.addIssue({ code: 'custom', message: 'Initial resulting planned action must be empty' });
  if (receipt.changed !== differs) context.addIssue({ code: 'custom', message: 'Changed must match the planned action transition' });
  if ((receipt.changed && receipt.revision !== receipt.previous_revision + 1) || (!receipt.changed && receipt.revision !== receipt.previous_revision)) context.addIssue({ code: 'custom', message: 'Revision must match the command outcome' });
});
export type InquiryPlannedActionReceipt = z.infer<typeof InquiryPlannedActionReceiptSchema>;

export const InquiryPlannedActionResultSchema = z.object({ receipt: InquiryPlannedActionReceiptSchema, replayed: z.boolean() }).strict();
export type InquiryPlannedActionResult = z.infer<typeof InquiryPlannedActionResultSchema>;
