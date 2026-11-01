import { z } from 'zod';
import { patientDocumentDefinition } from './patient-document-catalog';

export const LibraryMetadataSchema = z.object({
  category: z.string().min(1).max(40), type: z.string().min(1).max(60),
  title: z.string().trim().max(160).default(''), document_date: z.iso.date().nullable().default(null),
  notes: z.string().trim().max(2000).default(''), related_appointment_id: z.uuid().nullable().default(null),
}).strict().refine(value => !!patientDocumentDefinition(value.category, value.type), { message: 'Document type does not belong to category' });
export const LibraryItemSchema = z.object({
  id: z.uuid(), clinic_id: z.uuid(), patient_id: z.uuid(),
  category: z.string(), type: z.string(), title: z.string().min(1).max(160), document_date: z.iso.date().nullable(),
  notes: z.string().max(2000), related_appointment_id: z.uuid().nullable(),
  content_type: z.enum(['application/pdf','image/jpeg','image/png']), size_bytes: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }), uploaded_by: z.string(), version: z.number().int().positive(),
  can_edit: z.boolean(), can_delete: z.boolean(),
}).strict();
export const LibraryListSchema = z.object({
  clinic_id: z.uuid(), patient_id: z.uuid(), items: z.array(LibraryItemSchema).max(10), next_cursor: z.string().nullable(),
}).strict();
export const LibraryReceiptSchema = z.object({ item: LibraryItemSchema, replayed: z.boolean() }).strict();
export const LibraryUpdateSchema = z.object({ expected_version: z.number().int().positive(), metadata: LibraryMetadataSchema }).strict();
export const LibraryDeleteSchema = z.object({ expected_version: z.number().int().positive() }).strict();
export const LibraryDeleteReceiptSchema = z.object({ id: z.uuid(), clinic_id: z.uuid(), patient_id: z.uuid(), deleted: z.literal(true), replayed: z.boolean() }).strict();
export const LibraryDownloadSchema = z.object({
  schema_version: z.literal(1), clinic_id: z.uuid(), patient_id: z.uuid(), document_id: z.uuid(),
  url: z.url(), expires_in: z.literal(30), content_type: z.enum(['application/pdf','image/jpeg','image/png']),
  size_bytes: z.number().int().positive().max(20*1024*1024), sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type LibraryMetadata = z.infer<typeof LibraryMetadataSchema>;
export const LibraryUploadStartSchema = z.object({
  metadata: LibraryMetadataSchema, original_name: z.string().min(1).max(255),
  content_type: z.enum(['application/pdf','image/jpeg','image/png']),
  size_bytes: z.number().int().positive().max(20*1024*1024), sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export const LibraryUploadTicketSchema = z.object({schema_version:z.literal(1),clinic_id:z.uuid(),patient_id:z.uuid(),request_key:z.uuid(),upload_url:z.url(),ticket:z.string().min(1).max(20000),expires_in:z.literal(1800)}).strict();
export const LibraryUploadFinishSchema = z.object({ticket:z.string().min(1).max(20000)}).strict();
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

export const LibraryOptionsSchema = z.object({ clinic_id: z.uuid(), patient_id: z.uuid(), categories: z.array(z.object({ id: z.string(), label: z.string(), section: z.enum(['administrative','clinical']), types: z.array(z.object({ id: z.string(), label: z.string() }).strict()) }).strict()), appointments: z.array(z.object({ id: z.uuid(), label: z.string() }).strict()) }).strict();
