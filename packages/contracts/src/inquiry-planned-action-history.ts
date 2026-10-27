import { z } from 'zod';
import {
  InquiryPlannedActionRevisionSchema,
  InquiryPlannedActionSchema,
  InquiryPlannedActionVocabularyVersion,
} from './inquiry-planned-action';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

function instantMicroseconds(value: string) {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
  const epochMilliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0'));
}

export const InquiryPlannedActionHistoryItemSchema = z.object({
  vocabulary_version: z.literal(InquiryPlannedActionVocabularyVersion),
  previous_planned_action: InquiryPlannedActionSchema.nullable(),
  planned_action: InquiryPlannedActionSchema.nullable(),
  previous_revision: InquiryPlannedActionRevisionSchema,
  revision: InquiryPlannedActionRevisionSchema,
  changed: z.boolean(),
  recorded_at: InquiryScheduleInstantSchema,
  event_version: z.literal(1),
}).strict().superRefine((value, context) => {
  const differs = value.previous_planned_action !== value.planned_action;
  if (value.changed !== differs) context.addIssue({ code: 'custom', message: 'Changed must match the planned-action transition', path: ['changed'] });
  if (value.previous_revision === 0 && value.previous_planned_action !== null) context.addIssue({ code: 'custom', message: 'Initial previous planned action must be empty', path: ['previous_planned_action'] });
  if ((value.changed && value.revision !== value.previous_revision + 1) || (!value.changed && value.revision !== value.previous_revision)) {
    context.addIssue({ code: 'custom', message: 'Revision must match the command outcome', path: ['revision'] });
  }
});
export type InquiryPlannedActionHistoryItem = z.infer<typeof InquiryPlannedActionHistoryItemSchema>;

export const InquiryPlannedActionHistorySchema = z.object({
  inquiry_id: z.uuid(),
  items: z.array(InquiryPlannedActionHistoryItemSchema).max(50),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.truncated && value.items.length !== 50) {
    context.addIssue({ code: 'custom', message: 'A truncated planned-action history must return the first 50 items', path: ['items'] });
  }
  for (let index = 1; index < value.items.length; index += 1) {
    const previous = instantMicroseconds(value.items[index - 1]!.recorded_at);
    const current = instantMicroseconds(value.items[index]!.recorded_at);
    if (previous !== null && current !== null && previous < current) {
      context.addIssue({ code: 'custom', message: 'Planned-action history must be newest first', path: ['items', index, 'recorded_at'] });
    }
  }
});
export type InquiryPlannedActionHistory = z.infer<typeof InquiryPlannedActionHistorySchema>;
