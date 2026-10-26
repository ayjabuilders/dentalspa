import { z } from 'zod';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

export const InquiryCommunicationLanguageSchema = z.enum(['fr', 'ar', 'en', 'other', 'no_preference']);
export type InquiryCommunicationLanguage = z.infer<typeof InquiryCommunicationLanguageSchema>;

export const InquiryCommunicationLanguageRevisionSchema = z.number().int().min(0).max(2_147_483_647);

export const InquiryCommunicationLanguageStateSchema = z.object({
  schema_version: z.literal(1),
  inquiry_id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  language: InquiryCommunicationLanguageSchema.nullable(),
  revision: InquiryCommunicationLanguageRevisionSchema,
  updated_at: InquiryScheduleInstantSchema.nullable(),
}).strict().superRefine((state, context) => {
  if (state.revision === 0 && (state.language !== null || state.updated_at !== null)) {
    context.addIssue({ code: 'custom', message: 'Initial communication language state must be empty' });
  }
  if (state.revision > 0 && state.updated_at === null) {
    context.addIssue({ code: 'custom', message: 'Changed communication language state must have an update time' });
  }
});
export type InquiryCommunicationLanguageState = z.infer<typeof InquiryCommunicationLanguageStateSchema>;

export const SetInquiryCommunicationLanguageSchema = z.object({
  expected_revision: InquiryCommunicationLanguageRevisionSchema,
  language: InquiryCommunicationLanguageSchema.nullable(),
}).strict();
export type SetInquiryCommunicationLanguage = z.infer<typeof SetInquiryCommunicationLanguageSchema>;

export const InquiryCommunicationLanguageReceiptSchema = z.object({
  inquiry_id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  previous_language: InquiryCommunicationLanguageSchema.nullable(),
  language: InquiryCommunicationLanguageSchema.nullable(),
  previous_revision: InquiryCommunicationLanguageRevisionSchema,
  revision: InquiryCommunicationLanguageRevisionSchema,
  changed: z.boolean(),
  recorded_at: InquiryScheduleInstantSchema,
  event_version: z.literal(1),
}).strict().superRefine((receipt, context) => {
  const valuesDiffer = receipt.previous_language !== receipt.language;
  const revisionChanged = receipt.revision === receipt.previous_revision + 1;
  const revisionUnchanged = receipt.revision === receipt.previous_revision;
  if (receipt.previous_revision === 0 && receipt.previous_language !== null) {
    context.addIssue({ code: 'custom', message: 'Initial previous communication language must be empty' });
  }
  if (receipt.revision === 0 && receipt.language !== null) {
    context.addIssue({ code: 'custom', message: 'Initial resulting communication language must be empty' });
  }
  if (receipt.changed !== valuesDiffer) {
    context.addIssue({ code: 'custom', message: 'Changed must match the communication language transition' });
  }
  if ((receipt.changed && !revisionChanged) || (!receipt.changed && !revisionUnchanged)) {
    context.addIssue({ code: 'custom', message: 'Revision must match the command outcome' });
  }
});
export type InquiryCommunicationLanguageReceipt = z.infer<typeof InquiryCommunicationLanguageReceiptSchema>;

export const InquiryCommunicationLanguageResultSchema = z.object({
  receipt: InquiryCommunicationLanguageReceiptSchema,
  replayed: z.boolean(),
}).strict();
export type InquiryCommunicationLanguageResult = z.infer<typeof InquiryCommunicationLanguageResultSchema>;
