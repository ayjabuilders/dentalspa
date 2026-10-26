import { InquiryOwnerSearchRequestSchema, InquiryOwnerSearchResultSchema, type InquiryOwnerSearchRequest, type InquiryOwnerSearchResult } from '@dental/contracts';
import { InquiryScheduleHistorySchema, type InquiryScheduleHistory } from '@dental/contracts';
import { SetInquiryScheduleSchema, InquiryScheduleResultSchema, type SetInquirySchedule, type InquiryScheduleResult } from '@dental/contracts';
import { InquiryOwnerWorklistSchema, InquirySchema, type InquiryOwnerWorklist, type Inquiry } from '@dental/contracts';
import { FollowUpListSchema, FollowUpRecordedSchema, RecordFollowUpSchema, type FollowUpList, type FollowUpRecorded, type RecordFollowUp } from '@dental/contracts';
import { CreateInquirySchema, InquiryCreatedSchema, InquiryListSchema, type CreateInquiry, type InquiryCreated, type InquiryList } from '@dental/contracts';

export type IntakeFailure = 'offline' | 'denied' | 'expired' | 'disabled' | 'conflict' | 'invalid' | 'unavailable' | 'missing';
export class IntakeError extends Error {
  constructor(public readonly kind: IntakeFailure) { super(kind); this.name = 'IntakeError'; }
}
export type FollowUpAttempt = { inquiry: InquiryList['items'][number]; body: RecordFollowUp; key: string };
export type ScheduleAttempt = { id: string; displayName?: string; body: SetInquirySchedule; key: string };
function privacyState() {
  const pendingSchedule: { current: ScheduleAttempt | null } = { current: null };
  const scheduleActive = { current: false };
  let clearing = false;
  const listeners = new Set<(kind: IntakeFailure) => void>();
  return { pendingSchedule, scheduleActive, onPrivateClear(listener: (kind: IntakeFailure) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, clearPrivate(kind: IntakeFailure) { pendingSchedule.current = null; scheduleActive.current = false; if (clearing) return; clearing = true; try { listeners.forEach(listener => listener(kind)); } finally { clearing = false; } } };
}
function instant(value: string | null): string | null {
  if (value === null) return null;
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? '';
  return new Date(value).toISOString().slice(0,19) + '.' + fraction.padEnd(6,'0');
}
export interface IntakeTransport {
  ownerSearch(body: InquiryOwnerSearchRequest, signal?: AbortSignal): Promise<InquiryOwnerSearchResult>;
  scheduleActive: { current: boolean };
  scheduleHistory(id: string, signal?: AbortSignal): Promise<InquiryScheduleHistory>;
  pendingSchedule: { current: ScheduleAttempt | null };
  onPrivateClear(listener: (kind: IntakeFailure) => void): () => void;
  clearPrivate(kind: IntakeFailure): void;
  setSchedule(id: string, body: SetInquirySchedule, key: string, signal?: AbortSignal): Promise<InquiryScheduleResult>;
  /** Unresolved receipt stays in this session transport across closing/reopening the tool. */
  pendingFollowUp: { current: FollowUpAttempt | null };
  mode: 'demo' | 'connected';
  currentUserId: string;
  ownerWorklist(signal?: AbortSignal): Promise<InquiryOwnerWorklist>;
  inquiry(id: string, signal?: AbortSignal): Promise<Inquiry>;
  list(signal?: AbortSignal): Promise<InquiryList>;
  create(body: CreateInquiry, key: string, signal?: AbortSignal): Promise<InquiryCreated>;
  followUps(inquiryId: string, signal?: AbortSignal): Promise<FollowUpList>;
  recordFollowUp(inquiryId: string, body: RecordFollowUp, key: string, signal?: AbortSignal): Promise<FollowUpRecorded>;
  dispose?(): void;
}
export type IntakeAttempt = { fingerprint: string; key: string };
export function inquiryAttempt(previous: IntakeAttempt | null, input: CreateInquiry): IntakeAttempt {
  const body = CreateInquirySchema.parse(input);
  const fingerprint = JSON.stringify(body);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: crypto.randomUUID() };
}
const demoClinic = '10000000-0000-4000-8000-000000000001';
const demoOwner = '10000000-0000-4000-8000-000000000002';

