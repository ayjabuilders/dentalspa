import { z } from 'zod';

const Id = z.string().uuid();
const UtcInstant = z.iso.datetime({ offset: true });

export const PatientAdminChecklistKindSchema = z.enum(['cnss', 'cnops']);
export const PatientAdminChecklistStatusSchema = z.enum([
  'not_applicable',
  'missing',
  'received',
  'needs_correction',
  'completed_manually',
]);

export const PatientAdminChecklistItemSchema = z.object({
  clinic_id: Id,
  patient_id: Id,
  kind: PatientAdminChecklistKindSchema,
  status: PatientAdminChecklistStatusSchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  updated_at: UtcInstant,
  updated_by: Id,
}).strict();

export const PatientAdminChecklistListSchema = z.object({
  schema_version: z.literal(1),
  clinic_id: Id,
  patient_id: Id,
  items: z.array(PatientAdminChecklistItemSchema).max(2),
}).strict();

export const SetPatientAdminChecklistSchema = z.object({
  expected_revision: z.number().int().min(0).max(2_147_483_646),
  kind: PatientAdminChecklistKindSchema,
  status: PatientAdminChecklistStatusSchema,
}).strict();

export const PatientAdminChecklistResultSchema = z.object({
  item: PatientAdminChecklistItemSchema,
  replayed: z.boolean(),
}).strict();

export type PatientAdminChecklistKind = z.infer<typeof PatientAdminChecklistKindSchema>;
export type PatientAdminChecklistStatus = z.infer<typeof PatientAdminChecklistStatusSchema>;
export type PatientAdminChecklistItem = z.infer<typeof PatientAdminChecklistItemSchema>;
export type PatientAdminChecklistList = z.infer<typeof PatientAdminChecklistListSchema>;
export type SetPatientAdminChecklist = z.infer<typeof SetPatientAdminChecklistSchema>;
export type PatientAdminChecklistResult = z.infer<typeof PatientAdminChecklistResultSchema>;
