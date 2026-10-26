import type { Actor } from '../../identity/domain/access';
export type Patient = { id: string; clinic_id: string; display_name: string; reference: string };
export const PATIENT_REPOSITORY = Symbol('PATIENT_REPOSITORY');
export interface PatientRepository { list(actor: Actor): Promise<Patient[]>; find(actor: Actor, id: string): Promise<Patient | null> }
