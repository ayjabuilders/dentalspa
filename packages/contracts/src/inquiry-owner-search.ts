import { z } from 'zod';
import { IntakeSourceSchema } from './intake';

export const InquiryOwnerSearchRequestSchema = z.object({
  name: z.string().refine(value => {
    const length = Array.from(value).length;
    return value === value.replace(/^ +| +$/gu, '') && length >= 2 && length <= 80 && !/[\u0000-\u001f\u007f]/u.test(value);
  }, 'Name search must be canonical U+0020-trimmed text of 2–80 Unicode code points without controls'),
}).strict();
export type InquiryOwnerSearchRequest = z.infer<typeof InquiryOwnerSearchRequestSchema>;

export const InquiryOwnerSearchItemSchema = z.object({
  id: z.uuid(),
  display_name: z.string().min(1).max(120),
  source: IntakeSourceSchema,
  status: z.literal('new'),
  follow_up_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
}).strict();
export type InquiryOwnerSearchItem = z.infer<typeof InquiryOwnerSearchItemSchema>;

function instantNanoseconds(value: string) {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
  const epochMilliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000_000n + BigInt(fraction.slice(0, 9).padEnd(9, '0'));
}

export const InquiryOwnerSearchResultSchema = z.object({
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  items: z.array(InquiryOwnerSearchItemSchema).max(50),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.truncated && value.items.length !== 50) {
    context.addIssue({ code: 'custom', message: 'A truncated owner search must return the first 50 items', path: ['items'] });
  }
  const identifiers = new Set<string>();
  for (let index = 0; index < value.items.length; index += 1) {
    const identifier = value.items[index]!.id.toLowerCase();
    if (identifiers.has(identifier)) context.addIssue({ code: 'custom', message: 'Owner search inquiry identifiers must be unique', path: ['items', index, 'id'] });
    identifiers.add(identifier);
  }
  for (let index = 1; index < value.items.length; index += 1) {
    const previous = value.items[index - 1]!;
    const current = value.items[index]!;
    const previousTime = instantNanoseconds(previous.created_at);
    const currentTime = instantNanoseconds(current.created_at);
    if (previousTime !== null && currentTime !== null && (previousTime < currentTime || (previousTime === currentTime && previous.id.toLowerCase() < current.id.toLowerCase()))) {
      context.addIssue({ code: 'custom', message: 'Owner search must be newest first with descending identifiers', path: ['items', index] });
    }
  }
});
export type InquiryOwnerSearchResult = z.infer<typeof InquiryOwnerSearchResultSchema>;
