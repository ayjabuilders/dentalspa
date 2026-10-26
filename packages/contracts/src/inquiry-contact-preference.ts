import { z } from 'zod';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

export const InquiryContactPreferenceSchema = z.enum(['phone', 'email', 'no_preference']);
export type InquiryContactPreference = z.infer<typeof InquiryContactPreferenceSchema>;

export const InquiryContactPreferenceRevisionSchema = z.number().int().min(0).max(2_147_483_647);

export const InquiryContactPreferenceStateSchema = z.object({
  schema_version: z.literal(1),
  inquiry_id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  preference: InquiryContactPreferenceSchema.nullable(),
  revision: InquiryContactPreferenceRevisionSchema,
  updated_at: InquiryScheduleInstantSchema.nullable(),
}).strict().superRefine((state, context) => {
  if (state.revision === 0 && (state.preference !== null || state.updated_at !== null)) {
    context.addIssue({ code: 'custom', message: 'Initial contact preference state must be empty' });
  }
  if (state.revision > 0 && state.updated_at === null) {
    context.addIssue({ code: 'custom', message: 'Changed contact preference state must have an update time' });
  }
});
export type InquiryContactPreferenceState = z.infer<typeof InquiryContactPreferenceStateSchema>;

export const SetInquiryContactPreferenceSchema = z.object({
  expected_revision: InquiryContactPreferenceRevisionSchema,
  preference: InquiryContactPreferenceSchema.nullable(),
}).strict();
export type SetInquiryContactPreference = z.infer<typeof SetInquiryContactPreferenceSchema>;

export const InquiryContactPreferenceReceiptSchema = z.object({
  inquiry_id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  previous_preference: InquiryContactPreferenceSchema.nullable(),
  preference: InquiryContactPreferenceSchema.nullable(),
  previous_revision: InquiryContactPreferenceRevisionSchema,
  revision: InquiryContactPreferenceRevisionSchema,
  changed: z.boolean(),
  recorded_at: InquiryScheduleInstantSchema,
  event_version: z.literal(1),
}).strict().superRefine((receipt, context) => {
  const valuesDiffer = receipt.previous_preference !== receipt.preference;
  const revisionChanged = receipt.revision === receipt.previous_revision + 1;
  const revisionUnchanged = receipt.revision === receipt.previous_revision;
  if (receipt.previous_revision === 0 && receipt.previous_preference !== null) {
    context.addIssue({ code: 'custom', message: 'Initial previous contact preference must be empty' });
  }
  if (receipt.revision === 0 && receipt.preference !== null) {
    context.addIssue({ code: 'custom', message: 'Initial resulting contact preference must be empty' });
  }
  if (receipt.changed !== valuesDiffer) {
    context.addIssue({ code: 'custom', message: 'Changed must match the preference transition' });
  }
  if ((receipt.changed && !revisionChanged) || (!receipt.changed && !revisionUnchanged)) {
    context.addIssue({ code: 'custom', message: 'Revision must match the command outcome' });
  }
});
export type InquiryContactPreferenceReceipt = z.infer<typeof InquiryContactPreferenceReceiptSchema>;

export const InquiryContactPreferenceResultSchema = z.object({
  receipt: InquiryContactPreferenceReceiptSchema,
  replayed: z.boolean(),
}).strict();
export type InquiryContactPreferenceResult = z.infer<typeof InquiryContactPreferenceResultSchema>;
