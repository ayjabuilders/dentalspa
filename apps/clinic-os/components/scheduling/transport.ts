import { CreateSchedulingHoldSchema, SchedulingAvailabilityRequestSchema, SchedulingAvailabilityResponseSchema, SchedulingResourceListResponseSchema, SchedulingHoldCreatedResponseSchema, SchedulingHoldReleasedResponseSchema, SchedulingHoldResponseSchema, type CreateSchedulingHold, type SchedulingAvailabilityRequest, type SchedulingAvailabilityResponse, type SchedulingResourceListResponse, type SchedulingHold, type SchedulingHoldCreatedResponse, type SchedulingHoldReleasedResponse, type SchedulingHoldResponse } from '@dental/contracts';
export class SchedulingError extends Error { constructor(public kind: 'expired' | 'denied' | 'disabled' | 'conflict' | 'hold_expired' | 'invalid' | 'unavailable') { super(kind); } }
export interface SchedulingTransport {
  mode: 'demo' | 'connected';
  resources(signal?: AbortSignal): Promise<SchedulingResourceListResponse>;
  availability(body: SchedulingAvailabilityRequest, signal?: AbortSignal): Promise<SchedulingAvailabilityResponse>;
  create(body: CreateSchedulingHold, key: string, signal?: AbortSignal): Promise<SchedulingHoldCreatedResponse>;
  release(id: string, key: string, signal?: AbortSignal): Promise<SchedulingHoldReleasedResponse>;
  read(id: string, signal?: AbortSignal): Promise<SchedulingHoldResponse>;
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
/** Synthetic, mounted-memory simulation. It does not enforce multi-user concurrency. */
export function createDemoSchedulingTransport(): SchedulingTransport {
  const holds = new Map<string, SchedulingHold>();
  const receipts = new Map<string, { fingerprint: string; result: SchedulingHoldCreatedResponse | SchedulingHoldReleasedResponse }>();
  let disposed = false;
  const now = () => new Date().toISOString();
  function guard(signal?: AbortSignal) { signal?.throwIfAborted(); if (disposed) throw new SchedulingError('expired'); }
  function current(id: string) { const item = holds.get(id); if (!item) throw new SchedulingError('unavailable'); return { ...item, status: item.status === 'held' && Date.parse(item.expires_at) <= Date.now() ? 'expired' as const : item.status }; }
  return {
    mode: 'demo',
    async resources(signal) { guard(signal); return { items: [{ id: provider, kind: 'provider', display_name: 'Praticien · Démo A' }, { id: chair, kind: 'chair', display_name: 'Fauteuil · Démo 01' }], observed_at: now(), truncated: false }; },
    async availability(body, signal) {
      guard(signal);
      const start = Date.parse(body.window_starts_at);
      const end = Date.parse(body.window_ends_at);
      const intervals = Array.from({ length: Math.min(8, Math.floor((end - start) / 3600000)) }, (_, index) => ({ starts_at: new Date(start + index * 3600000).toISOString(), ends_at: new Date(start + index * 3600000 + 1800000).toISOString() })).filter(interval => ![...holds.values()].some(item => current(item.id).status === 'held' && Date.parse(interval.starts_at) < Date.parse(item.ends_at) && Date.parse(interval.ends_at) > Date.parse(item.starts_at)));
      return { ...body, observed_at: now(), informational: true, truncated: false, intervals };
    },
    async create(body, key, signal) {
      guard(signal); const fingerprint = JSON.stringify(body); const saved = receipts.get(`create:${key}`);
      if (saved) { if (saved.fingerprint !== fingerprint) throw new SchedulingError('conflict'); return { ...saved.result, replayed: true }; }
      if ([...holds.values()].some(item => current(item.id).status === 'held' && Date.parse(body.starts_at) < Date.parse(item.ends_at) && Date.parse(body.ends_at) > Date.parse(item.starts_at))) throw new SchedulingError('conflict');
      const item: SchedulingHold = { ...body, id: crypto.randomUUID(), clinic_id: '10000000-0000-4000-8000-000000000001', status: 'held', expires_at: new Date(Date.now() + 120000).toISOString(), created_at: now(), version: 1 };
      holds.set(item.id, item); const result = { item, replayed: false, observed_at: now() }; receipts.set(`create:${key}`, { fingerprint, result }); return result;
    },
    async release(id, key, signal) {
      guard(signal); const saved = receipts.get(`release:${key}`);
      if (saved) { if (saved.fingerprint !== id) throw new SchedulingError('conflict'); return { ...saved.result, transitioned: 'transitioned' in saved.result && saved.result.transitioned, replayed: true }; }
      const previous = current(id); if (previous.status === 'expired') throw new SchedulingError('hold_expired');
      const item: SchedulingHold = { ...previous, status: 'released', version: previous.version + (previous.status === 'held' ? 1 : 0) }; holds.set(id, item);
      const result = { item, transitioned: previous.status === 'held', replayed: false, observed_at: now() }; receipts.set(`release:${key}`, { fingerprint: id, result }); return result;
    },
    async read(id, signal) { guard(signal); return { item: current(id), observed_at: now() }; },
    dispose() { disposed = true; holds.clear(); receipts.clear(); },
  };
}
