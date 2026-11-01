import { describe, expect, it, vi } from 'vitest';
import { createInstallmentReminderReader, initialInstallmentReminderView, nextInstallmentReminderView, searchInstallmentReminderView } from './installment-reminders-transport';

const clinic = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
const patient = '20000000-0000-4000-8000-000000000001', plan = '30000000-0000-4000-8000-000000000001';
const item = { line_id: patient, plan_id: plan, version: 2, invoice_id: plan, patient_id: patient, patient_name: 'Patient FICTIF', patient_reference: 'DEMO-1', due_on: '2026-01-01', amount_minor: 5000, paid_minor: 3000, remaining_minor: 2000, overdue: true, requires_revision: false };
const queue = { clinic_id: clinic, synthetic_only: true, as_of_date: '2026-10-31', time_zone: 'Africa/Casablanca', currency_code: 'MAD', items: [item], next_cursor: null };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const response = (body: unknown = queue, status = 200) => new Response(JSON.stringify(body), { status });
const options = { api: 'http://localhost:4100', token: 'synthetic-token', clinicId: clinic, onSessionExpired: vi.fn() };

describe('installment reminder private reads', () => {
  it('uses renewing-compatible authorization, GET/no-store and encoded global search plus cursor', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const reader = createInstallmentReminderReader({ ...options, fetcher });
    expect(await reader.load('Salma & 100%', { due_on: '2026-01-01', line_id: patient })).toEqual(queue);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('q')).toBe('Salma & 100%');
    expect(new URL(String(url)).searchParams.get('after_id')).toBe(patient);
    expect(new URL(String(url)).searchParams.get('after_due')).toBe('2026-01-01');
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer synthetic-token', 'X-Clinic-Id': clinic } });
  });
  it('fails closed for foreign clinic, malformed and unbalanced responses', async () => {
    for (const body of [{ ...queue, clinic_id: other }, { ...queue, items: [{ ...item, remaining_minor: 1 }] }, { items: [] }]) {
      const reader = createInstallmentReminderReader({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(body)) });
      await expect(reader.load('', null)).rejects.toMatchObject({ kind: 'unavailable' });
    }
  });
  it('distinguishes denial, session expiry, unavailable and offline without cached fallback', async () => {
    const expired = vi.fn();
    for (const [status, kind] of [[403, 'denied'], [401, 'expired'], [503, 'unavailable']] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(response({}, status));
      const reader = createInstallmentReminderReader({ ...options, onSessionExpired: expired, fetcher });
      expect(await reader.load('', null)).toEqual(queue);
      await expect(reader.load('', null)).rejects.toMatchObject({ kind });
    }
    expect(expired).toHaveBeenCalledTimes(1);
    const fetcher = vi.fn<typeof fetch>();
    await expect(createInstallmentReminderReader({ ...options, fetcher, isOnline: () => false }).load('', null)).rejects.toMatchObject({ kind: 'offline' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('discards a late success after a newer denial, even when fetch ignores abort', async () => {
    const first = deferred<Response>(), second = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const reader = createInstallmentReminderReader({ ...options, fetcher });
    const old = reader.load('old', null), latest = reader.load('new', null);
    second.resolve(response({}, 403)); await expect(latest).rejects.toMatchObject({ kind: 'denied' });
    first.resolve(response()); expect(await old).toBeNull();
    expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
  it('ignores stale 401 and late JSON from cancelled navigation', async () => {
    const first = deferred<Response>(), expired = vi.fn();
    const reader = createInstallmentReminderReader({ ...options, onSessionExpired: expired, fetcher: vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockResolvedValueOnce(response()) });
    const old = reader.load('old', null); await reader.load('new', null); first.resolve(response({}, 401));
    expect(await old).toBeNull(); expect(expired).not.toHaveBeenCalled();
    const json = deferred<unknown>();
    const late = createInstallmentReminderReader({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200, json: () => json.promise } as Response) });
    const pending = late.load('', null); await Promise.resolve(); late.cancel(); json.resolve(queue); expect(await pending).toBeNull();
  });
  it('retains submitted search while paging, supports previous, and resets cursor on new search', () => {
    const first = searchInstallmentReminderView({ ...initialInstallmentReminderView(), draft: '  Salma  ' });
    const cursor = { due_on: '2026-01-01', line_id: patient };
    const second = nextInstallmentReminderView(first, cursor);
    expect(second).toEqual({ draft: 'Salma', query: 'Salma', page: 1, cursors: [null, cursor] });
    const previous = { ...second, page: 0 }; expect(previous.cursors[previous.page]).toBeNull();
    expect(searchInstallmentReminderView({ ...second, draft: 'DEMO-2' })).toEqual({ draft: 'DEMO-2', query: 'DEMO-2', cursors: [null], page: 0 });
    const changed = { ...cursor, line_id: other };
    expect(nextInstallmentReminderView(previous, changed).cursors).toEqual([null, changed]);
  });
});
