import { z } from 'zod';
import { InquiryOwnerSearchItemSchema, InquiryOwnerSearchRequestSchema } from './inquiry-owner-search';
import { InquiryScheduleInstantSchema } from './inquiry-schedule';

export const InquiryOwnerSearchPageItemSchema = InquiryOwnerSearchItemSchema.extend({
  created_at: InquiryScheduleInstantSchema,
}).strict();
export type InquiryOwnerSearchPageItem = z.infer<typeof InquiryOwnerSearchPageItemSchema>;

export const InquiryOwnerSearchPageCursorSchema = z.object({
  created_at: InquiryScheduleInstantSchema,
  inquiry_id: z.uuid(),
}).strict();
export type InquiryOwnerSearchPageCursor = z.infer<typeof InquiryOwnerSearchPageCursorSchema>;

export const InquiryOwnerSearchPageRequestSchema = InquiryOwnerSearchRequestSchema.extend({
  before: InquiryOwnerSearchPageCursorSchema.nullable(),
}).strict();
export type InquiryOwnerSearchPageRequest = z.infer<typeof InquiryOwnerSearchPageRequestSchema>;

function instantMicroseconds(value: string) {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
  const epochMilliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0'));
}

function tupleIsBefore(createdAt: string, inquiryId: string, before: InquiryOwnerSearchPageCursor) {
  const itemTime = instantMicroseconds(createdAt);
  const boundTime = instantMicroseconds(before.created_at);
  if (itemTime === null || boundTime === null) return false;
  return itemTime < boundTime || (itemTime === boundTime && inquiryId.toLowerCase() < before.inquiry_id.toLowerCase());
}

export const InquiryOwnerSearchPageResultSchema = z.object({
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  name: InquiryOwnerSearchRequestSchema.shape.name,
  before: InquiryOwnerSearchPageCursorSchema.nullable(),
  items: z.array(InquiryOwnerSearchPageItemSchema).max(50),
  truncated: z.boolean(),
  next_before: InquiryOwnerSearchPageCursorSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.truncated && value.items.length !== 50) {
    context.addIssue({ code: 'custom', message: 'A truncated owner search page must return the first 50 items', path: ['items'] });
  }
  if (value.truncated !== (value.next_before !== null)) {
    context.addIssue({ code: 'custom', message: 'Continuation must exist exactly when more matches were observed', path: ['next_before'] });
  }

  const identifiers = new Set<string>();
  for (let index = 0; index < value.items.length; index += 1) {
    const item = value.items[index]!;
    const identifier = item.id.toLowerCase();
    if (identifiers.has(identifier)) context.addIssue({ code: 'custom', message: 'Owner search page inquiry identifiers must be unique', path: ['items', index, 'id'] });
    identifiers.add(identifier);
    if (value.before !== null && !tupleIsBefore(item.created_at, item.id, value.before)) {
      context.addIssue({ code: 'custom', message: 'Every continued result must be strictly older than its comparison bound', path: ['items', index] });
    }
  }

  for (let index = 1; index < value.items.length; index += 1) {
    const previous = value.items[index - 1]!;
    const current = value.items[index]!;
    if (!tupleIsBefore(current.created_at, current.id, { created_at: previous.created_at, inquiry_id: previous.id })) {
      context.addIssue({ code: 'custom', message: 'Owner search page must be newest first with descending identifiers', path: ['items', index] });
    }
  }

  if (value.next_before !== null) {
    const last = value.items.at(-1);
    if (last === undefined || value.next_before.created_at !== last.created_at || value.next_before.inquiry_id.toLowerCase() !== last.id.toLowerCase()) {
      context.addIssue({ code: 'custom', message: 'Continuation must equal the last returned result tuple', path: ['next_before'] });
    }
  }
});
export type InquiryOwnerSearchPageResult = z.infer<typeof InquiryOwnerSearchPageResultSchema>;
