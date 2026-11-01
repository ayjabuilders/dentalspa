import {
  PatientDocumentListSchema, PatientDocumentDraftListSchema, PatientDocumentDraftSchema,
  PatientDocumentTemplatesSchema, PatientDocumentDraftReceiptSchema, PatientDocumentUploadReceiptSchema,
  PatientDocumentContentSchema, PatientDocumentDraftVersionsSchema, CreatePatientDocumentDraftSchema, UpdatePatientDocumentDraftSchema,
  type PatientDocumentSection, type PatientDocumentKind, type PatientDocumentItem,
  type PatientGeneratedType, type CreatePatientDocumentDraft, type UpdatePatientDocumentDraft,
} from '@dental/contracts';
import { sessionFetch } from '../../lib/renewing-session';

export const PATIENT_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export type PatientDocumentFailure = 'denied' | 'expired' | 'offline' | 'unavailable' | 'invalid' | 'conflict' | 'uncertain';
export class PatientDocumentError extends Error {
  constructor(public readonly kind: PatientDocumentFailure) { super(kind); }
}
export type PatientDocumentList = ReturnType<typeof PatientDocumentListSchema.parse>;
export type PatientDocumentDraftList = ReturnType<typeof PatientDocumentDraftListSchema.parse>;
export type PatientDocumentTemplate = ReturnType<typeof PatientDocumentTemplatesSchema.parse>['items'][number];
export type PatientDocumentSnapshot = ReturnType<typeof PatientDocumentContentSchema.parse>;
export type PatientDocumentVersions = ReturnType<typeof PatientDocumentDraftVersionsSchema.parse>['items'];
export type PatientDocumentUpload = { section: PatientDocumentSection; file: File; category: PatientDocumentKind; title: string; date: string };
type Scoped = { clinic_id: string; patient_id: string };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function validatePatientDocumentFile(file: Pick<File, 'size' | 'type'>) {
  return file.size > 0 && file.size <= PATIENT_DOCUMENT_MAX_BYTES && ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type);
}
export function patientDocumentTitleHeader(title: string) { return "UTF-8''" + encodeURIComponent(title.trim()); }

