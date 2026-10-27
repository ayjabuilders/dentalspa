import { z } from 'zod';
import {
  InquiryPlannedActionRevisionSchema,
  InquiryPlannedActionSchema,
  InquiryPlannedActionVocabularyVersion,
} from './inquiry-planned-action';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

export const InquiryPlannedActionWorklistItemSchema = z.object({
  inquiry_id: z.uuid(),
  display_name: z.string().min(1).max(120),
  vocabulary_version: z.literal(InquiryPlannedActionVocabularyVersion),
  planned_action: InquiryPlannedActionSchema,
  revision: InquiryPlannedActionRevisionSchema.min(1),
  updated_at: InquiryScheduleInstantSchema,
}).strict();
export type InquiryPlannedActionWorklistItem = z.infer<typeof InquiryPlannedActionWorklistItemSchema>;

function instantNanoseconds(value: string) {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
  const epochMilliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000_000n + BigInt(fraction.slice(0, 9).padEnd(9, '0'));
}

export const InquiryPlannedActionWorklistSchema = z.object({
  schema_version: z.literal(1),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  observed_at: InquiryScheduleInstantSchema,
  items: z.array(InquiryPlannedActionWorklistItemSchema).max(50),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.truncated && value.items.length !== 50) {
    context.addIssue({ code: 'custom', message: 'A truncated planned-action worklist must return the first 50 items', path: ['items'] });
  }

  const identifiers = new Set<string>();
  for (let index = 0; index < value.items.length; index += 1) {
    const identifier = value.items[index]!.inquiry_id.toLowerCase();
    if (identifiers.has(identifier)) {
      context.addIssue({ code: 'custom', message: 'Planned-action worklist inquiry identifiers must be unique', path: ['items', index, 'inquiry_id'] });
    }
    identifiers.add(identifier);
  }

  for (let index = 1; index < value.items.length; index += 1) {
    const previous = value.items[index - 1]!;
    const current = value.items[index]!;
    const previousTime = instantNanoseconds(previous.updated_at);
    const currentTime = instantNanoseconds(current.updated_at);
    if (previousTime !== null && currentTime !== null && (previousTime < currentTime || (previousTime === currentTime && previous.inquiry_id.toLowerCase() < current.inquiry_id.toLowerCase()))) {
      context.addIssue({ code: 'custom', message: 'Planned-action worklist must be newest first with descending identifiers', path: ['items', index] });
    }
  }
});
export type InquiryPlannedActionWorklist = z.infer<typeof InquiryPlannedActionWorklistSchema>;
