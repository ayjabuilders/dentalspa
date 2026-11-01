import { AppointmentPatientAssociationSchema, AppointmentPatientAssociationReceiptSchema } from '@dental/contracts';
import { sessionFetch } from '../../lib/renewing-session';

export class AssociationError extends Error {
  constructor(public readonly status: number) { super('Association unavailable'); }
}
export function associationRequestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function savePatientAssociation(options: { api: string; token: string; clinicId: string; id: string; version: number; patientId: string | null; key: string; signal: AbortSignal; fetcher?: typeof fetch }) {
  const body = AppointmentPatientAssociationSchema.parse({ patient_id: options.patientId, expected_version: options.version });
  const response = await (options.fetcher ?? sessionFetch)(`${options.api.replace(/\/$/, '')}/api/v1/appointments/${options.id}/patient-association`, {
    method: 'POST', cache: 'no-store', credentials: 'omit', signal: options.signal,
    headers: { Authorization: `Bearer ${options.token}`, 'X-Clinic-Id': options.clinicId, 'Idempotency-Key': options.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new AssociationError(response.status);
  const receipt = AppointmentPatientAssociationReceiptSchema.parse(await response.json());
  if (receipt.appointment_id !== options.id || receipt.patient_id !== options.patientId || receipt.version !== options.version + 1) throw new AssociationError(503);
  return receipt;
}
