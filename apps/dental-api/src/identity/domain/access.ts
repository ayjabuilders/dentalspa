export type StaffRole = 'dentist' | 'reception' | 'assistant' | 'manager';
export type Membership = { clinic_id: string; user_id: string; role: StaffRole; active: boolean };
export type PatientLink = { clinic_id: string; user_id: string; patient_id: string; verified_at: string | null };
export type Actor = { userId: string; token: string; clinicId: string; roles: StaffRole[]; patientId?: string };
export interface IdentityPort {
  verify(token: string): Promise<string | null>;
  memberships(token: string, userId: string): Promise<Membership[]>;
  patientLinks(token: string, userId: string): Promise<PatientLink[]>;
}
export const IDENTITY = Symbol('IDENTITY');
export const staffRoles: StaffRole[] = ['dentist', 'reception', 'assistant', 'manager'];
export function resolveActor(userId: string, token: string, clinicId: string, memberships: Membership[], links: PatientLink[]): Actor | null {
  const roles = [...new Set(memberships.filter(m => m.active && m.user_id === userId && m.clinic_id === clinicId && staffRoles.includes(m.role)).map(m => m.role))];
  const linked = links.filter(l => l.user_id === userId && l.clinic_id === clinicId && l.verified_at);
  // Ambiguous links fail closed; account linking is never guessed from a name or phone.
  if (!roles.length && linked.length !== 1) return null;
  return { userId, token, clinicId, roles, ...(linked.length === 1 ? { patientId: linked[0]!.patient_id } : {}) };
}
export function canReadPatient(actor: Actor, patient: { id: string; clinic_id: string }): boolean {
  return actor.clinicId === patient.clinic_id && (actor.roles.some(r => staffRoles.includes(r)) || actor.patientId === patient.id);
}
