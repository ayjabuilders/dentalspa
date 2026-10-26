import { z } from 'zod';

export const TeamActivityKindSchema = z.enum([
  'inquiry_created',
  'inquiry_follow_up_recorded',
  'slot_hold_created',
  'slot_hold_released',
]);
export type TeamActivityKind = z.infer<typeof TeamActivityKindSchema>;

export const TeamActivityItemSchema = z.object({
  kind: TeamActivityKindSchema,
  actor_display_name: z.string().min(1).max(120).nullable(),
  occurred_at: z.iso.datetime({ offset: true }),
}).strict();
export type TeamActivityItem = z.infer<typeof TeamActivityItemSchema>;

function instantNanoseconds(value: string) {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
  const epochMilliseconds = Date.parse(wholeSecond);
  if (!Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000_000n + BigInt(fraction.slice(0, 9).padEnd(9, '0'));
}

export const TeamActivitySchema = z.object({
  observed_at: z.iso.datetime({ offset: true }),
  items: z.array(TeamActivityItemSchema).max(50),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.truncated && value.items.length !== 50) {
    context.addIssue({ code: 'custom', message: 'A truncated activity projection must return the first 50 items', path: ['items'] });
  }
  for (let index = 1; index < value.items.length; index += 1) {
    const previous = instantNanoseconds(value.items[index - 1]!.occurred_at);
    const current = instantNanoseconds(value.items[index]!.occurred_at);
    if (previous !== null && current !== null && previous < current) {
      context.addIssue({ code: 'custom', message: 'Activity must be newest first', path: ['items', index, 'occurred_at'] });
    }
  }
});
export type TeamActivity = z.infer<typeof TeamActivitySchema>;
