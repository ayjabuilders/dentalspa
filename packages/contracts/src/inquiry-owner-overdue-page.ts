import { z } from 'zod';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';
import { InquiryWorklistItemSchema } from './inquiry-worklist';

export const InquiryOwnerOverdueCursorSchema = z.object({
  follow_up_at: InquiryScheduleInstantSchema,
  inquiry_id: z.uuid(),
}).strict();
export type InquiryOwnerOverdueCursor = z.infer<typeof InquiryOwnerOverdueCursorSchema>;

export const InquiryOwnerOverduePageRequestSchema = z.object({
  after: InquiryOwnerOverdueCursorSchema.nullable(),
}).strict();
export type InquiryOwnerOverduePageRequest = z.infer<typeof InquiryOwnerOverduePageRequestSchema>;

export const InquiryOwnerOverduePageItemSchema = InquiryWorklistItemSchema.extend({
  follow_up_at: InquiryScheduleInstantSchema,
  created_at: InquiryScheduleInstantSchema,
}).strict();
export type InquiryOwnerOverduePageItem = z.infer<typeof InquiryOwnerOverduePageItemSchema>;

function instantMicroseconds(value: string) {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
  const epochMilliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000n + BigInt(fraction.padEnd(6, '0'));
}

function compareCursor(left: InquiryOwnerOverdueCursor, right: InquiryOwnerOverdueCursor) {
  const leftTime = instantMicroseconds(left.follow_up_at);
  const rightTime = instantMicroseconds(right.follow_up_at);
  if (leftTime === null || rightTime === null) return null;
  if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
  const leftId = left.inquiry_id.toLowerCase();
  const rightId = right.inquiry_id.toLowerCase();
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}

export const InquiryOwnerOverduePageResultSchema = z.object({
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  observed_at: InquiryScheduleInstantSchema,
  after: InquiryOwnerOverdueCursorSchema.nullable(),
  items: z.array(InquiryOwnerOverduePageItemSchema).max(50),
  truncated: z.boolean(),
  next_after: InquiryOwnerOverdueCursorSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.truncated && value.items.length !== 50) {
    context.addIssue({ code: 'custom', message: 'A truncated overdue page must return exactly 50 items', path: ['items'] });
  }
  if (!value.truncated && value.next_after !== null) {
    context.addIssue({ code: 'custom', message: 'A final overdue page cannot expose a continuation', path: ['next_after'] });
  }

  const observed = instantMicroseconds(value.observed_at);
  const identifiers = new Set<string>();
  for (let index = 0; index < value.items.length; index += 1) {
    const item = value.items[index]!;
    const identifier = item.id.toLowerCase();
    if (identifiers.has(identifier)) context.addIssue({ code: 'custom', message: 'Overdue page inquiry identifiers must be unique', path: ['items', index, 'id'] });
    identifiers.add(identifier);
    if (item.clinic_id.toLowerCase() !== value.clinic_id.toLowerCase()) {
      context.addIssue({ code: 'custom', message: 'Every overdue page item must match the echoed clinic', path: ['items', index, 'clinic_id'] });
    }
    if (item.owner_user_id.toLowerCase() !== value.owner_user_id.toLowerCase()) {
      context.addIssue({ code: 'custom', message: 'Every overdue page item must match the echoed owner', path: ['items', index, 'owner_user_id'] });
    }

    const cursor = { follow_up_at: item.follow_up_at, inquiry_id: item.id };
    const itemTime = instantMicroseconds(item.follow_up_at);
    if (observed !== null && itemTime !== null && itemTime > observed) {
      context.addIssue({ code: 'custom', message: 'Every overdue page item must be overdue at observed_at', path: ['items', index, 'follow_up_at'] });
    }
    if (value.after !== null && compareCursor(cursor, value.after)! <= 0) {
      context.addIssue({ code: 'custom', message: 'Every overdue page item must be strictly after the requested cursor', path: ['items', index] });
    }
    if (index > 0) {
      const previous = value.items[index - 1]!;
      if (compareCursor(cursor, { follow_up_at: previous.follow_up_at, inquiry_id: previous.id })! <= 0) {
        context.addIssue({ code: 'custom', message: 'Overdue pages must use ascending deadline and identifier order', path: ['items', index] });
      }
    }
  }

  if (value.truncated) {
    const last = value.items.at(-1);
    if (last === undefined || value.next_after === null || compareCursor(value.next_after, { follow_up_at: last.follow_up_at, inquiry_id: last.id }) !== 0) {
      context.addIssue({ code: 'custom', message: 'A truncated overdue page must continue from its final item', path: ['next_after'] });
    }
  }
});
export type InquiryOwnerOverduePageResult = z.infer<typeof InquiryOwnerOverduePageResultSchema>;
