import { z } from 'zod';
export * from './intake';
export * from './patient-lookup';
export * from './scheduling-hold';
export const RoleSchema = z.enum(['dentist', 'reception', 'assistant', 'manager']);
export type Role = z.infer<typeof RoleSchema>;
export const IdSchema = z.string().uuid();
export const PatientSummarySchema = z.object({ id: IdSchema, clinic_id: IdSchema, display_name: z.string(), reference: z.string() }).strict();
export type PatientSummary = z.infer<typeof PatientSummarySchema>;
export const WorkspaceSchema = z.object({ user_id: IdSchema, clinic_id: IdSchema, roles: z.array(RoleSchema).min(1), mode: z.literal('connected') }).strict();
export const FoundationEventSchema = z.object({
  event_id: IdSchema, event_type: z.literal('FoundationAccessReviewed'), event_version: z.literal(1),
  clinic_id: IdSchema, aggregate_type: z.literal('membership'), aggregate_id: IdSchema,
  occurred_at: z.iso.datetime(), correlation_id: IdSchema, actor_ref: IdSchema,
  payload: z.object({ outcome: z.enum(['allowed', 'denied']) }).strict()
}).strict();
// Clinical and booking events remain draft contracts until their milestones.
export type FoundationEvent = z.infer<typeof FoundationEventSchema>;
