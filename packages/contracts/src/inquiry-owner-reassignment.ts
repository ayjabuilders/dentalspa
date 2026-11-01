import { z } from 'zod';

const IdSchema = z.uuid();
const OffsetDateTimeSchema = z.iso.datetime({ offset: true });

/** Current owner is the compare-and-set version; the actor and clinic come from verified auth context. */
export const SetInquiryOwnerSchema = z.object({
  expected_owner_user_id: IdSchema,
  owner_user_id: IdSchema,
}).strict();
export type SetInquiryOwner = z.infer<typeof SetInquiryOwnerSchema>;

export const InquiryOwnerAssignmentReceiptSchema = z.object({
  inquiry_id: IdSchema,
  clinic_id: IdSchema,
  previous_owner_user_id: IdSchema,
  owner_user_id: IdSchema,
  changed: z.boolean(),
  recorded_at: OffsetDateTimeSchema,
  event_version: z.literal(1),
}).strict();

export const InquiryOwnerAssignmentResultSchema = z.object({
  receipt: InquiryOwnerAssignmentReceiptSchema,
  replayed: z.boolean(),
}).strict();
export type InquiryOwnerAssignmentResult = z.infer<typeof InquiryOwnerAssignmentResultSchema>;