/** One isolated synthetic store per mounted preview. Never writes browser storage. */
export function createDemoIntakeTransport(): IntakeTransport {
  const privacy = privacyState();
  const pendingFollowUp: { current: FollowUpAttempt | null } = { current: null };
  let items: InquiryList['items'] = [
    { id: '10000000-0000-4000-8000-000000000011', clinic_id: demoClinic, owner_user_id: demoOwner, display_name: 'Lina Exemple', contact_email: 'lina@example.invalid', contact_phone: null, source: 'phone', follow_up_at: null, status: 'new', created_at: '2026-10-26T09:30:00Z' },
    { id: '10000000-0000-4000-8000-000000000012', clinic_id: demoClinic, owner_user_id: demoOwner, display_name: 'Adam Exemple', contact_email: null, contact_phone: null, source: 'website', follow_up_at: new Date(Date.now() + 86400000).toISOString(), status: 'new', created_at: '2026-10-26T08:45:00Z' },
    { id: '10000000-0000-4000-8000-000000000013', clinic_id: demoClinic, owner_user_id: demoOwner, display_name: 'Nora Exemple', contact_email: 'nora@example.invalid', contact_phone: null, source: 'walk_in', follow_up_at: new Date(Date.now() - 86400000).toISOString(), status: 'new', created_at: '2026-10-25T15:00:00Z' },
  ];
  const followUps = new Map<string, FollowUpList['items']>();
  const followUpReceipts = new Map<string, { fingerprint: string; result: FollowUpRecorded }>();
  const scheduleReceipts = new Map<string, { fingerprint: string; result: InquiryScheduleResult }>();
  let disposed = false;
  function authorize(inquiryId: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (disposed) throw new IntakeError('expired');
    const inquiry = items.find(item => item.id === inquiryId);
    if (!inquiry) throw new IntakeError('missing');
    if (inquiry.owner_user_id !== demoOwner) throw new IntakeError('denied');
  }
  const saved = new Map<string, { fingerprint: string; result: InquiryCreated }>();
  return {
    mode: 'demo', currentUserId: demoOwner, pendingFollowUp, ...privacy, clearPrivate(kind) { pendingFollowUp.current = null; privacy.clearPrivate(kind); },
    async ownerSearch(input, signal) {
      signal?.throwIfAborted(); if (disposed) throw new IntakeError('expired');
      const body = InquiryOwnerSearchRequestSchema.parse(input);
      const rows = items.filter(item => item.owner_user_id === demoOwner && item.display_name.toLowerCase().includes(body.name.toLowerCase())).sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at) || b.id.localeCompare(a.id));
      return InquiryOwnerSearchResultSchema.parse({ clinic_id: demoClinic, owner_user_id: demoOwner, truncated: rows.length > 50, items: rows.slice(0,50).map(({id,display_name,source,status,follow_up_at,created_at}) => ({id,display_name,source,status,follow_up_at,created_at})) });
    },
    async scheduleHistory(id, signal) {
      authorize(id, signal);
      const rows = [...scheduleReceipts.entries()].filter(([key]) => key.startsWith(id + ':')).sort(([keyA, a], [keyB, b]) => b.result.receipt.recorded_at.localeCompare(a.result.receipt.recorded_at) || keyB.localeCompare(keyA));
      return InquiryScheduleHistorySchema.parse({ inquiry_id: id, truncated: rows.length > 50, items: rows.slice(0,50).map(([,entry]) => {
        const { previous_follow_up_at, follow_up_at, changed, recorded_at, event_version } = entry.result.receipt;
        return { previous_follow_up_at, follow_up_at, changed, recorded_at, event_version };
      }) });
    },
    async setSchedule(id, input, key, signal) {
      authorize(id, signal); const body = SetInquiryScheduleSchema.parse(input);
      const fingerprint = JSON.stringify([instant(body.expected_follow_up_at), instant(body.follow_up_at)]);
      const saved = scheduleReceipts.get(id + ':' + key);
      if (saved) { if (saved.fingerprint !== fingerprint) throw new IntakeError('conflict'); return { ...saved.result, replayed: true }; }
      const item = items.find(item => item.id === id)!;
      if (instant(item.follow_up_at) !== instant(body.expected_follow_up_at)) throw new IntakeError('conflict');
      const changed = instant(item.follow_up_at) !== instant(body.follow_up_at);
      const result = InquiryScheduleResultSchema.parse({ receipt: { inquiry_id: id, clinic_id: demoClinic, owner_user_id: demoOwner, previous_follow_up_at: item.follow_up_at, follow_up_at: body.follow_up_at, changed, recorded_at: new Date().toISOString(), event_version: 1 }, replayed: false });
      if (changed) items = items.map(value => value.id === id ? { ...value, follow_up_at: body.follow_up_at } : value);
      scheduleReceipts.set(id + ':' + key, { fingerprint, result }); return result;
    },
    async ownerWorklist(signal) {
      signal?.throwIfAborted(); if (disposed) throw new IntakeError('expired');
      const observed_at = new Date().toISOString(); const observed = Date.parse(observed_at);
      const minimal = items.filter(item => item.owner_user_id === demoOwner).map(({ id, clinic_id, owner_user_id, display_name, source, status, follow_up_at, created_at }) => ({ id, clinic_id, owner_user_id, display_name, source, status, follow_up_at, created_at }));
      const dated = (a: typeof minimal[number], b: typeof minimal[number]) => Date.parse(a.follow_up_at!) - Date.parse(b.follow_up_at!) || a.id.localeCompare(b.id);
      const bucket = (rows: typeof minimal) => ({ items: rows.slice(0, 50), truncated: rows.length > 50 });
      return InquiryOwnerWorklistSchema.parse({ observed_at,
        overdue: bucket(minimal.filter(item => item.follow_up_at !== null && Date.parse(item.follow_up_at) <= observed).sort(dated)),
        upcoming: bucket(minimal.filter(item => item.follow_up_at !== null && Date.parse(item.follow_up_at) > observed).sort(dated)),
        undated: bucket(minimal.filter(item => item.follow_up_at === null).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id))),
      });
    },
    async inquiry(id, signal) { authorize(id, signal); return InquirySchema.parse(items.find(item => item.id === id)); },
    async followUps(id, signal) {
      authorize(id, signal);
      const records = followUps.get(id) ?? [];
      return FollowUpListSchema.parse({ items: records.slice(0, 50), truncated: records.length > 50 });
    },
    async recordFollowUp(id, input, key, signal) {
      authorize(id, signal);
      const body = RecordFollowUpSchema.parse(input); const fingerprint = JSON.stringify(body);
      const saved = followUpReceipts.get(id + ':' + key);
      if (saved) { if (saved.fingerprint !== fingerprint) throw new IntakeError('conflict'); return { ...saved.result, replayed: true }; }
      const result = FollowUpRecordedSchema.parse({ item: { ...body, id: crypto.randomUUID(), clinic_id: demoClinic, inquiry_id: id, actor_user_id: demoOwner, recorded_at: new Date().toISOString(), event_version: 1 }, replayed: false });
      followUpReceipts.set(id + ':' + key, { fingerprint, result });
      followUps.set(id, [result.item, ...(followUps.get(id) ?? [])].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.id.localeCompare(a.id)));
      return result;
    },
    dispose() { privacy.clearPrivate('expired'); scheduleReceipts.clear(); pendingFollowUp.current = null; disposed = true; items = []; saved.clear(); followUps.clear(); followUpReceipts.clear(); },
    async list(signal) {
      signal?.throwIfAborted();
      return InquiryListSchema.parse({ items: items.slice(0, 100), truncated: items.length > 100 });
    },
    async create(input, key, signal) {
      signal?.throwIfAborted();
      const body = CreateInquirySchema.parse(input);
      const fingerprint = JSON.stringify(body);
      const previous = saved.get(key);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new IntakeError('conflict');
        return InquiryCreatedSchema.parse({ ...previous.result, replayed: true });
      }
      const result = InquiryCreatedSchema.parse({ item: { ...body, id: crypto.randomUUID(), clinic_id: demoClinic, owner_user_id: demoOwner, status: 'new', created_at: new Date().toISOString() }, replayed: false });
      saved.set(key, { fingerprint, result });
      items = [result.item, ...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return result;
    },
  };
}

