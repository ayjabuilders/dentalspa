import { z } from 'zod';

const Id = z.uuid();
const DateOnly = z.iso.date();
const DocumentType = z.enum(['administrative', 'clinical']);
export const PatientDocumentSectionSchema = DocumentType;
export const PatientDocumentKindSchema = z.enum(['identity', 'insurance', 'cnss', 'cnops', 'other', 'report', 'prescription', 'clinical_record', 'radiograph', 'clinical_photo', 'lab_result', 'care_consent']);
export const PatientGeneratedTypeSchema = z.enum(['report', 'prescription']);
export const PatientDocumentTemplateSchema = z.object({
  id: Id, version: z.number().int().positive(), type: PatientGeneratedTypeSchema,
  label: z.string().min(1).max(120), initial_content: z.object({ body: z.literal('') }).strict(),
}).strict();
export const PatientDocumentCapabilitiesSchema = z.object({
  can_read_administrative: z.boolean(), can_read_clinical: z.boolean(),
  can_read: z.boolean(), can_upload: z.boolean(), can_upload_administrative: z.boolean(), can_upload_clinical: z.boolean(),
  can_create_report: z.boolean(), can_create_prescription: z.boolean(), can_edit_draft: z.boolean(),
  can_edit_report: z.boolean(), can_edit_prescription: z.boolean(), can_validate: z.boolean(),
  categories: z.array(PatientDocumentKindSchema).max(12),
}).strict();
export const PatientDocumentItemSchema = z.object({
  id: Id, clinic_id: Id, patient_id: Id, section: DocumentType,
  category: PatientDocumentKindSchema, document_type: z.enum(['upload', 'report', 'prescription']),
  title: z.string().min(1).max(160), document_date: DateOnly,
  content_type: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'application/json']),
  size_bytes: z.number().int().nonnegative().max(20 * 1024 * 1024),
  created_at: z.iso.datetime({ offset: true }), created_by: Id,
  finalized_at: z.iso.datetime({ offset: true }), version: z.number().int().positive(),
  source: z.enum(['upload', 'generated']), status: z.enum(['stored','validated']),
  template_id: Id.nullable(), template_version: z.number().int().positive().nullable(),
}).strict();
export const PatientDocumentListSchema = z.object({
  schema_version: z.literal(1), clinic_id: Id, patient_id: Id,
  section: DocumentType, items: z.array(PatientDocumentItemSchema).max(10),
  next_cursor: z.string().max(200).nullable(), capabilities: PatientDocumentCapabilitiesSchema,
}).strict();
export const PatientDocumentDraftContentSchema = z.object({ body: z.string().max(30_000) }).strict();
export const PatientDocumentDraftSchema = z.object({
  id: Id, clinic_id: Id, patient_id: Id, type: PatientGeneratedTypeSchema,
  title: z.string().min(1).max(160), document_date: DateOnly,
  template_id: Id, template_version: z.number().int().positive(),
  content: PatientDocumentDraftContentSchema, version: z.number().int().positive(),
  updated_at: z.iso.datetime({ offset: true }), updated_by: Id,
}).strict();
export const PatientDocumentDraftListSchema = z.object({
  schema_version: z.literal(1), clinic_id: Id, patient_id: Id,
  items: z.array(PatientDocumentDraftSchema).max(10), next_cursor: z.string().max(200).nullable(),
  capabilities: PatientDocumentCapabilitiesSchema,
}).strict();
export const PatientDocumentTemplatesSchema = z.object({
  schema_version: z.literal(1), clinic_id: Id, patient_id: Id,
  items: z.array(PatientDocumentTemplateSchema).max(20),
}).strict();
export const CreatePatientDocumentDraftSchema = z.object({
  type: PatientGeneratedTypeSchema, template_id: Id, template_version: z.number().int().positive(),
  title: z.string().trim().min(1).max(160), document_date: DateOnly,
  content: PatientDocumentDraftContentSchema,
}).strict();
export const UpdatePatientDocumentDraftSchema = z.object({
  expected_version: z.number().int().positive(), title: z.string().trim().min(1).max(160),
  document_date: DateOnly, content: PatientDocumentDraftContentSchema,
}).strict();
export const ValidatePatientDocumentDraftSchema = z.object({ expected_version: z.number().int().positive() }).strict();
export const PatientDocumentDraftReceiptSchema = z.object({ draft: PatientDocumentDraftSchema, replayed: z.boolean() }).strict();
export const PatientDocumentUploadReceiptSchema = z.object({ item: PatientDocumentItemSchema, replayed: z.boolean() }).strict();
export const PatientDocumentContentSchema = z.object({
  kind: z.literal('generated'), clinic_id: Id, patient_id: Id, document_id: Id,
  title: z.string().min(1).max(160), document_date: DateOnly, type: PatientGeneratedTypeSchema,
  content: PatientDocumentDraftContentSchema, template_id: Id, template_version: z.number().int().positive(), version: z.number().int().positive(),
  patient_name: z.string().min(1).max(120), patient_reference: z.string().min(1).max(120), clinic_name: z.string().min(1).max(120),
  validated_by_name: z.string().min(1).max(120), validated_at: z.iso.datetime({ offset: true }),
}).strict();
export const PatientDocumentDraftVersionSchema = z.object({
  version: z.number().int().positive(), title: z.string().min(1).max(160), document_date: DateOnly,
  content: PatientDocumentDraftContentSchema, updated_at: z.iso.datetime({ offset: true }), updated_by: Id,
}).strict();
export const PatientDocumentDraftVersionsSchema = z.object({
  schema_version: z.literal(1), clinic_id: Id, patient_id: Id, draft_id: Id,
  items: z.array(PatientDocumentDraftVersionSchema).max(100),
}).strict();

export type PatientDocumentSection = z.infer<typeof PatientDocumentSectionSchema>;
export type PatientDocumentKind = z.infer<typeof PatientDocumentKindSchema>;
export type PatientGeneratedType = z.infer<typeof PatientGeneratedTypeSchema>;
export type PatientDocumentItem = z.infer<typeof PatientDocumentItemSchema>;
export type PatientDocumentDraft = z.infer<typeof PatientDocumentDraftSchema>;
export type PatientDocumentCapabilities = z.infer<typeof PatientDocumentCapabilitiesSchema>;
export type CreatePatientDocumentDraft = z.infer<typeof CreatePatientDocumentDraftSchema>;
export type UpdatePatientDocumentDraft = z.infer<typeof UpdatePatientDocumentDraftSchema>;
