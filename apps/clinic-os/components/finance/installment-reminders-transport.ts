import { LocalInstallmentReminderQueueSchema } from '@dental/contracts';
import { sessionFetch } from '../../lib/renewing-session';

export type InstallmentReminderQueue = ReturnType<typeof LocalInstallmentReminderQueueSchema.parse>;
export type InstallmentReminderCursor = NonNullable<InstallmentReminderQueue['next_cursor']>;
export type InstallmentReminderFailure = 'denied' | 'expired' | 'unavailable' | 'offline';
export class InstallmentReminderError extends Error {
  constructor(public readonly kind: InstallmentReminderFailure) { super(kind); }
}
export type InstallmentReminderViewState = { draft: string; query: string; cursors: (InstallmentReminderCursor | null)[]; page: number };
export function initialInstallmentReminderView(): InstallmentReminderViewState { return { draft: '', query: '', cursors: [null], page: 0 }; }
export function searchInstallmentReminderView(view: InstallmentReminderViewState): InstallmentReminderViewState {
  return { draft: view.draft.trim(), query: view.draft.trim(), cursors: [null], page: 0 };
}
export function nextInstallmentReminderView(view: InstallmentReminderViewState, cursor: InstallmentReminderCursor): InstallmentReminderViewState {
  return { ...view, cursors: [...view.cursors.slice(0, view.page + 1), cursor], page: view.page + 1 };
}

/** One private read at a time. A superseded response cannot publish data or expire a newer session. */
export function createInstallmentReminderReader(options: {
  api: string; token: string; clinicId: string; onSessionExpired: () => void;
  fetcher?: typeof globalThis.fetch; isOnline?: () => boolean;
}) {
  const fetcher = options.fetcher ?? sessionFetch;
  const online = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  let revision = 0;
  let active: AbortController | null = null;
  function cancel() { revision += 1; active?.abort(); active = null; }
  async function load(query: string, cursor: InstallmentReminderCursor | null): Promise<InstallmentReminderQueue | null> {
    cancel();
    const current = revision, controller = new AbortController(); active = controller;
    const stale = () => controller.signal.aborted || current !== revision;
    try {
      if (!online()) throw new InstallmentReminderError('offline');
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (cursor) { params.set('after_due', cursor.due_on); params.set('after_id', cursor.line_id); }
      const response = await fetcher(`${options.api.replace(/\/$/, '')}/api/v1/finance/installment-reminders${params.size ? '?' + params.toString() : ''}`, {
        method: 'GET', headers: { Authorization: 'Bearer ' + options.token, 'X-Clinic-Id': options.clinicId },
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (stale()) return null;
      if (response.status === 401) { options.onSessionExpired(); throw new InstallmentReminderError('expired'); }
      if (response.status === 403) throw new InstallmentReminderError('denied');
      if (!response.ok) throw new InstallmentReminderError('unavailable');
      const parsed = LocalInstallmentReminderQueueSchema.safeParse(await response.json());
      if (stale()) return null;
      if (!parsed.success || parsed.data.clinic_id.toLowerCase() !== options.clinicId.toLowerCase()) throw new InstallmentReminderError('unavailable');
      return parsed.data;
    } catch (error) {
      if (stale()) return null;
      if (error instanceof InstallmentReminderError) throw error;
      throw new InstallmentReminderError(online() ? 'unavailable' : 'offline');
    } finally { if (current === revision) active = null; }
  }
  return { load, cancel };
}