/** Credentials are closed over in memory and revoked when the session view closes. */
export function createHttpIntakeTransport(options: { api: string; token: string; clinicId: string; userId: string; fetcher?: typeof fetch }): IntakeTransport {
  const privacy = privacyState();
  const pendingFollowUp: { current: FollowUpAttempt | null } = { current: null };
  let token: string | null = options.token;
  const { api, clinicId, userId } = options;
  let privacyRevision = 0;
  const controllers = new Set<AbortController>();
  const fetcher = options.fetcher ?? fetch;
  async function send(method: 'GET' | 'POST', body?: CreateInquiry | RecordFollowUp | SetInquirySchedule | InquiryOwnerSearchRequest, key?: string, callerSignal?: AbortSignal, suffix = '') {
    if (!token) throw new IntakeError('expired');
    const revision = privacyRevision;
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const response = await fetcher(`${api.replace(/\/$/, '')}/api/v1/inquiries${suffix}`, {
        method, cache: 'no-store', credentials: 'omit',
        headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(callerSignal ? [callerSignal] : [])]),
      });
      if (!response.ok) {
        let disabled = false;
        if (response.status === 503) {
          const problem: unknown = await response.json().catch(() => null);
          disabled = typeof problem === 'object' && problem !== null && 'code' in problem && problem.code === 'intake_disabled';
        }
        const kind: IntakeFailure = response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : response.status === 404 ? 'missing' : disabled ? 'disabled' : response.status === 409 ? 'conflict' : response.status === 400 ? 'invalid' : 'unavailable';
        if ((privacy.scheduleActive.current || suffix.endsWith('/follow-up-schedule') || suffix.endsWith('/follow-up-schedule/history') || suffix === '/owner-search') && (kind === 'expired' || kind === 'denied' || kind === 'missing')) clearPrivate(kind);
        throw new IntakeError(kind);
      }
      if (!token || revision !== privacyRevision) throw new IntakeError('expired');
      const result: unknown = await response.json();
      if (!token || revision !== privacyRevision) throw new IntakeError('expired');
      return result;
    } catch (error) {
      if (error instanceof IntakeError) throw error;
      if (callerSignal?.aborted || controller.signal.aborted) throw error;
      throw new IntakeError(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unavailable');
    } finally { controllers.delete(controller); }
  }
  function clearPrivate(kind: IntakeFailure) { privacyRevision++; pendingFollowUp.current = null; controllers.forEach(controller => controller.abort()); privacy.clearPrivate(kind); }
  return {
    ...privacy, clearPrivate,
    mode: 'connected', currentUserId: userId, pendingFollowUp,
    async ownerSearch(input, signal) {
      const body = InquiryOwnerSearchRequestSchema.parse(input);
      const parsed = InquiryOwnerSearchResultSchema.safeParse(await send('POST', body, undefined, signal, '/owner-search'));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || parsed.data.clinic_id.toLowerCase() !== clinicId.toLowerCase() || parsed.data.owner_user_id.toLowerCase() !== userId.toLowerCase()) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async scheduleHistory(id, signal) {
      const parsed = InquiryScheduleHistorySchema.safeParse(await send('GET', undefined, undefined, signal, '/' + encodeURIComponent(id) + '/follow-up-schedule/history'));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || parsed.data.inquiry_id !== id) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async setSchedule(id, input, key, signal) {
      const body = SetInquiryScheduleSchema.parse(input);
      const parsed = InquiryScheduleResultSchema.safeParse(await send('POST', body, key, signal, '/' + encodeURIComponent(id) + '/follow-up-schedule'));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success) throw new IntakeError('unavailable');
      const receipt = parsed.data.receipt;
      if (receipt.inquiry_id !== id || receipt.clinic_id !== clinicId || receipt.owner_user_id !== userId || instant(receipt.previous_follow_up_at) !== instant(body.expected_follow_up_at) || instant(receipt.follow_up_at) !== instant(body.follow_up_at) || receipt.changed !== (instant(body.expected_follow_up_at) !== instant(body.follow_up_at))) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async ownerWorklist(signal) {
      const parsed = InquiryOwnerWorklistSchema.safeParse(await send('GET', undefined, undefined, signal, '/owner-worklist'));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || [parsed.data.overdue, parsed.data.upcoming, parsed.data.undated].some(bucket => bucket.items.some(item => item.clinic_id !== clinicId || item.owner_user_id !== userId))) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async inquiry(id, signal) {
      const parsed = InquirySchema.safeParse(await send('GET', undefined, undefined, signal, '/' + encodeURIComponent(id)));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || parsed.data.id !== id || parsed.data.clinic_id !== clinicId || parsed.data.owner_user_id !== userId) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async followUps(id, signal) {
      const parsed = FollowUpListSchema.safeParse(await send('GET', undefined, undefined, signal, '/' + encodeURIComponent(id) + '/follow-ups'));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || parsed.data.items.some(item => item.clinic_id !== clinicId || item.inquiry_id !== id)) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async recordFollowUp(id, input, key, signal) {
      const body = RecordFollowUpSchema.parse(input);
      const parsed = FollowUpRecordedSchema.safeParse(await send('POST', body, key, signal, '/' + encodeURIComponent(id) + '/follow-ups'));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || parsed.data.item.clinic_id !== clinicId || parsed.data.item.inquiry_id !== id || parsed.data.item.actor_user_id !== userId || parsed.data.item.kind !== body.kind || parsed.data.item.channel !== body.channel) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async list(signal) {
      const parsed = InquiryListSchema.safeParse(await send('GET', undefined, undefined, signal));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || parsed.data.items.some(item => item.clinic_id !== clinicId)) throw new IntakeError('unavailable');
      return parsed.data;
    },
    async create(input, key, signal) {
      const body = CreateInquirySchema.parse(input);
      const parsed = InquiryCreatedSchema.safeParse(await send('POST', body, key, signal));
      if (!token) throw new IntakeError('expired');
      if (!parsed.success || parsed.data.item.clinic_id !== clinicId || parsed.data.item.owner_user_id !== userId) throw new IntakeError('unavailable');
      return parsed.data;
    },
    dispose() { clearPrivate('expired'); pendingFollowUp.current = null; token = null; controllers.forEach(controller => controller.abort()); controllers.clear(); },
  };
}
