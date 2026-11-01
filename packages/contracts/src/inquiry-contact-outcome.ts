import { z } from 'zod';

// `not_attempted` is a display-only baseline, never a persisted event.
export const InquiryContactOutcomeSchema = z.enum([
  'attempted_no_answer',
  'reached',
  'requested_callback',
  'declined',
  'unable_to_proceed',
]);
export type InquiryContactOutcome = z.infer<typeof InquiryContactOutcomeSchema>;

export const RecordInquiryContactOutcomeSchema = z.object({
  outcome: InquiryContactOutcomeSchema,
}).strict();
export type RecordInquiryContactOutcome = z.infer<typeof RecordInquiryContactOutcomeSchema>;

export const InquiryContactOutcomeEventSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  inquiry_id: z.uuid(),
  outcome: InquiryContactOutcomeSchema,
  recorded_at: z.iso.datetime({ offset: true }),
  event_version: z.literal(1),
}).strict();
export type InquiryContactOutcomeEvent = z.infer<typeof InquiryContactOutcomeEventSchema>;

export const InquiryContactOutcomeListSchema = z.object({
  clinic_id: z.uuid(),
  inquiry_id: z.uuid(),
  items: z.array(InquiryContactOutcomeEventSchema).max(50),
  truncated: z.boolean(),
}).strict();
export type InquiryContactOutcomeList = z.infer<typeof InquiryContactOutcomeListSchema>;

export const InquiryContactOutcomeRecordedSchema = z.object({
  item: InquiryContactOutcomeEventSchema,
  replayed: z.boolean(),
}).strict();
export type InquiryContactOutcomeRecorded = z.infer<typeof InquiryContactOutcomeRecordedSchema>;
