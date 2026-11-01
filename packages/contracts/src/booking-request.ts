import { z } from 'zod';

export const DemoBookingAvailabilityQuerySchema = z.object({ date: z.iso.date() }).strict();
export const DemoBookingAvailabilitySchema = z.object({
  date: z.iso.date(),
  time_zone: z.literal('Africa/Casablanca'),
  duration_minutes: z.literal(45),
  informational: z.literal(true),
  slots: z.array(z.object({
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    resource_pair: z.enum(['a', 'b']),
  }).strict().refine(slot => Date.parse(slot.ends_at) - Date.parse(slot.starts_at) === 45 * 60000)).max(68),
}).strict();

export const CreateDemoBookingRequestSchema = z.object({
  scenario_id: z.enum(['salma', 'youssef', 'imane']),
  requested_date: z.iso.date(),
  requested_time: z.string().regex(/^((0[8-9]|1[0-8]):[0-5]\d|19:00)$/),
}).strict();
export type CreateDemoBookingRequest = z.infer<typeof CreateDemoBookingRequestSchema>;

export const DemoBookingRequestAcknowledgementSchema = z.object({
  status: z.literal('request_received'),
}).strict();

export const DemoBookingServiceStatusSchema = z.object({
  enabled: z.boolean(),
  confirmation_enabled: z.boolean(),
}).strict();

export const DemoBookingRequestItemSchema = z.object({
  id: z.uuid(),
  scenario_id: z.enum(['salma', 'youssef', 'imane']),
  requested_date: z.iso.date(),
  requested_time: z.string().regex(/^((0[8-9]|1[0-8]):[0-5]\d|19:00)$/),
  status: z.enum(['request_received', 'confirmed', 'cancelled']),
  created_at: z.iso.datetime({ offset: true }),
  appointment: z.object({
    id: z.uuid(),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    duration_minutes: z.literal(45),
    confirmed_at: z.iso.datetime({ offset: true }),
    provider_resource_id: z.uuid(),
    chair_resource_id: z.uuid(),
  }).strict().nullable(),
}).strict().superRefine((item, context) => {
  if ((item.status !== 'request_received') !== (item.appointment !== null)) {
    context.addIssue({ code: 'custom', message: 'Appointment details must match the request state.', path: ['appointment'] });
  }
});

export const ConfirmDemoBookingSchema = z.object({
  provider_resource_id: z.uuid(),
  chair_resource_id: z.uuid(),
}).strict();

export const ConfirmDemoBookingResponseSchema = z.object({
  status: z.literal('confirmed'),
  appointment_id: z.uuid(),
  booking_request_id: z.uuid(),
  scenario_id: z.enum(['salma', 'youssef', 'imane']),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  duration_minutes: z.literal(45),
  provider_resource_id: z.uuid(),
  chair_resource_id: z.uuid(),
  confirmed_at: z.iso.datetime({ offset: true }),
  replayed: z.boolean(),
}).strict();

export const DemoBookingRequestListSchema = z.object({
  items: z.array(DemoBookingRequestItemSchema).max(100),
}).strict();
