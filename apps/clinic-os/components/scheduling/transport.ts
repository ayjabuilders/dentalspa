import { createRequestKey } from '../../lib/request-key';
import {sessionFetch as fetch} from '../../lib/renewing-session';
import { CreateSchedulingHoldSchema, SchedulingAvailabilityRequestSchema, SchedulingAvailabilityResponseSchema, SchedulingResourceListResponseSchema, SchedulingHoldCreatedResponseSchema, SchedulingHoldReleasedResponseSchema, SchedulingHoldResponseSchema, type CreateSchedulingHold, type SchedulingAvailabilityRequest, type SchedulingAvailabilityResponse, type SchedulingResourceListResponse, type SchedulingHold, type SchedulingHoldCreatedResponse, type SchedulingHoldReleasedResponse, type SchedulingHoldResponse } from '@dental/contracts';
export class SchedulingError extends Error { constructor(public kind: 'expired' | 'denied' | 'disabled' | 'conflict' | 'hold_expired' | 'invalid' | 'unavailable') { super(kind); } }
export type DemoAppointment = {
  id: string;
  source_hold_id: string;
  patient_demo_id: string;
  patient_display_name: string;
  provider_resource_id: string;
  chair_resource_id: string;
  starts_at: string;
  ends_at: string;
  display_timezone: string;
  status: 'confirmed' | 'cancelled';
  last_action: 'confirmed' | 'rescheduled' | 'cancelled';
  version: number;
  changed_at: string;
};
export interface SchedulingTransport {
  mode: 'demo' | 'connected';
  resources(signal?: AbortSignal): Promise<SchedulingResourceListResponse>;
  availability(body: SchedulingAvailabilityRequest, signal?: AbortSignal): Promise<SchedulingAvailabilityResponse>;
  create(body: CreateSchedulingHold, key: string, signal?: AbortSignal): Promise<SchedulingHoldCreatedResponse>;
  release(id: string, key: string, signal?: AbortSignal): Promise<SchedulingHoldReleasedResponse>;
  read(id: string, signal?: AbortSignal): Promise<SchedulingHoldResponse>;
  demoAppointments?(): DemoAppointment[];
  resetDemo?(): void;
  confirmDemoAppointment?(holdId: string, patientDemoId: string, signal?: AbortSignal): Promise<DemoAppointment>;
  cancelDemoAppointment?(appointmentId: string, signal?: AbortSignal): Promise<DemoAppointment>;
  rescheduleDemoAppointment?(appointmentId: string, body: CreateSchedulingHold, signal?: AbortSignal): Promise<DemoAppointment>;
  dispose(): void;
}
export function createSchedulingTransport(options: { api: string; token: string; clinicId: string; fetcher?: typeof fetch }): SchedulingTransport {
  let token: string | null = options.token;
  const controllers = new Set<AbortController>();
  const fetcher = options.fetcher ?? fetch;
  async function send(path: string, method: 'GET' | 'POST', body?: unknown, key?: string, signal?: AbortSignal): Promise<unknown> {
    if (!token) throw new SchedulingError('expired');
    const controller = new AbortController(); controllers.add(controller);
    try {
      const response = await fetcher(`${options.api.replace(/\/$/, '')}/api/v1/scheduling/${path}`, {
        method, cache: 'no-store', credentials: 'omit',
        headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': options.clinicId, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
      });
      if (!token) throw new SchedulingError('expired');
      if (!response.ok) {
        const problem: unknown = await response.json().catch(() => null);
        const code = problem && typeof problem === 'object' && 'code' in problem ? problem.code : '';
        throw new SchedulingError(response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : response.status === 503 && code === 'scheduling_disabled' ? 'disabled' : response.status === 409 && code === 'hold_expired' ? 'hold_expired' : response.status === 409 ? 'conflict' : response.status === 400 ? 'invalid' : 'unavailable');
      }
      const result: unknown = await response.json();
      if (!token) throw new SchedulingError('expired');
      return result;
    } catch (error) { if (!token) throw new SchedulingError('expired'); if (error instanceof SchedulingError) throw error; throw new SchedulingError('unavailable'); }
    finally { controllers.delete(controller); }
  }
  function check<T extends { item: SchedulingHold }>(value: T, id?: string): T {
    if (!token) throw new SchedulingError('expired');
    if (value.item.clinic_id !== options.clinicId || (id && value.item.id !== id)) throw new SchedulingError('unavailable');
    return value;
  }
  return {
    mode: 'connected',
    async resources(signal) { return SchedulingResourceListResponseSchema.parse(await send('resources', 'GET', undefined, undefined, signal)); },
    async availability(input, signal) {
      const body = SchedulingAvailabilityRequestSchema.parse(input);
      const result = SchedulingAvailabilityResponseSchema.parse(await send('availability', 'POST', body, undefined, signal));
      if (result.provider_resource_id !== body.provider_resource_id || result.chair_resource_id !== body.chair_resource_id || Date.parse(result.window_starts_at) !== Date.parse(body.window_starts_at) || Date.parse(result.window_ends_at) !== Date.parse(body.window_ends_at) || result.display_timezone !== body.display_timezone) throw new SchedulingError('unavailable');
      return result;
    },
    async create(input, key, signal) {
      const body = CreateSchedulingHoldSchema.parse(input);
      const result = check(SchedulingHoldCreatedResponseSchema.parse(await send('holds', 'POST', body, key, signal)));
      if (result.item.provider_resource_id !== body.provider_resource_id || result.item.chair_resource_id !== body.chair_resource_id || Date.parse(result.item.starts_at) !== Date.parse(body.starts_at) || Date.parse(result.item.ends_at) !== Date.parse(body.ends_at) || result.item.display_timezone !== body.display_timezone) throw new SchedulingError('unavailable');
      return result;
    },
    async release(id, key, signal) { return check(SchedulingHoldReleasedResponseSchema.parse(await send(`holds/${encodeURIComponent(id)}/release`, 'POST', {}, key, signal)), id); },
    async read(id, signal) { return check(SchedulingHoldResponseSchema.parse(await send(`holds/${encodeURIComponent(id)}`, 'GET', undefined, undefined, signal)), id); },
    dispose() { token = null; controllers.forEach(controller => controller.abort()); controllers.clear(); },
  };
}
const provider = '10000000-0000-4000-8000-000000000041';
const chair = '10000000-0000-4000-8000-000000000042';
const demoAppointmentStorageKey = 'dental-spa:clinic-os:demo-appointments:v1';
/** Synthetic, single-tab demo state. It does not enforce multi-user concurrency. */
export function createDemoSchedulingTransport(): SchedulingTransport {
  const holds = new Map<string, SchedulingHold>();
  const appointments = new Map<string, DemoAppointment>();
  const receipts = new Map<string, { fingerprint: string; result: SchedulingHoldCreatedResponse | SchedulingHoldReleasedResponse }>();
  let disposed = false;
  const now = () => new Date().toISOString();
  const demoPatients = new Map([
    ['DEMO-001', 'Salma Alaoui'], ['DEMO-002', 'Youssef Benali'], ['DEMO-003', 'Imane El Idrissi'], ['DEMO-004', 'Mehdi Amrani'],
    ['DEMO-005', 'Yasmine Benjelloun'], ['DEMO-006', 'Adam Berrada'], ['DEMO-007', 'Nour Idrissi'], ['DEMO-008', 'Omar Bennani'],
    ['DEMO-009', 'Samira Amrani'], ['DEMO-010', 'Hamza Chraibi'],
  ]);
  const isDemoAppointment = (value: unknown): value is DemoAppointment => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<DemoAppointment>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return typeof item.id === 'string' && uuid.test(item.id)
      && typeof item.source_hold_id === 'string' && uuid.test(item.source_hold_id)
      && typeof item.patient_demo_id === 'string' && demoPatients.get(item.patient_demo_id) === item.patient_display_name
      && item.provider_resource_id === provider && item.chair_resource_id === chair
      && typeof item.starts_at === 'string' && Number.isFinite(Date.parse(item.starts_at))
      && typeof item.ends_at === 'string' && Date.parse(item.ends_at) > Date.parse(item.starts_at)
      && item.display_timezone === 'Africa/Casablanca'
      && (item.status === 'confirmed' || item.status === 'cancelled')
      && (item.last_action === 'confirmed' || item.last_action === 'rescheduled' || item.last_action === 'cancelled')
      && Number.isSafeInteger(item.version) && (item.version ?? 0) > 0
      && typeof item.changed_at === 'string' && Number.isFinite(Date.parse(item.changed_at));
  };
  function persistAppointments() {
    if (typeof window === 'undefined') return;
    try { window.sessionStorage.setItem(demoAppointmentStorageKey, JSON.stringify({ version: 1, items: [...appointments.values()] })); }
    catch { /* The simulation remains usable in memory when browser storage is unavailable. */ }
  }
  if (typeof window !== 'undefined') {
    try {
      const stored: unknown = JSON.parse(window.sessionStorage.getItem(demoAppointmentStorageKey) ?? 'null');
      if (stored && typeof stored === 'object' && 'version' in stored && stored.version === 1 && 'items' in stored && Array.isArray(stored.items)) {
        for (const item of stored.items) if (isDemoAppointment(item)) appointments.set(item.id, item);
      }
    } catch { /* Ignore unavailable or malformed session data; never trust it as clinic state. */ }
  }
  function guard(signal?: AbortSignal) { signal?.throwIfAborted(); if (disposed) throw new SchedulingError('expired'); }
  function current(id: string) { const item = holds.get(id); if (!item) throw new SchedulingError('unavailable'); return { ...item, status: item.status === 'held' && Date.parse(item.expires_at) <= Date.now() ? 'expired' as const : item.status }; }
  function overlaps(start: string, end: string, exceptAppointmentId?: string, exceptHoldId?: string) {
    return [...holds.values()].some(item => item.id !== exceptHoldId && current(item.id).status === 'held' && Date.parse(start) < Date.parse(item.ends_at) && Date.parse(end) > Date.parse(item.starts_at))
      || [...appointments.values()].some(item => item.id !== exceptAppointmentId && item.status === 'confirmed' && Date.parse(start) < Date.parse(item.ends_at) && Date.parse(end) > Date.parse(item.starts_at));
  }
  return {
    mode: 'demo',
    async resources(signal) { guard(signal); return { items: [{ id: provider, kind: 'provider', display_name: 'Praticien · Démo A' }, { id: chair, kind: 'chair', display_name: 'Fauteuil · Démo 01' }], observed_at: now(), truncated: false }; },
    async availability(body, signal) {
      guard(signal);
      const start = Date.parse(body.window_starts_at);
      const end = Date.parse(body.window_ends_at);
      const intervals = Array.from({ length: Math.min(8, Math.floor((end - start) / 3600000)) }, (_, index) => ({ starts_at: new Date(start + index * 3600000).toISOString(), ends_at: new Date(start + index * 3600000 + 1800000).toISOString() })).filter(interval => !overlaps(interval.starts_at, interval.ends_at));
      return { ...body, observed_at: now(), informational: true, truncated: false, intervals };
    },
    async create(body, key, signal) {
      guard(signal); const fingerprint = JSON.stringify(body); const saved = receipts.get(`create:${key}`);
      if (saved) { if (saved.fingerprint !== fingerprint) throw new SchedulingError('conflict'); return { ...saved.result, replayed: true }; }
      if (overlaps(body.starts_at, body.ends_at)) throw new SchedulingError('conflict');
      const item: SchedulingHold = { ...body, id: createRequestKey(), clinic_id: '10000000-0000-4000-8000-000000000001', status: 'held', expires_at: new Date(Date.now() + 120000).toISOString(), created_at: now(), version: 1 };
      holds.set(item.id, item); const result = { item, replayed: false, observed_at: now() }; receipts.set(`create:${key}`, { fingerprint, result }); return result;
    },
    async release(id, key, signal) {
      guard(signal); const saved = receipts.get(`release:${key}`);
      if (saved) { if (saved.fingerprint !== id) throw new SchedulingError('conflict'); return { ...saved.result, transitioned: 'transitioned' in saved.result && saved.result.transitioned, replayed: true }; }
      const previous = current(id); if (previous.status === 'expired') throw new SchedulingError('hold_expired');
      const item: SchedulingHold = { ...previous, status: 'released', version: previous.version + (previous.status === 'held' ? 1 : 0) }; holds.set(id, item);
      const result = { item, transitioned: previous.status === 'held', replayed: false, observed_at: now() }; receipts.set(`release:${key}`, { fingerprint: id, result }); return result;
    },
    demoAppointments() { return [...appointments.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(item => ({ ...item })); },
    resetDemo() {
      appointments.clear(); holds.clear(); receipts.clear();
      if (typeof window !== 'undefined') { try { window.sessionStorage.removeItem(demoAppointmentStorageKey); } catch { /* The in-memory scenario is still cleared. */ } }
    },
    async confirmDemoAppointment(holdId, patientDemoId, signal) {
      guard(signal);
      const patientName = demoPatients.get(patientDemoId);
      if (!patientName) throw new SchedulingError('invalid');
      const prior = [...appointments.values()].find(item => item.source_hold_id === holdId);
      if (prior) {
        if (prior.patient_demo_id !== patientDemoId) throw new SchedulingError('conflict');
        return { ...prior };
      }
      const hold = current(holdId);
      if (hold.status !== 'held' || overlaps(hold.starts_at, hold.ends_at, undefined, holdId)) throw new SchedulingError(hold.status === 'expired' ? 'hold_expired' : 'conflict');
      const stamp = now();
      const appointment: DemoAppointment = { id: createRequestKey(), source_hold_id: holdId, patient_demo_id: patientDemoId, patient_display_name: patientName, provider_resource_id: hold.provider_resource_id, chair_resource_id: hold.chair_resource_id, starts_at: hold.starts_at, ends_at: hold.ends_at, display_timezone: hold.display_timezone, status: 'confirmed', last_action: 'confirmed', version: 1, changed_at: stamp };
      appointments.set(appointment.id, appointment);
      persistAppointments();
      holds.set(holdId, { ...hold, status: 'released', version: hold.version + 1 });
      return { ...appointment };
    },
    async cancelDemoAppointment(appointmentId, signal) {
      guard(signal);
      const previous = appointments.get(appointmentId);
      if (!previous) throw new SchedulingError('unavailable');
      if (previous.status === 'cancelled') return { ...previous };
      const appointment: DemoAppointment = { ...previous, status: 'cancelled', last_action: 'cancelled', version: previous.version + 1, changed_at: now() };
      appointments.set(appointmentId, appointment); persistAppointments();
      return { ...appointment };
    },
    async rescheduleDemoAppointment(appointmentId, input, signal) {
      guard(signal);
      const body = CreateSchedulingHoldSchema.parse(input);
      const previous = appointments.get(appointmentId);
      if (!previous || previous.status !== 'confirmed') throw new SchedulingError('conflict');
      if (body.provider_resource_id !== previous.provider_resource_id || body.chair_resource_id !== previous.chair_resource_id || body.display_timezone !== previous.display_timezone) throw new SchedulingError('invalid');
      if (overlaps(body.starts_at, body.ends_at, appointmentId)) throw new SchedulingError('conflict');
      const appointment: DemoAppointment = { ...previous, ...body, last_action: 'rescheduled', version: previous.version + 1, changed_at: now() };
      appointments.set(appointmentId, appointment); persistAppointments();
      return { ...appointment };
    },
    async read(id, signal) { guard(signal); return { item: current(id), observed_at: now() }; },
    dispose() { disposed = true; holds.clear(); appointments.clear(); receipts.clear(); },
  };
}
