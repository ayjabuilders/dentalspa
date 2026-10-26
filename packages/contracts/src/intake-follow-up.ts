import { z } from 'zod';

export const FollowUpKindSchema = z.enum(['contact_attempt', 'two_way_exchange']);
export const FollowUpChannelSchema = z.enum(['phone', 'email', 'in_person', 'other_manual']);

export const RecordFollowUpSchema = z.object({
  kind: FollowUpKindSchema,
  channel: FollowUpChannelSchema,
}).strict();
export type RecordFollowUp = z.infer<typeof RecordFollowUpSchema>;

export const FollowUpRecordSchema = RecordFollowUpSchema.extend({
  id: z.uuid(),
  clinic_id: z.uuid(),
  inquiry_id: z.uuid(),
  actor_user_id: z.uuid(),
  recorded_at: z.iso.datetime({ offset: true }),
  event_version: z.literal(1),
}).strict();
export type FollowUpRecord = z.infer<typeof FollowUpRecordSchema>;

export const FollowUpListSchema = z.object({
  items: z.array(FollowUpRecordSchema).max(50),
  truncated: z.boolean(),
}).strict();
export type FollowUpList = z.infer<typeof FollowUpListSchema>;

export const FollowUpRecordedSchema = z.object({
  item: FollowUpRecordSchema,
  replayed: z.boolean(),
}).strict();
export type FollowUpRecorded = z.infer<typeof FollowUpRecordedSchema>;
