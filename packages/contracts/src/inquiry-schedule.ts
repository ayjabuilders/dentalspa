import { z } from 'zod';

export const InquiryScheduleInstantSchema = z.iso.datetime({ offset: true }).refine(value => {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  if (fraction.length > 6) return false;
  const instant = new Date(value);
  return /^(?!0000)\d{4}-/.test(value) && Number.isFinite(instant.getTime()) && /^(?!0000)\d{4}-/.test(instant.toISOString());
}, 'Schedule instants must preserve at most PostgreSQL microseconds inside the four-digit UTC range');

export const SetInquiryScheduleSchema = z.object({
  expected_follow_up_at: InquiryScheduleInstantSchema.nullable(),
  follow_up_at: InquiryScheduleInstantSchema.nullable(),
}).strict();
export type SetInquirySchedule = z.infer<typeof SetInquiryScheduleSchema>;

export const InquiryScheduleReceiptSchema = z.object({
  inquiry_id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  previous_follow_up_at: InquiryScheduleInstantSchema.nullable(),
  follow_up_at: InquiryScheduleInstantSchema.nullable(),
  changed: z.boolean(),
  recorded_at: InquiryScheduleInstantSchema,
  event_version: z.literal(1),
}).strict();
export type InquiryScheduleReceipt = z.infer<typeof InquiryScheduleReceiptSchema>;

export const InquiryScheduleResultSchema = z.object({
  receipt: InquiryScheduleReceiptSchema,
  replayed: z.boolean(),
}).strict();
export type InquiryScheduleResult = z.infer<typeof InquiryScheduleResultSchema>;
