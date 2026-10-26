import { z } from 'zod';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

function instantMicroseconds(value: string | null) {
  if (value === null) return null;
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
  const epochMilliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0'));
}

export const InquiryScheduleHistoryItemSchema = z.object({
  previous_follow_up_at: InquiryScheduleInstantSchema.nullable(),
  follow_up_at: InquiryScheduleInstantSchema.nullable(),
  changed: z.boolean(),
  recorded_at: InquiryScheduleInstantSchema,
  event_version: z.literal(1),
}).strict().superRefine((value, context) => {
  const previous = instantMicroseconds(value.previous_follow_up_at);
  const next = instantMicroseconds(value.follow_up_at);
  if (previous !== null || next !== null) {
    if (value.changed !== (previous !== next)) context.addIssue({ code: 'custom', message: 'Changed must match the schedule transition', path: ['changed'] });
  } else if (value.changed) {
    context.addIssue({ code: 'custom', message: 'Changed must match the schedule transition', path: ['changed'] });
  }
});
export type InquiryScheduleHistoryItem = z.infer<typeof InquiryScheduleHistoryItemSchema>;

export const InquiryScheduleHistorySchema = z.object({
  inquiry_id: z.uuid(),
  items: z.array(InquiryScheduleHistoryItemSchema).max(50),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.truncated && value.items.length !== 50) {
    context.addIssue({ code: 'custom', message: 'A truncated schedule history must return the first 50 items', path: ['items'] });
  }
  for (let index = 1; index < value.items.length; index += 1) {
    const previous = instantMicroseconds(value.items[index - 1]!.recorded_at);
    const current = instantMicroseconds(value.items[index]!.recorded_at);
    if (previous !== null && current !== null && previous < current) {
      context.addIssue({ code: 'custom', message: 'Schedule history must be newest first', path: ['items', index, 'recorded_at'] });
    }
  }
});
export type InquiryScheduleHistory = z.infer<typeof InquiryScheduleHistorySchema>;
