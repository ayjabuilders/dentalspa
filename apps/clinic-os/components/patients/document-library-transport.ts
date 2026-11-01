import { createRequestKey } from '../../lib/request-key';
import { LibraryUploadTicketSchema, LibraryDownloadSchema, LibraryListSchema, LibraryOptionsSchema, LibraryReceiptSchema, LibraryUpdateSchema, LibraryDeleteSchema, LibraryDeleteReceiptSchema, LibraryMetadataSchema, patientDocumentDefinition, type LibraryMetadata, type LibraryItem } from '@dental/contracts';
import { sessionFetch } from '../../lib/renewing-session';
export type DocumentLibraryList = ReturnType<typeof LibraryListSchema.parse>;
export type DocumentLibraryOptions = ReturnType<typeof LibraryOptionsSchema.parse>;
export type DocumentLibrarySection = 'administrative' | 'clinical';
export function libraryOptionsForSection(options: DocumentLibraryOptions, section?: DocumentLibrarySection): DocumentLibraryOptions { return section ? { ...options, categories: options.categories.filter(category => category.section === section) } : options; }
export type LibraryFailure = 'invalid' | 'denied' | 'expired' | 'offline' | 'unavailable' | 'conflict' | 'uncertain';
export class DocumentLibraryError extends Error { constructor(public readonly kind: LibraryFailure) { super(kind); } }
export const LIBRARY_MAX_BYTES = 20 * 1024 * 1024;
export const validLibraryFile = (file: Pick<File, 'size' | 'type'>) => file.size > 0 && file.size <= LIBRARY_MAX_BYTES && ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type);
export function libraryDownloadName(item: Pick<LibraryItem, 'title' | 'content_type'>) {
  const name = item.title.trim().replace(/[<>:"/\\|?*]/gu, '_').replace(/[. ]+$/u, '') || 'document';
  const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[item.content_type];
  return name.toLowerCase().endsWith(extension) || (item.content_type === 'image/jpeg' && name.toLowerCase().endsWith('.jpeg')) ? name : name + extension;
}
export const libraryMessages: Record<LibraryFailure, string> = { invalid: 'Vérifiez le classement, les champs et le fichier PDF, JPEG ou PNG (20 Mio maximum).', denied: 'Accès refusé ou document indisponible. Les données privées ont été retirées.', expired: 'Session expirée. Connectez-vous à nouveau.', offline: 'Hors connexion. Retrouvez le réseau pour continuer.', unavailable: 'La bibliothèque n’a pas pu être vérifiée. Réessayez.', conflict: 'Le document a changé. Fermez puis actualisez avant de modifier à nouveau.', uncertain: 'Résultat à vérifier. Réessayez la même opération pour éviter un doublon.' };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function createDocumentLibraryTransport(options: { api: string; token: string; clinicId: string; patientId: string; onSessionExpired: () => void; onPrivateClear?: () => void; fetcher?: typeof globalThis.fetch; storageOrigin?: string; storageFetcher?: typeof globalThis.fetch }) {
  const fetcher = options.fetcher ?? sessionFetch, base = options.api.replace(/\/$/, '') + '/api/v1/patients/' + encodeURIComponent(options.patientId) + '/documents';
  function scope<T extends { clinic_id: string; patient_id: string }>(value: T, mutation = false) { if (!same(value.clinic_id, options.clinicId) || !same(value.patient_id, options.patientId)) throw new DocumentLibraryError(mutation ? 'uncertain' : 'unavailable'); return value; }
  async function response(path: string, init?: RequestInit, signal?: AbortSignal) {
    const mutation = !!init?.method && init.method !== 'GET';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new DocumentLibraryError('offline');
    try {
      const result = await fetcher(base + path, { ...init, headers: { Authorization: 'Bearer ' + options.token, 'X-Clinic-Id': options.clinicId, ...init?.headers }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(mutation ? 60000 : 20000)]) });
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (result.status === 401) { options.onPrivateClear?.(); options.onSessionExpired(); throw new DocumentLibraryError('expired'); }
      if (result.status === 403 || result.status === 404) { options.onPrivateClear?.(); throw new DocumentLibraryError('denied'); }
      if (result.status === 409) throw new DocumentLibraryError('conflict');
      if ([400, 413, 415, 422].includes(result.status)) throw new DocumentLibraryError('invalid');
      if (!result.ok) throw new DocumentLibraryError(mutation ? 'uncertain' : 'unavailable');
      return result;
    } catch (error) { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); if (error instanceof DocumentLibraryError) throw error; throw new DocumentLibraryError(mutation ? 'uncertain' : 'unavailable'); }
  }
  async function json(path: string, init?: RequestInit, signal?: AbortSignal) { const result = await response(path, init, signal); try { const body: unknown = await result.json(); if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); return body; } catch (error) { if (signal?.aborted) throw error; throw new DocumentLibraryError(init?.method ? 'uncertain' : 'unavailable'); } }
  const command = (method: string, key: string, body: unknown): RequestInit => ({ method, headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function validateItem(item: LibraryItem, mutation = false) { scope(item, mutation); if (!patientDocumentDefinition(item.category, item.type) || item.size_bytes > LIBRARY_MAX_BYTES) throw new DocumentLibraryError(mutation ? 'uncertain' : 'unavailable'); return item; }
  return {
    async list(q: string, category: string, cursor: string | null, signal?: AbortSignal, section?: DocumentLibrarySection) {
      const params = new URLSearchParams(); if (q.trim()) params.set('q', q.trim()); if (category) params.set('category', category); if (cursor) params.set('cursor', cursor); if (section) params.set('section', section);
      const parsed = LibraryListSchema.safeParse(await json('/library' + (params.size ? '?' + params : ''), undefined, signal));
      if (!parsed.success) throw new DocumentLibraryError('unavailable'); const result = scope(parsed.data);
      if (new Set(result.items.map(item => item.id.toLowerCase())).size !== result.items.length) throw new DocumentLibraryError('unavailable');
      for (const item of result.items) { validateItem(item); if ((category && item.category !== category) || (section && patientDocumentDefinition(item.category, item.type)?.section !== section)) throw new DocumentLibraryError('unavailable'); } return result;
    },
    async options(signal?: AbortSignal) {
      const parsed = LibraryOptionsSchema.safeParse(await json('/library/options', undefined, signal)); if (!parsed.success) throw new DocumentLibraryError('unavailable');
      const result = scope(parsed.data); if (result.categories.some(category => !category.types.length || category.types.some(type => !patientDocumentDefinition(category.id, type.id)))) throw new DocumentLibraryError('unavailable'); return result;
    },
    async upload(file: File, metadata: LibraryMetadata, key: string, signal?: AbortSignal) {
      const parsedMetadata = LibraryMetadataSchema.safeParse(metadata); if (!parsedMetadata.success || !validLibraryFile(file)) throw new DocumentLibraryError('invalid');
      let receipt:unknown;
      const provider=options.storageOrigin??process.env.NEXT_PUBLIC_SUPABASE_URL;
      if(options.storageOrigin||process.env.NEXT_PUBLIC_DOCUMENT_DIRECT_TRANSFER==='true'||(provider&&/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(provider))) {
        try {
          const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
          const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
          const issued=LibraryUploadTicketSchema.safeParse(await json('/library/uploads/start',command('POST',key,{metadata:parsedMetadata.data,original_name:file.name,content_type:file.type,size_bytes:file.size,sha256}),signal));
          if(!issued.success)throw new DocumentLibraryError('uncertain');
          scope(issued.data,true);
          if(!same(issued.data.request_key,key))throw new DocumentLibraryError('uncertain');
          const url=new URL(issued.data.upload_url),origin=new URL(provider!);
          if(url.origin!==origin.origin||url.username||url.password||url.hash||!/^\/storage\/v1\/object\/upload\/sign\/patient-documents\/_staging\/[0-9]+\/[0-9a-f-]{36}$/.test(url.pathname))throw new DocumentLibraryError('uncertain');
          if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
          const sent=await (options.storageFetcher??globalThis.fetch)(url.toString(),{method:'PUT',body:file,headers:{'Content-Type':file.type,'cache-control':'0'},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(120000)])});
          if(!sent.ok)throw new DocumentLibraryError([400,413,415,422].includes(sent.status)?'invalid':'uncertain');
          receipt=await json('/library/uploads/finish',command('POST',key,{ticket:issued.data.ticket}),signal);
        } catch(error) {if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(error instanceof DocumentLibraryError)throw error;throw new DocumentLibraryError('uncertain');}
      } else {
        const body = new FormData(); body.set('file', file); body.set('metadata', JSON.stringify(parsedMetadata.data));
        receipt=await json('/library/uploads', { method: 'POST', body, headers: { 'Idempotency-Key': key } }, signal);
      }
      const parsed = LibraryReceiptSchema.safeParse(receipt); if (!parsed.success) throw new DocumentLibraryError('uncertain');
      const item = validateItem(parsed.data.item, true); if (item.size_bytes !== file.size || item.content_type !== file.type || item.category !== metadata.category || item.type !== metadata.type || (metadata.title && item.title !== metadata.title) || item.document_date !== metadata.document_date || item.notes !== metadata.notes || item.related_appointment_id !== metadata.related_appointment_id) throw new DocumentLibraryError('uncertain'); return item;
    },
    async update(item: LibraryItem, metadata: LibraryMetadata, key: string, signal?: AbortSignal) {
      validateItem(item); const body = LibraryUpdateSchema.safeParse({ expected_version: item.version, metadata }); if (!body.success) throw new DocumentLibraryError('invalid');
      const parsed = LibraryReceiptSchema.safeParse(await json('/library/' + item.id, command('PATCH', key, body.data), signal)); if (!parsed.success) throw new DocumentLibraryError('uncertain');
      const result = validateItem(parsed.data.item, true); if (!same(result.id, item.id) || result.version !== item.version + 1 || result.category !== metadata.category || result.type !== metadata.type || (metadata.title && result.title !== metadata.title) || result.notes !== metadata.notes || result.document_date !== metadata.document_date || result.related_appointment_id !== metadata.related_appointment_id) throw new DocumentLibraryError('uncertain'); return result;
    },
    async remove(item: LibraryItem, key: string, signal?: AbortSignal) {
      validateItem(item); const body = LibraryDeleteSchema.parse({ expected_version: item.version });
      const parsed = LibraryDeleteReceiptSchema.safeParse(await json('/library/' + item.id, command('DELETE', key, body), signal)); if (!parsed.success) throw new DocumentLibraryError('uncertain');
      const result = scope(parsed.data, true); if (!same(result.id, item.id)) throw new DocumentLibraryError('uncertain'); return result;
    },
    async content(item: LibraryItem, signal?: AbortSignal) {
      validateItem(item);
      const provider = options.storageOrigin ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      // Local/LAN demos keep the authenticated proxy. Hosted files bypass the Function payload limit.
      if (options.storageOrigin || process.env.NEXT_PUBLIC_DOCUMENT_DIRECT_TRANSFER==='true' || (provider && /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(provider))) {
        const ticket = LibraryDownloadSchema.safeParse(await json('/' + item.id + '/content-link', undefined, signal));
        if (!ticket.success) throw new DocumentLibraryError('unavailable');
        scope(ticket.data);
        const value = ticket.data;
        if (!same(value.document_id,item.id) || value.size_bytes!==item.size_bytes || value.content_type!==item.content_type) throw new DocumentLibraryError('unavailable');
        let url: URL;
        try {
          url=new URL(value.url);
          const origin=new URL(provider!);
          if(url.origin!==origin.origin||url.username||url.password||url.hash||!['http:','https:'].includes(url.protocol)) throw new Error('Invalid download origin');
          const prefix='/storage/v1/object/sign/patient-documents/'+options.clinicId+'/'+options.patientId+'/';
          if(!['administrative','clinical'].some(section=>url.pathname===prefix+section+'/'+item.id)) throw new Error('Invalid document path');
        } catch { throw new DocumentLibraryError('unavailable'); }
        try {
          const download = await (options.storageFetcher ?? globalThis.fetch)(url.toString(), {cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(60000)])});
          if (!download.ok || download.headers.get('content-type')?.split(';')[0]?.trim()!==item.content_type || !download.body) throw new DocumentLibraryError('unavailable');
          const reader=download.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]= [];
          let size=0;
          try { for(;;) { const part=await reader.read(); if(part.done)break; size+=part.value.length; if(size>item.size_bytes) throw new DocumentLibraryError('unavailable'); chunks.push(new Uint8Array(part.value)); } }
          finally { await reader.cancel().catch(()=>undefined); reader.releaseLock(); }
          if(size!==item.size_bytes)throw new DocumentLibraryError('unavailable');
          const blob=new Blob(chunks,{type:item.content_type});
          const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
          const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
          if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
          if(hash!==value.sha256)throw new DocumentLibraryError('unavailable');
          return blob;
        } catch(error) { if(signal?.aborted)throw new DOMException('Cancelled','AbortError'); if(error instanceof DocumentLibraryError)throw error; throw new DocumentLibraryError('unavailable'); }
      }
      const result = await response('/' + item.id + '/content', undefined, signal);
      if (result.headers.get('content-type')?.split(';')[0]?.trim() !== item.content_type) throw new DocumentLibraryError('unavailable');
      const blob = await result.blob(); if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); if (blob.size !== item.size_bytes || blob.size > LIBRARY_MAX_BYTES) throw new DocumentLibraryError('unavailable'); return blob;
    },
  };
}
export type DocumentLibraryTransport = ReturnType<typeof createDocumentLibraryTransport>;
export type LibraryUploadJob = { key: string; file: File; metadata: LibraryMetadata; state: 'queued' | 'uploading' | 'done' | 'uncertain' | 'error'; item?: LibraryItem; error?: string };
export function libraryBatchTitle(title: string, fileName: string, index: number, count: number) { if (!title.trim()) return ''; if (count === 1) return title.trim(); const suffix = ` — ${index + 1} · ${fileName.slice(0, 110)}`; return title.trim().slice(0, 160 - suffix.length) + suffix; }
export function prepareLibraryUploadJobs(files: File[], metadata: LibraryMetadata): LibraryUploadJob[] { return files.map((file, index) => ({ key: createRequestKey(), file, metadata: LibraryMetadataSchema.parse({ ...metadata, title: libraryBatchTitle(metadata.title, file.name, index, files.length) }), state: 'queued' })); }
export async function runLibraryUploadJobs(jobs: LibraryUploadJob[], transport: Pick<DocumentLibraryTransport, 'upload'>, changed: () => void, signal: AbortSignal) {
  for (const job of jobs) {
    if (signal.aborted) return; if (job.state === 'done') continue;
    const previouslyUncertain = job.state === 'uncertain';
    job.state = 'uploading'; job.error = undefined; changed();
    try { job.item = await transport.upload(job.file, job.metadata, job.key, signal); job.state = 'done'; }
    catch (error) { const kind = error instanceof DocumentLibraryError ? error.kind : 'uncertain'; job.state = kind === 'uncertain' || (previouslyUncertain && !['denied', 'expired'].includes(kind)) ? 'uncertain' : 'error'; job.error = libraryMessages[kind] + (job.state === 'uncertain' && kind !== 'uncertain' ? ' Le résultat précédent reste à vérifier.' : ''); if (['denied', 'expired', 'offline'].includes(kind)) { if (!signal.aborted) changed(); return; } }
    if (!signal.aborted) changed();
  }
}
