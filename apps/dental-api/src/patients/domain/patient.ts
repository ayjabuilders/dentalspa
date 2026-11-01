import type { Actor } from '../../identity/domain/access';
import type { PatientCommunicationPreferencesResult, PatientCommunicationPreferencesState, PatientLookupRequest, PatientLookupResponse, SetPatientCommunicationPreferences } from '@dental/contracts';
export type Patient = { id: string; clinic_id: string; display_name: string; reference: string };
export const PATIENT_REPOSITORY = Symbol('PATIENT_REPOSITORY');
export interface PatientRepository {
  list(actor: Actor): Promise<Patient[]>;
  find(actor: Actor, id: string): Promise<Patient | null>;
  readOwnProfile(actor: Actor, correlationId: string): Promise<Patient | null>;
  getOwnCommunicationPreferences(actor: Actor, correlationId: string): Promise<PatientCommunicationPreferencesState>;
  setOwnCommunicationPreferences(actor: Actor, input: SetPatientCommunicationPreferences, requestKey: string, correlationId: string): Promise<PatientCommunicationPreferencesResult>;
  lookup(actor: Actor, request: PatientLookupRequest): Promise<PatientLookupResponse>;
}
