import { z } from 'zod';

export const IntakeSourceSchema = z.enum(['phone','website','whatsapp','instagram','email','google_business','walk_in','other']);
export const CreateInquirySchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  contact_email: z.email().max(254).nullable(),
  contact_phone: z.string().trim().min(3).max(40).regex(/^[+\d() .-]+$/).nullable(),
  source: IntakeSourceSchema,
  follow_up_at: z.iso.datetime({ offset: true }).nullable(),
}).strict();
export type CreateInquiry = z.infer<typeof CreateInquirySchema>;
export const InquirySchema = CreateInquirySchema.extend({
  id: z.uuid(), clinic_id: z.uuid(), owner_user_id: z.uuid(),
  status: z.literal('new'), created_at: z.iso.datetime({ offset: true }),
}).strict();
export type Inquiry = z.infer<typeof InquirySchema>;
export const InquiryListSchema = z.object({ items: z.array(InquirySchema).max(100), truncated: z.boolean() }).strict();
export type InquiryList = z.infer<typeof InquiryListSchema>;
export const InquiryCreatedSchema = z.object({ item: InquirySchema, replayed: z.boolean() }).strict();
export type InquiryCreated = z.infer<typeof InquiryCreatedSchema>;
