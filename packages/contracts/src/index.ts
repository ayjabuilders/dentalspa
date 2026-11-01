import { z } from 'zod';
export * from './patient-hub';
export * from './patient-appointments';
export * from './booking-request';
export * from './local-invoice';
export * from './local-payment';
export * from './quote-draft';
export * from './agenda-settings';
export * from './fake-inbox';
export * from './intake';
export * from './intake-follow-up';
export * from './inquiry-worklist';
export * from './inquiry-schedule';
export * from './inquiry-schedule-history';
export * from './inquiry-owner-search';
export * from './inquiry-owner-reassignment';
export * from './inquiry-contact-preference';
export * from './inquiry-communication-language';
export * from './inquiry-communication-time-zone';
export * from './inquiry-planned-action';
export * from './inquiry-planned-action-worklist';
export * from './inquiry-planned-action-history';
export * from './team-roster';
export * from './team-activity';
export * from './patient-lookup';
export * from './patient-directory';
export * from './patient-self';
export * from './patient-communication-preferences';
export * from './patient-admin-checklist';
export * from './inquiry-contact-outcome';
export * from './clinic-workspace-choices';
export * from './scheduling-hold';
export * from './workflow-template';
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
export * from './booking-request';
export * from './local-credit';

export * from './local-installment';
export * from './patient-documents';
export * from './team-access';
export * from './patient-document-catalog';
export * from './patient-document-library';
export * from './appointment-patient-association';
