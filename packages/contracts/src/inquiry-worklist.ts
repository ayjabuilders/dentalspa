import { z } from 'zod';
import { IntakeSourceSchema } from './intake';

export const InquiryWorklistItemSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  owner_user_id: z.uuid(),
  display_name: z.string().min(1).max(120),
  source: IntakeSourceSchema,
  status: z.literal('new'),
  follow_up_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
}).strict();
export type InquiryWorklistItem = z.infer<typeof InquiryWorklistItemSchema>;

export const InquiryWorklistBucketSchema = z.object({
  items: z.array(InquiryWorklistItemSchema).max(50),
  truncated: z.boolean(),
}).strict();
export type InquiryWorklistBucket = z.infer<typeof InquiryWorklistBucketSchema>;

export const InquiryOwnerWorklistSchema = z.object({
  observed_at: z.iso.datetime({ offset: true }),
  overdue: InquiryWorklistBucketSchema,
  upcoming: InquiryWorklistBucketSchema,
  undated: InquiryWorklistBucketSchema,
}).strict();
export type InquiryOwnerWorklist = z.infer<typeof InquiryOwnerWorklistSchema>;
