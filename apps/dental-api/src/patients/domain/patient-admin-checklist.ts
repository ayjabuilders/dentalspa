import type { Actor } from '../../identity/domain/access';
import type { PatientAdminChecklistList, PatientAdminChecklistResult, SetPatientAdminChecklist } from '@dental/contracts';

export const PATIENT_ADMIN_CHECKLIST_REPOSITORY = Symbol('PATIENT_ADMIN_CHECKLIST_REPOSITORY');

export interface PatientAdminChecklistRepository {
  listChecklist(actor: Actor, patientId: string, correlationId: string): Promise<PatientAdminChecklistList>;
  setChecklist(actor: Actor, patientId: string, input: SetPatientAdminChecklist, requestKey: string, correlationId: string): Promise<PatientAdminChecklistResult>;
}
