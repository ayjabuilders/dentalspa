import { z } from 'zod';
export const PatientAppointmentQuerySchema=z.object({from:z.iso.date(),until:z.iso.date()}).strict().refine(value=>Date.parse(value.until)>=Date.parse(value.from)&&Date.parse(value.until)-Date.parse(value.from)<=30*86400000);
export const PatientAppointmentListSchema=z.object({items:z.array(z.object({id:z.uuid(),starts_at:z.iso.datetime(),ends_at:z.iso.datetime(),status:z.enum(['confirmed','cancelled']),version:z.number().int().positive(),patient:z.object({id:z.uuid(),display_name:z.string(),reference:z.string()}).strict().nullable(),provider_name:z.string(),chair_name:z.string(),source:z.enum(['sample','configured']).optional(),contact_name:z.string().nullable().optional(),visit_name:z.string().nullable().optional()}).strict()).max(500),truncated:z.boolean()}).strict();
export type PatientAppointmentList=z.infer<typeof PatientAppointmentListSchema>;
export const ConfiguredAppointmentCommandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('cancel'),expected_version:z.number().int().positive()}).strict(),
  z.object({action:z.literal('reschedule'),expected_version:z.number().int().positive(),expected_revision:z.number().int().positive(),starts_at:z.iso.datetime(),ends_at:z.iso.datetime()}).strict().refine(value=>Date.parse(value.starts_at)<Date.parse(value.ends_at)),
]);
export const ConfiguredAppointmentAvailabilitySchema=z.object({appointment_id:z.uuid(),version:z.number().int().positive(),revision:z.number().int().positive(),date:z.iso.date(),visit_name:z.string().min(1).max(80),slots:z.array(z.object({starts_at:z.iso.datetime(),ends_at:z.iso.datetime()}).strict().refine(slot=>Date.parse(slot.starts_at)<Date.parse(slot.ends_at))).max(2000)}).strict();
export const PatientAppointmentCommandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('cancel'),expected_version:z.number().int().positive()}).strict(),
  z.object({action:z.literal('reschedule'),expected_version:z.number().int().positive(),date:z.iso.date(),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)}).strict(),
]);
const AppointmentReceiptBase=z.object({
  appointment_id:z.uuid(),status:z.enum(['confirmed','cancelled']),version:z.number().int().positive(),
  starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true}),replayed:z.boolean(),
}).strict();
export const PatientAppointmentReceiptSchema=AppointmentReceiptBase.refine(value=>Date.parse(value.ends_at)-Date.parse(value.starts_at)===45*60000);
export const ConfiguredAppointmentReceiptSchema=AppointmentReceiptBase.refine(value=>Date.parse(value.ends_at)>Date.parse(value.starts_at));
