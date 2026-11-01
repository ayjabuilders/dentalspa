import { z } from 'zod';

/** Minimal administrative projection returned by the authorized clinic patient API. */
export const PatientAdministrativeRecordSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  display_name: z.string(),
  reference: z.string(),
}).strict();

export const PatientDirectorySchema = z.array(PatientAdministrativeRecordSchema).max(100);

export type PatientAdministrativeRecord = z.infer<typeof PatientAdministrativeRecordSchema>;