/** Private bytes and authored content stay in memory. All writes retain caller-owned idempotency keys. */
export function createPatientDocumentsTransport(options: {
  api: string; token: string; clinicId: string; patientId: string; onSessionExpired: () => void;
  onPrivateClear?: (kind: PatientDocumentFailure) => void; fetcher?: typeof globalThis.fetch;
}) {
  const fetcher = options.fetcher ?? sessionFetch, controllers = new Set<AbortController>();
  const base = options.api.replace(/\/$/, '') + '/api/v1/patients/' + encodeURIComponent(options.patientId) + '/documents';
  let active = true;
  function scoped<T extends Scoped>(value: T, mutation = false): T {
    if (!same(value.clinic_id, options.clinicId) || !same(value.patient_id, options.patientId)) throw new PatientDocumentError(mutation ? 'uncertain' : 'unavailable');
    return value;
  }
  async function request(path: string, init: RequestInit = {}, signal?: AbortSignal) {
    if (!active) throw new DOMException('Closed', 'AbortError');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new PatientDocumentError('offline');
    const controller = new AbortController(); controllers.add(controller);
    const mutation = !!init.method && init.method !== 'GET';
    try {
      const response = await fetcher(base + path, { ...init, headers: { Authorization: 'Bearer ' + options.token, 'X-Clinic-Id': options.clinicId, ...init.headers },
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([controller.signal, ...(signal ? [signal] : []), AbortSignal.timeout(mutation ? 60000 : 20000)]) });
      if (!active || signal?.aborted || controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (response.status === 401) { options.onPrivateClear?.('expired'); options.onSessionExpired(); throw new PatientDocumentError('expired'); }
      if (response.status === 403 || response.status === 404) { options.onPrivateClear?.('denied'); throw new PatientDocumentError('denied'); }
      if (response.status === 409) throw new PatientDocumentError('conflict');
      if ([400, 413, 415, 422].includes(response.status)) throw new PatientDocumentError('invalid');
      if (!response.ok) throw new PatientDocumentError(mutation ? 'uncertain' : 'unavailable');
      return response;
    } catch (error) {
      if (!active || signal?.aborted || controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (error instanceof PatientDocumentError) throw error;
      throw new PatientDocumentError(mutation ? 'uncertain' : typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable');
    } finally { controllers.delete(controller); }
  }
  async function json(path: string, init?: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const response = await request(path, init, signal);
    try { const value: unknown = await response.json(); if (!active || signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); return value; }
    catch (error) { if (!active || signal?.aborted) throw error; throw new PatientDocumentError(init?.method && init.method !== 'GET' ? 'uncertain' : 'unavailable'); }
  }
  function query(values: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    return params.size ? '?' + params.toString() : '';
  }
  const write = (method: string, key: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  function checked<T>(parse: (input: unknown) => T, raw: unknown, mutation = false): T {
    try { return parse(raw); } catch { throw new PatientDocumentError(mutation ? 'uncertain' : 'unavailable'); }
  }
  return {
    cancelAll() { for (const controller of controllers) controller.abort(); controllers.clear(); },
    dispose() { active = false; for (const controller of controllers) controller.abort(); controllers.clear(); },
    async list(section: PatientDocumentSection, q: string, cursor: string | null, signal?: AbortSignal) {
      const result = scoped(checked(PatientDocumentListSchema.parse, await json(query({ section, q, cursor }), undefined, signal)));
      if (result.section !== section || result.items.length > 10 || !result.capabilities.can_read || result.items.some(item => { scoped(item); return item.section !== section; })) throw new PatientDocumentError('unavailable');
      return result;
    },
    async drafts(type: PatientGeneratedType, q: string, cursor: string | null, signal?: AbortSignal) {
      const result = scoped(checked(PatientDocumentDraftListSchema.parse, await json('/drafts' + query({ type, q, cursor }), undefined, signal)));
      if (result.items.length > 10 || result.items.some(item => { scoped(item); return item.type !== type; })) throw new PatientDocumentError('unavailable');
      return result;
    },
    async templates(type: PatientGeneratedType, signal?: AbortSignal) {
      const result = scoped(checked(PatientDocumentTemplatesSchema.parse, await json('/templates' + query({ type }), undefined, signal)));
      if (result.items.some(item => item.type !== type)) throw new PatientDocumentError('unavailable');
      return result.items;
    },
    async draft(id: string, signal?: AbortSignal) {
      const result = scoped(checked(PatientDocumentDraftSchema.parse, await json('/drafts/' + encodeURIComponent(id), undefined, signal)));
      if (!same(result.id, id)) throw new PatientDocumentError('unavailable'); return result;
    },
    async versions(id: string, signal?: AbortSignal) {
      const result = scoped(checked(PatientDocumentDraftVersionsSchema.parse, await json('/drafts/' + encodeURIComponent(id) + '/versions', undefined, signal)));
      if (!same(result.draft_id, id) || new Set(result.items.map(item => item.version)).size !== result.items.length) throw new PatientDocumentError('unavailable');
      return result.items;
    },
    async upload(input: PatientDocumentUpload, key: string, signal?: AbortSignal) {
      if (!validatePatientDocumentFile(input.file)) throw new PatientDocumentError('invalid');
      const body = new FormData(); body.set('file', input.file);
      const result = checked(PatientDocumentUploadReceiptSchema.parse, await json('/uploads', { method: 'POST', body, headers: { 'Idempotency-Key': key, 'X-Document-Section': input.section, 'X-Document-Category': input.category, 'X-Document-Date': input.date, 'X-Document-Title': patientDocumentTitleHeader(input.title) } }, signal), true);
      scoped(result.item, true);
      if (result.item.source !== 'upload' || result.item.status !== 'stored' || result.item.section !== input.section || result.item.title !== input.title.trim() || result.item.category !== input.category || result.item.document_date !== input.date || result.item.size_bytes !== input.file.size || result.item.content_type !== input.file.type) throw new PatientDocumentError('uncertain');
      return result.item;
    },
    async create(input: CreatePatientDocumentDraft, key: string, signal?: AbortSignal) {
      const body = CreatePatientDocumentDraftSchema.parse(input);
      const result = checked(PatientDocumentDraftReceiptSchema.parse, await json('/drafts', write('POST', key, body), signal), true); scoped(result.draft, true);
      if (result.draft.type !== body.type || result.draft.template_id !== body.template_id || result.draft.template_version !== body.template_version || result.draft.title !== body.title || result.draft.document_date !== body.document_date || result.draft.content.body !== body.content.body) throw new PatientDocumentError('uncertain');
      return result.draft;
    },
    async update(id: string, input: UpdatePatientDocumentDraft, key: string, signal?: AbortSignal) {
      const body = UpdatePatientDocumentDraftSchema.parse(input);
      const result = checked(PatientDocumentDraftReceiptSchema.parse, await json('/drafts/' + encodeURIComponent(id), write('PATCH', key, body), signal), true); scoped(result.draft, true);
      if (!same(result.draft.id, id) || result.draft.version !== body.expected_version + 1 || result.draft.title !== body.title || result.draft.document_date !== body.document_date || result.draft.content.body !== body.content.body) throw new PatientDocumentError('uncertain');
      return result.draft;
    },
    async validate(id: string, version: number, key: string, signal?: AbortSignal) {
      const result = checked(PatientDocumentUploadReceiptSchema.parse, await json('/drafts/' + encodeURIComponent(id) + '/validate', write('POST', key, { expected_version: version }), signal), true); scoped(result.item, true);
      if (result.item.source !== 'generated' || result.item.status !== 'validated' || result.item.version !== version) throw new PatientDocumentError('uncertain'); return result.item;
    },
    async content(item: PatientDocumentItem, signal?: AbortSignal): Promise<{ blob: Blob; snapshot: PatientDocumentSnapshot | null }> {
      scoped(item);
      const response = await request('/' + encodeURIComponent(item.id) + '/content', undefined, signal);
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim();
      if (mime !== item.content_type) throw new PatientDocumentError('unavailable');
      const blob = await response.blob();
      if (!active || signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (blob.size > PATIENT_DOCUMENT_MAX_BYTES || !blob.size) throw new PatientDocumentError('unavailable');
      if (item.source === 'generated') {
        if (mime !== 'application/json') throw new PatientDocumentError('unavailable');
        let raw: unknown; try { raw = JSON.parse(await blob.text()); } catch { throw new PatientDocumentError('unavailable'); }
        const snapshot = scoped(checked(PatientDocumentContentSchema.parse, raw));
        if (!same(snapshot.document_id, item.id) || snapshot.version !== item.version || snapshot.type !== item.document_type || snapshot.title !== item.title || snapshot.document_date !== item.document_date || snapshot.template_id !== item.template_id || snapshot.template_version !== item.template_version) throw new PatientDocumentError('unavailable');
        return { blob, snapshot };
      }
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mime ?? '') || blob.size !== item.size_bytes) throw new PatientDocumentError('unavailable');
      return { blob, snapshot: null };
    },
  };
}
export type PatientDocumentsTransport = ReturnType<typeof createPatientDocumentsTransport>;
export const patientDocumentMessages: Record<PatientDocumentFailure, string> = {
  denied: 'Votre rôle ne permet pas cet accès, ou ce document n’est plus disponible. Aucun fichier n’a été supprimé.', expired: 'Session expirée. Connectez-vous à nouveau.',
  offline: 'Hors connexion. Les documents privés ont été retirés de cet écran.', unavailable: 'Le document n’a pas pu être vérifié. Réessayez.',
  invalid: 'Vérifiez le titre, la date, la catégorie et le fichier PDF, JPEG ou PNG de 20 Mio maximum.',
  conflict: 'Une autre version a été enregistrée. Rechargez le document avant de modifier ou valider.',
  uncertain: 'Résultat à vérifier : l’opération peut être enregistrée. Réessayez exactement le même envoi.',
};
