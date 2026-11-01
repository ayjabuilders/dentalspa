import { PatientSelfSchema, type PatientSelf } from '@dental/contracts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type OwnLink = { user_id: string; clinic_id: string; patient_id: string; verified_at: string };

function parseOwnLink(value: unknown): OwnLink | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const link = value as Record<string, unknown>;
  if (typeof link.user_id !== 'string' || !UUID_PATTERN.test(link.user_id)) return null;
  if (typeof link.clinic_id !== 'string' || !UUID_PATTERN.test(link.clinic_id)) return null;
  if (typeof link.patient_id !== 'string' || !UUID_PATTERN.test(link.patient_id)) return null;
  if (typeof link.verified_at !== 'string' || !Number.isFinite(Date.parse(link.verified_at))) return null;
  return { user_id: link.user_id, clinic_id: link.clinic_id, patient_id: link.patient_id, verified_at: link.verified_at };
}

export type PatientProfileFailure = 'unlinked' | 'ambiguous' | 'expired' | 'denied' | 'offline' | 'unavailable';

export class PatientProfileError extends Error {
  constructor(public readonly kind: PatientProfileFailure) {
    super(kind);
    this.name = 'PatientProfileError';
  }
}

export async function loadOwnPatientProfile(options: {
  api: string;
  token: string;
  userId: string;
  readOwnVerifiedLinks: (signal: AbortSignal) => Promise<unknown>;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<PatientSelf> {
  if (!UUID_PATTERN.test(options.userId)) throw new PatientProfileError('denied');
  const controller = new AbortController();
  const callerSignal = options.signal;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(callerSignal ? [callerSignal] : [])]);
  const fetcher = options.fetcher ?? fetch;
  let token: string | null = options.token;
  try {
    const rawLinks = await options.readOwnVerifiedLinks(signal);
    if (!Array.isArray(rawLinks) || rawLinks.length === 0) throw new PatientProfileError('unlinked');
    if (rawLinks.length !== 1) throw new PatientProfileError('ambiguous');
    const link = parseOwnLink(rawLinks[0]);
    if (!link || link.user_id !== options.userId) throw new PatientProfileError('denied');
    if (!token) throw new PatientProfileError('expired');

    const response = await fetcher(`${options.api.replace(/\/$/, '')}/api/v1/me/patient`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': link.clinic_id },
      signal,
    });
    if (!response.ok) {
      if (response.status === 401) throw new PatientProfileError('expired');
      if (response.status === 403 || response.status === 404) throw new PatientProfileError('denied');
      throw new PatientProfileError('unavailable');
    }
    const parsed = PatientSelfSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.id !== link.patient_id || parsed.data.clinic_id !== link.clinic_id || !token) {
      throw new PatientProfileError('unavailable');
    }
    if (callerSignal?.aborted) callerSignal.throwIfAborted();
    return parsed.data;
  } catch (error) {
    if (error instanceof PatientProfileError) throw error;
    if (callerSignal?.aborted || controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
    throw new PatientProfileError(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unavailable');
  } finally {
    token = null;
    controller.abort();
  }
}
