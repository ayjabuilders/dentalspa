import {sessionFetch as fetch} from '../../lib/renewing-session';
import { PatientAdministrativeRecordSchema, PatientDirectorySchema, type PatientAdministrativeRecord } from '@dental/contracts';

export type PatientDirectoryFailure = 'expired' | 'denied' | 'not_found' | 'offline' | 'unavailable';
export class PatientDirectoryError extends Error {
  constructor(public readonly kind: PatientDirectoryFailure) { super(kind); this.name = 'PatientDirectoryError'; }
}

export interface PatientDirectoryTransport {
  list(signal?: AbortSignal): Promise<PatientAdministrativeRecord[]>;
  find(id: string, signal?: AbortSignal): Promise<PatientAdministrativeRecord>;
  dispose(): void;
}

/** Authenticated, same-clinic, no-store reads only. Patient IDs come from the server list. */
export function createPatientDirectoryTransport(options: { api: string; token: string; clinicId: string; fetcher?: typeof fetch }): PatientDirectoryTransport {
  const { api, clinicId } = options;
  const fetcher = options.fetcher ?? fetch;
  let token: string | null = options.token;
  const controllers = new Set<AbortController>();

  async function get(path: string, signal?: AbortSignal): Promise<Response> {
    if (!token) throw new PatientDirectoryError('expired');
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const response = await fetcher(`${api.replace(/\/$/, '')}${path}`, {
        method: 'GET', cache: 'no-store', credentials: 'omit',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
      });
      if (!token) throw new PatientDirectoryError('expired');
      if (signal?.aborted) signal.throwIfAborted();
      if (!response.ok) {
        const kind = response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : response.status === 404 ? 'not_found' : 'unavailable';
        throw new PatientDirectoryError(kind);
      }
      return response;
    } catch (error) {
      if (error instanceof PatientDirectoryError) throw error;
      if (signal?.aborted || controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      throw new PatientDirectoryError(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unavailable');
    } finally { controllers.delete(controller); }
  }

  return {
    async list(signal) {
      const response = await get('/api/v1/patients', signal);
      let raw: unknown;
      try { raw = await response.json(); } catch { throw new PatientDirectoryError('unavailable'); }
      const parsed = PatientDirectorySchema.safeParse(raw);
      if (!parsed.success || parsed.data.some(record => record.clinic_id !== clinicId) || new Set(parsed.data.map(record => record.id)).size !== parsed.data.length) {
        throw new PatientDirectoryError('unavailable');
      }
      return parsed.data;
    },
    async find(id, signal) {
      const requested = PatientAdministrativeRecordSchema.shape.id.safeParse(id);
      if (!requested.success) throw new PatientDirectoryError('unavailable');
      const response = await get(`/api/v1/patients/${encodeURIComponent(requested.data)}`, signal);
      let raw: unknown;
      try { raw = await response.json(); } catch { throw new PatientDirectoryError('unavailable'); }
      const parsed = PatientAdministrativeRecordSchema.safeParse(raw);
      if (!parsed.success || parsed.data.id !== requested.data || parsed.data.clinic_id !== clinicId) throw new PatientDirectoryError('unavailable');
      return parsed.data;
    },
    dispose() { token = null; controllers.forEach(controller => controller.abort()); controllers.clear(); },
  };
}
