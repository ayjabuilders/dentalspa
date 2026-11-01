import { describe, expect, it, vi } from 'vitest';
import { createPatientDocumentsTransport, PATIENT_DOCUMENT_MAX_BYTES, patientDocumentTitleHeader, validatePatientDocumentFile } from './patient-documents-transport';

const clinic = '10000000-0000-4000-8000-000000000001', patient = '20000000-0000-4000-8000-000000000001', documentId = '30000000-0000-4000-8000-000000000001', foreign = '40000000-0000-4000-8000-000000000001';
const time = '2026-11-01T10:00:00Z', date = '2026-11-01';
const caps = { can_read_administrative: true, can_read_clinical: true, can_read: true, can_upload: true, can_upload_administrative: true, can_upload_clinical: true, can_create_report: true, can_create_prescription: true, can_edit_draft: true, can_edit_report: true, can_edit_prescription: true, can_validate: true, categories: ['other'] };
const item = { id: documentId, clinic_id: clinic, patient_id: patient, section: 'administrative', category: 'other', document_type: 'upload', title: 'وثيقة patient', document_date: date, content_type: 'application/pdf', size_bytes: 8, created_at: time, created_by: clinic, finalized_at: time, version: 1, source: 'upload', status: 'stored', template_id: null, template_version: null };
const list = { schema_version: 1, clinic_id: clinic, patient_id: patient, section: 'administrative', items: [item], next_cursor: null, capabilities: caps };
const draft = { id: documentId, clinic_id: clinic, patient_id: patient, type: 'report', title: 'Compte rendu FICTIF', document_date: date, template_id: clinic, template_version: 1, content: { body: 'Texte rédigé par le clinicien fictif.' }, version: 1, updated_at: time, updated_by: clinic };
const options = { api: 'http://localhost:4300', token: 'synthetic-token', clinicId: clinic, patientId: patient, onSessionExpired: vi.fn() };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('patient documents private transport', () => {
  it('reads scoped server pages with submitted search and an opaque cursor without caching', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(list));
    const transport = createPatientDocumentsTransport({ ...options, fetcher });
    expect(await transport.list('administrative', 'titre & %', 'opaque+/=', undefined)).toEqual(list);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(`/api/v1/patients/${patient}/documents`);
    expect(new URL(String(url)).searchParams.get('q')).toBe('titre & %');
    expect(new URL(String(url)).searchParams.get('cursor')).toBe('opaque+/=');
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer synthetic-token', 'X-Clinic-Id': clinic } });
  });
  it('rejects foreign clinic/patient, mixed items, wrong sections and oversized pages', async () => {
    for (const invalid of [{ ...list, clinic_id: foreign }, { ...list, patient_id: foreign }, { ...list, items: [{ ...item, patient_id: foreign }] }, { ...list, section: 'clinical' }, { ...list, items: Array.from({ length: 11 }, () => item) }]) {
      const transport = createPatientDocumentsTransport({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(invalid)) });
      await expect(transport.list('administrative', '', null)).rejects.toMatchObject({ kind: 'unavailable' });
    }
  });
  it('clears private presentation on denial and calls session expiry only on 401', async () => {
    const clear = vi.fn(), expired = vi.fn();
    const transport = createPatientDocumentsTransport({ ...options, onPrivateClear: clear, onSessionExpired: expired, fetcher: vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 403)).mockResolvedValueOnce(response({}, 401)) });
    await expect(transport.list('clinical', '', null)).rejects.toMatchObject({ kind: 'denied' });
    expect(clear).toHaveBeenLastCalledWith('denied'); expect(expired).not.toHaveBeenCalled();
    await expect(transport.list('clinical', '', null)).rejects.toMatchObject({ kind: 'expired' }); expect(expired).toHaveBeenCalledOnce();
  });
  it('discards cancelled reads even if fetch ignores AbortSignal and late JSON still resolves', async () => {
    const pending = deferred<unknown>(), controller = new AbortController();
    const transport = createPatientDocumentsTransport({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200, json: () => pending.promise } as Response) });
    const read = transport.list('administrative', '', null, controller.signal); await Promise.resolve(); controller.abort(); pending.resolve(list);
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps multipart bytes, Unicode metadata and idempotency identical after a lost response', async () => {
    const file = new File(['%PDF-1.7'], 'fictif.pdf', { type: 'application/pdf' });
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(response({ item, replayed: true }));
    const transport = createPatientDocumentsTransport({ ...options, fetcher });
    const input = { section: 'administrative' as const, file, title: item.title, date, category: 'other' as const }, key = foreign;
    await expect(transport.upload(input, key)).rejects.toMatchObject({ kind: 'uncertain' });
    expect(await transport.upload(input, key)).toEqual(item);
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init!.headers).get('Idempotency-Key')).toBe(key);
      expect(new Headers(init!.headers).get('X-Document-Section')).toBe('administrative');
      expect(new Headers(init!.headers).get('X-Document-Title')).toBe("UTF-8''" + encodeURIComponent(item.title));
      expect(new Headers(init!.headers).has('Content-Type')).toBe(false);
      expect(await ((init!.body as FormData).get('file') as File).text()).toBe('%PDF-1.7');
    }
    expect(patientDocumentTitleHeader('  identité وثيقة  ')).toBe("UTF-8''" + encodeURIComponent('identité وثيقة'));
  });
  it('rejects zero, oversized and unsupported uploads before sending', async () => {
    expect(validatePatientDocumentFile({ size: PATIENT_DOCUMENT_MAX_BYTES, type: 'image/jpeg' })).toBe(true);
    for (const value of [{ size: 0, type: 'application/pdf' }, { size: PATIENT_DOCUMENT_MAX_BYTES + 1, type: 'image/png' }, { size: 100, type: 'text/html' }]) expect(validatePatientDocumentFile(value)).toBe(false);
    const fetcher = vi.fn<typeof fetch>(), transport = createPatientDocumentsTransport({ ...options, fetcher });
    await expect(transport.upload({ section: 'administrative', file: new File(['html'], 'unsafe.html', { type: 'text/html' }), title: 'Test', date, category: 'other' }, foreign)).rejects.toMatchObject({ kind: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves authored content and expected version, treats mismatching write receipts as uncertain', async () => {
    const body = { expected_version: 1, title: draft.title, document_date: date, content: { body: 'Texte version deux.' } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ draft: { ...draft, version: 2, content: body.content }, replayed: false })).mockResolvedValueOnce(response({ draft: { ...draft, patient_id: foreign, version: 2, content: body.content }, replayed: true }));
    const transport = createPatientDocumentsTransport({ ...options, fetcher });
    expect((await transport.update(documentId, body, foreign)).version).toBe(2);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual(body);
    expect(fetcher.mock.calls[0]![1]!.method).toBe('PATCH');
    await expect(transport.update(documentId, body, foreign)).rejects.toMatchObject({ kind: 'uncertain' });
  });
  it('distinguishes version conflicts from ambiguous writes without manufacturing completion', async () => {
    const transport = createPatientDocumentsTransport({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 409)).mockResolvedValueOnce(response({}, 503)) });
    await expect(transport.validate(documentId, 1, foreign)).rejects.toMatchObject({ kind: 'conflict' });
    await expect(transport.validate(documentId, 1, foreign)).rejects.toMatchObject({ kind: 'uncertain' });
  });
  it('returns exact authenticated bytes and refuses MIME substitution', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } })).mockResolvedValueOnce(new Response('<script>', { headers: { 'content-type': 'text/html' } }));
    const transport = createPatientDocumentsTransport({ ...options, fetcher });
    const parsedItem = (await import('@dental/contracts')).PatientDocumentItemSchema.parse(item);
    const result = await transport.content(parsedItem); expect(await result.blob.text()).toBe('%PDF-1.7'); expect(result.snapshot).toBeNull();
    await expect(transport.content(parsedItem)).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('only accepts blank version-pinned templates and history for the requested draft', async () => {
    const template = { id: clinic, version: 1, type: 'report', label: 'Compte rendu vierge', initial_content: { body: '' } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ schema_version: 1, clinic_id: clinic, patient_id: patient, items: [template] })).mockResolvedValueOnce(response({ schema_version: 1, clinic_id: clinic, patient_id: patient, items: [{ ...template, initial_content: { body: 'Unsolicited clinical text' } }] })).mockResolvedValueOnce(response({ schema_version: 1, clinic_id: clinic, patient_id: patient, draft_id: foreign, items: [] }));
    const transport = createPatientDocumentsTransport({ ...options, fetcher });
    expect(await transport.templates('report')).toEqual([template]);
    await expect(transport.templates('report')).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(transport.versions(documentId)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
