import { z } from 'zod';

export const PatientLookupRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('reference_exact'),
    query: z.string().trim().min(1).max(256),
  }).strict(),
  z.object({
    mode: z.literal('name_prefix'),
    query: z.string().trim().min(2).max(120),
  }).strict(),
]);

export const PatientLookupItemSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  reference: z.string(),
  display_name: z.string(),
  match_basis: z.enum(['reference_exact', 'name_prefix']),
}).strict();

export const PatientLookupResponseSchema = z.object({
  items: z.array(PatientLookupItemSchema).max(20),
  truncated: z.boolean(),
}).strict();

export type PatientLookupRequest = z.infer<typeof PatientLookupRequestSchema>;
export type PatientLookupItem = z.infer<typeof PatientLookupItemSchema>;
export type PatientLookupResponse = z.infer<typeof PatientLookupResponseSchema>;
