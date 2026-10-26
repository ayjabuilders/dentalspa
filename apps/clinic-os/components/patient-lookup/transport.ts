import { PatientLookupRequestSchema, PatientLookupResponseSchema, type PatientLookupRequest, type PatientLookupResponse } from '@dental/contracts';

export type PatientLookupFailure = 'invalid' | 'expired' | 'denied' | 'offline' | 'unavailable';
export class PatientLookupError extends Error {
  constructor(public readonly kind: PatientLookupFailure) { super(kind); this.name = 'PatientLookupError'; }
}
export interface PatientLookupTransport {
  lookup(request: PatientLookupRequest, signal?: AbortSignal): Promise<PatientLookupResponse>;
  dispose(): void;
}

/** Query values only enter the POST body; credentials and results never enter storage. */
export function createPatientLookupTransport(options: { api: string; token: string; clinicId: string; fetcher?: typeof fetch }): PatientLookupTransport {
  const { api, clinicId } = options;
  const fetcher = options.fetcher ?? fetch;
  let token: string | null = options.token;
  const controllers = new Set<AbortController>();
  return {
    async lookup(input, callerSignal) {
      if (!token) throw new PatientLookupError('expired');
      const request = PatientLookupRequestSchema.safeParse(input);
      if (!request.success) throw new PatientLookupError('invalid');
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetcher(`${api.replace(/\/$/, '')}/api/v1/patients/lookup`, {
          method: 'POST', cache: 'no-store', credentials: 'omit',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId },
          body: JSON.stringify(request.data),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(callerSignal ? [callerSignal] : [])]),
        });
        if (!response.ok) throw new PatientLookupError(response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : response.status === 400 ? 'invalid' : 'unavailable');
        const parsed = PatientLookupResponseSchema.safeParse(await response.json());
        if (!token) throw new PatientLookupError('expired');
        if (callerSignal?.aborted) callerSignal.throwIfAborted();
        if (!parsed.success || parsed.data.items.some(item => item.clinic_id !== clinicId || item.match_basis !== request.data.mode || (request.data.mode === 'reference_exact' ? item.reference !== request.data.query : !item.display_name.startsWith(request.data.query)))) throw new PatientLookupError('unavailable');
        return parsed.data;
      } catch (error) {
        if (error instanceof PatientLookupError) throw error;
        if (callerSignal?.aborted || controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        throw new PatientLookupError(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unavailable');
      } finally { controllers.delete(controller); }
    },
    dispose() { token = null; controllers.forEach(controller => controller.abort()); controllers.clear(); },
  };
}
