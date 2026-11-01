import { z } from 'zod';

export const AppointmentPatientAssociationSchema = z.object({
  patient_id: z.uuid().nullable(),
  expected_version: z.number().int().positive().max(2147483646),
}).strict();
export const AppointmentPatientAssociationReceiptSchema = z.object({
  appointment_id: z.uuid(),
  patient_id: z.uuid().nullable(),
  version: z.number().int().positive(),
  association_status: z.enum(['possible_match', 'unlinked']),
  identity_verified: z.literal(false),
  replayed: z.boolean(),
}).strict().refine(value => value.association_status === (value.patient_id === null ? 'unlinked' : 'possible_match'));
