import { z } from 'zod';

export const PatientSelfSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  display_name: z.string().trim().min(1).max(160),
  reference: z.string().trim().min(1).max(64),
}).strict();

export type PatientSelf = z.infer<typeof PatientSelfSchema>;
