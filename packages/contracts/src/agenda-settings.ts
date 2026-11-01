import { z } from 'zod';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weeklyWindow = z.object({
  weekday: z.number().int().min(1).max(7),
  start: clock,
  end: clock,
}).strict().refine(window => window.start < window.end, 'Opening must precede closing on the same day.');

// Empty windows explicitly mean closed, never an inferred default schedule.
const weeklyWindows = z.array(weeklyWindow).max(28).superRefine((windows, context) => {
  const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];
    if (current && previous && current.weekday === previous.weekday && current.start < previous.end) {
      context.addIssue({ code: 'custom', message: 'Weekly windows must not overlap.' });
    }
  }
});

export const AgendaVisitTypeSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
  public_bookable: z.boolean(),
  duration_minutes: z.number().int().min(5).max(480),
  buffer_before_minutes: z.number().int().min(0).max(120),
  buffer_after_minutes: z.number().int().min(0).max(120),
  // Each allowed pair must also pass same-clinic, active-resource validation server-side.
  resource_pairs: z.array(z.object({ provider_id: z.uuid(), chair_id: z.uuid() }).strict()
    .refine(pair => pair.provider_id !== pair.chair_id, 'Provider and chair must differ.')).min(1).max(100),
  weekly_windows: weeklyWindows,
}).strict();

export const AgendaSettingsSchema = z.object({
  schema_version: z.literal(1),
  revision: z.number().int().positive(),
  time_zone: z.literal('Africa/Casablanca'),
  slot_step_minutes: z.number().int().min(5).max(60),
  minimum_notice_minutes: z.number().int().min(0).max(43200),
  booking_horizon_days: z.number().int().min(1).max(365),
  confirmation_mode: z.enum(['automatic', 'staff_review']),
  patient_cancellation_enabled: z.boolean(),
  patient_reschedule_enabled: z.boolean(),
  cancellation_notice_minutes: z.number().int().min(0).max(43200),
  reschedule_notice_minutes: z.number().int().min(0).max(43200),
  weekly_windows: weeklyWindows,
  closures: z.array(z.object({
    date: z.iso.date(),
    resource_id: z.uuid().nullable(),
    start: clock,
    end: clock,
  }).strict().refine(value => value.start < value.end)).max(1000),
  visit_types: z.array(AgendaVisitTypeSchema).max(100),
}).strict().superRefine((settings, context) => {
  const ids = settings.visit_types.map(type => type.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Visit type IDs must be unique.' });
  for (const visit of settings.visit_types) {
    for (const window of visit.weekly_windows) {
      if (!settings.weekly_windows.some(clinic => clinic.weekday === window.weekday && clinic.start <= window.start && clinic.end >= window.end)) {
        context.addIssue({ code: 'custom', message: 'Visit windows must fit within clinic opening hours.' });
      }
    }
  }
});

export type AgendaSettings = z.infer<typeof AgendaSettingsSchema>;
export const PublicAgendaQuerySchema = z.object({ date: z.iso.date(), visit_type_id: z.uuid().optional() }).strict();
export const PublicAgendaAvailabilitySchema = z.object({
  date: z.iso.date(), time_zone: z.literal('Africa/Casablanca'), revision: z.number().int().positive(),
  informational: z.literal(true), selected_visit_type_id: z.uuid().nullable(),
  request_enabled:z.boolean().optional(),
  confirmation_mode:z.enum(['staff_review','automatic']).optional(),
  visit_types: z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(80), duration_minutes: z.number().int().positive() }).strict()).max(100),
  slots: z.array(z.object({ starts_at: z.iso.datetime(), ends_at: z.iso.datetime() }).strict()
    .refine(slot => Date.parse(slot.starts_at) < Date.parse(slot.ends_at))).max(2000),
}).strict();
export const AgendaSettingsReadSchema = z.object({ settings: AgendaSettingsSchema.nullable() }).strict();
export const ConfiguredBookingRequestSchema=z.object({
  visit_type_id:z.uuid(),configuration_revision:z.number().int().positive(),
  starts_at:z.iso.datetime(),ends_at:z.iso.datetime(),
  contact_name:z.string().trim().min(1).max(100),
  contact_email:z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@example\.test$/),
  contact_phone:z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/).optional(),
  administrative_consent_version:z.literal('local-demo-v1'),
}).strict().refine(value=>Date.parse(value.starts_at)<Date.parse(value.ends_at));
export const ConfiguredBookingReceiptSchema=z.discriminatedUnion('status',[
  z.object({request_id:z.uuid(),status:z.literal('request_received'),replayed:z.boolean()}).strict(),
  z.object({request_id:z.uuid(),status:z.literal('confirmed'),appointment_id:z.uuid(),starts_at:z.iso.datetime(),ends_at:z.iso.datetime(),replayed:z.boolean()}).strict().refine(value=>Date.parse(value.starts_at)<Date.parse(value.ends_at)),
]);
export const ConfirmConfiguredBookingSchema=z.object({expected_revision:z.number().int().positive()}).strict();
export const ConfiguredBookingConfirmationSchema=z.object({
  request_id:z.uuid(),appointment_id:z.uuid(),status:z.literal('confirmed'),version:z.literal(1),
  starts_at:z.iso.datetime(),ends_at:z.iso.datetime(),replayed:z.boolean(),
}).strict().refine(value=>Date.parse(value.starts_at)<Date.parse(value.ends_at));
export const ConfiguredBookingListSchema=z.object({items:z.array(z.object({
  id:z.uuid(),contact_name:z.string().min(1).max(100),contact_email:z.string().max(254),contact_phone:z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable().optional(),visit_name:z.string().min(1).max(80),
  starts_at:z.iso.datetime(),ends_at:z.iso.datetime(),created_at:z.iso.datetime(),status:z.enum(['request_received','confirmed','cancelled']),configuration_revision:z.number().int().positive(),
  appointment:z.object({id:z.uuid(),status:z.enum(['confirmed','cancelled']),version:z.number().int().positive()}).strict().nullable().optional(),
}).strict().refine(row=>row.status==='request_received'?!row.appointment:row.appointment?.status===row.status)).max(100),truncated:z.boolean(),current_revision:z.number().int().positive().nullable().optional(),confirmation_enabled:z.boolean().optional()}).strict();
export const AgendaSettingsSavedSchema = z.object({ settings: AgendaSettingsSchema, replayed: z.boolean() }).strict();
export const ConfiguredBookingPageQuerySchema=z.object({
  offset:z.coerce.number().int().min(0).max(1000000).default(0),
  limit:z.coerce.number().int().min(1).max(100).default(10),
  query:z.string().trim().max(100).default(''),
  status:z.enum(['all','request_received','confirmed','cancelled']).default('all'),
}).strict();
export const ConfiguredBookingPageSchema=ConfiguredBookingListSchema.safeExtend({
  total_count:z.number().int().nonnegative(),
  counts:z.object({all:z.number().int().nonnegative(),request_received:z.number().int().nonnegative(),confirmed:z.number().int().nonnegative(),cancelled:z.number().int().nonnegative()}).strict(),
});
// Tenant and actor are resolved from the authenticated session, not this command.
export const UpdateAgendaSettingsSchema = z.object({
  expected_revision: z.number().int().min(0),
  settings: AgendaSettingsSchema,
}).strict().refine(command => command.settings.revision === command.expected_revision + 1,
  'A settings update advances exactly one revision.');
