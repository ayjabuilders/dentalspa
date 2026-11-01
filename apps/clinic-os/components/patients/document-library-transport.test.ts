import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { type LibraryItem, type LibraryMetadata } from '@dental/contracts';
import { createDocumentLibraryTransport, DocumentLibraryError, libraryDownloadName, libraryOptionsForSection, libraryBatchTitle, prepareLibraryUploadJobs, runLibraryUploadJobs, validLibraryFile, LIBRARY_MAX_BYTES } from './document-library-transport';
const clinic = '10000000-0000-4000-8000-000000000001', patient = '20000000-0000-4000-8000-000000000001', id = '30000000-0000-4000-8000-000000000001', foreign = '40000000-0000-4000-8000-000000000001';
const metadata: LibraryMetadata = { category: 'imaging', type: 'panoramic', title: '', document_date: null, notes: '', related_appointment_id: null };
const file = new File(['%PDF-1.7'], 'panoramique-fictive.pdf', { type: 'application/pdf' });
const item: LibraryItem = { id, clinic_id: clinic, patient_id: patient, ...metadata, title: file.name, content_type: 'application/pdf', size_bytes: 8, created_at: '2026-11-01T12:00:00Z', uploaded_by: 'Praticien FICTIF', version: 1, can_edit: true, can_delete: true };
const list = { clinic_id: clinic, patient_id: patient, items: [item], next_cursor: null };
const options = { api: 'http://localhost:4300', token: 'synthetic-token', clinicId: clinic, patientId: patient, onSessionExpired: vi.fn() };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('upload-only document library', () => {
  it('sends hosted file bytes only to private staging and finalizes with the original key', async () => {
    const storageOrigin='https://giufpdppsunryyhfnzps.supabase.co';
    const ticket={schema_version:1,clinic_id:clinic,patient_id:patient,request_key:id,upload_url:storageOrigin+'/storage/v1/object/upload/sign/patient-documents/_staging/1/'+id+'?token=synthetic',ticket:'opaque-encrypted-ticket',expires_in:1800};
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(response(ticket)).mockResolvedValueOnce(response({item,replayed:false}));
    const storageFetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const transport=createDocumentLibraryTransport({...options,fetcher,storageOrigin,storageFetcher});
    expect(await transport.upload(file,metadata,id)).toEqual(item);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toMatchObject({size_bytes:file.size,sha256:createHash('sha256').update('%PDF-1.7').digest('hex'),metadata});
    expect(fetcher.mock.calls[1]![1]).toMatchObject({headers:{'Idempotency-Key':id},body:JSON.stringify({ticket:ticket.ticket})});
    expect(storageFetcher.mock.calls[0]![1]).toMatchObject({method:'PUT',body:file,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',headers:{'Content-Type':'application/pdf'}});
    expect(storageFetcher.mock.calls[0]![1]!.headers).not.toHaveProperty('Authorization');
    fetcher.mockResolvedValueOnce(response({...ticket,upload_url:'https://evil.test/upload'}));
    await expect(transport.upload(file,metadata,id)).rejects.toMatchObject({kind:'uncertain'});
    expect(storageFetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(response(ticket));storageFetcher.mockRejectedValueOnce(new Error('network lost'));
    await expect(transport.upload(file,metadata,id)).rejects.toMatchObject({kind:'uncertain'});
    // No finalization after an unconfirmed transfer; the batch retains its key for retry.
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('downloads hosted bytes without staff credentials and verifies the checksum', async () => {
    const storageOrigin='https://giufpdppsunryyhfnzps.supabase.co';
    const ticket={schema_version:1,clinic_id:clinic,patient_id:patient,document_id:id,url:storageOrigin+'/storage/v1/object/sign/patient-documents/'+clinic+'/'+patient+'/clinical/'+id+'?token=synthetic',expires_in:30,content_type:item.content_type,size_bytes:item.size_bytes,sha256:createHash('sha256').update('%PDF-1.7').digest('hex')};
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>response(ticket));
    const storageFetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('%PDF-1.7',{headers:{'content-type':'application/pdf'}}));
    const transport=createDocumentLibraryTransport({...options,fetcher,storageOrigin,storageFetcher});
    expect(await (await transport.content(item)).text()).toBe('%PDF-1.7');
    expect(String(fetcher.mock.calls[0]![0])).toContain('/content-link');
    expect(storageFetcher.mock.calls[0]![1]).toMatchObject({cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
    expect(storageFetcher.mock.calls[0]![1]).not.toHaveProperty('headers');
    storageFetcher.mockResolvedValueOnce(new Response('corrupt!',{headers:{'content-type':'application/pdf'}}));
    await expect(transport.content(item)).rejects.toMatchObject({kind:'unavailable'});
    for(const url of ['https://evil.test/file',ticket.url.replace(patient,foreign)]) {
      fetcher.mockResolvedValueOnce(response({...ticket,url}));
      await expect(transport.content(item)).rejects.toMatchObject({kind:'unavailable'});
    }
    expect(storageFetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValueOnce(response({...ticket,patient_id:foreign}));
    await expect(transport.content(item)).rejects.toMatchObject({kind:'unavailable'});
    storageFetcher.mockResolvedValueOnce(new Response('%PDF-1.7 extra',{headers:{'content-type':'application/pdf'}}));
    await expect(transport.content(item)).rejects.toMatchObject({kind:'unavailable'});
  });
  it('reads global search/category/cursor privately and rejects foreign or mismatched rows', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(list)).mockResolvedValueOnce(response({ ...list, items: [{ ...item, patient_id: foreign }] })).mockResolvedValueOnce(response({ ...list, clinic_id: foreign }));
    const transport = createDocumentLibraryTransport({ ...options, fetcher });
    expect(await transport.list('A & %', 'imaging', 'opaque+/=')).toEqual(list);
    const [url, init] = fetcher.mock.calls[0]!; expect(new URL(String(url)).searchParams.get('q')).toBe('A & %'); expect(new URL(String(url)).searchParams.get('category')).toBe('imaging'); expect(new URL(String(url)).searchParams.get('cursor')).toBe('opaque+/=');
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer synthetic-token', 'X-Clinic-Id': clinic } });
    await expect(transport.list('', '', null)).rejects.toMatchObject({ kind: 'unavailable' }); await expect(transport.list('', '', null)).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('scopes section reads and upload choices without changing the combined timeline', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(list));
    const transport = createDocumentLibraryTransport({ ...options, fetcher });
    await expect(transport.list('', '', null, undefined, 'clinical')).resolves.toEqual(list);
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('section')).toBe('clinical');
    await expect(transport.list('', '', null, undefined, 'administrative')).rejects.toMatchObject({ kind: 'unavailable' });
    await transport.list('', '', null);
    expect(new URL(String(fetcher.mock.calls[2]![0])).searchParams.has('section')).toBe(false);
    const choices = { clinic_id: clinic, patient_id: patient, appointments: [], categories: [
      { id: 'imaging', label: 'Imagerie', section: 'clinical' as const, types: [{ id: 'panoramic', label: 'Panoramique' }] },
      { id: 'administrative', label: 'Administratif', section: 'administrative' as const, types: [{ id: 'identity', label: 'Identité' }] },
    ] };
    expect(libraryOptionsForSection(choices, 'administrative').categories.map(category => category.id)).toEqual(['administrative']);
    expect(libraryOptionsForSection(choices, 'clinical').categories.map(category => category.id)).toEqual(['imaging']);
    expect(libraryOptionsForSection(choices)).toBe(choices);
    expect(choices.categories).toHaveLength(2);
  });
  it('does not publish a cancelled late response', async () => {
    const pending = deferred<Response>(), controller = new AbortController(), expired = vi.fn();
    const transport = createDocumentLibraryTransport({ ...options, onSessionExpired: expired, fetcher: vi.fn<typeof fetch>().mockReturnValue(pending.promise) });
    const read = transport.list('', '', null, controller.signal); controller.abort(); pending.resolve(response({}, 401)); await expect(read).rejects.toMatchObject({ name: 'AbortError' }); expect(expired).not.toHaveBeenCalled();
  });
  it('pins immutable per-file metadata and distinct keys before upload', () => {
    const source = { ...metadata, title: 'Imagerie' }, jobs = prepareLibraryUploadJobs([file, file], source); source.notes = 'changed later';
    expect(jobs[0]!.metadata.notes).toBe(''); expect(jobs[0]!.key).not.toBe(jobs[1]!.key); expect(jobs[0]!.metadata.title).not.toBe(jobs[1]!.metadata.title); expect(jobs[0]!.metadata.title).toContain(file.name);
    expect(libraryBatchTitle('', file.name, 0, 3)).toBe(''); expect(libraryBatchTitle('x'.repeat(160), 'f'.repeat(200), 20, 25).length).toBeLessThanOrEqual(160);
  });
  it('retains completed imports and retries only the uncertain file with the exact original key/content', async () => {
    const files = [file, new File(['%PDF-1.7'], 'second.pdf', { type: 'application/pdf' }), new File(['%PDF-1.7'], 'third.pdf', { type: 'application/pdf' })];
    const jobs = prepareLibraryUploadJobs(files, metadata), controller = new AbortController(), changed = vi.fn();
    const upload = vi.fn().mockResolvedValueOnce(item).mockRejectedValueOnce(new DocumentLibraryError('uncertain')).mockResolvedValueOnce(item).mockResolvedValueOnce(item);
    await runLibraryUploadJobs(jobs, { upload }, changed, controller.signal); expect(jobs.map(job => job.state)).toEqual(['done', 'uncertain', 'done']);
    const original = upload.mock.calls[1]!; await runLibraryUploadJobs(jobs, { upload }, changed, controller.signal); expect(jobs.every(job => job.state === 'done')).toBe(true); expect(upload).toHaveBeenCalledTimes(4);
    expect(upload.mock.calls[3]![0]).toBe(original[0]); expect(upload.mock.calls[3]![1]).toEqual(original[1]); expect(upload.mock.calls[3]![2]).toBe(original[2]);
  });
  it('stops remaining imports on revoked access', async () => {
    const jobs = prepareLibraryUploadJobs([file, file], metadata), upload = vi.fn().mockRejectedValue(new DocumentLibraryError('denied'));
    await runLibraryUploadJobs(jobs, { upload }, () => {}, new AbortController().signal); expect(upload).toHaveBeenCalledOnce(); expect(jobs[1]!.state).toBe('queued');
  });
  it('keeps an unresolved outcome and original key when a later retry cannot go online', async () => {
    const jobs = prepareLibraryUploadJobs([file], metadata), key = jobs[0]!.key;
    const upload = vi.fn().mockRejectedValueOnce(new DocumentLibraryError('uncertain')).mockRejectedValueOnce(new DocumentLibraryError('offline')).mockResolvedValueOnce(item);
    const controller = new AbortController();
    await runLibraryUploadJobs(jobs, { upload }, () => {}, controller.signal);
    await runLibraryUploadJobs(jobs, { upload }, () => {}, controller.signal);
    expect(jobs[0]!.state).toBe('uncertain'); expect(jobs[0]!.key).toBe(key);
    await runLibraryUploadJobs(jobs, { upload }, () => {}, controller.signal);
    expect(jobs[0]!.state).toBe('done'); expect(upload.mock.calls.map(call => call[2])).toEqual([key, key, key]);
  });
  it('sends each original binary and JSON metadata once per request, preserving the caller key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ item, replayed: false }));
    expect(await createDocumentLibraryTransport({ ...options, fetcher }).upload(file, metadata, foreign)).toEqual(item);
    const [url, init] = fetcher.mock.calls[0]!; expect(String(url)).toContain('/library/uploads'); expect(new Headers(init!.headers).get('Idempotency-Key')).toBe(foreign); expect(new Headers(init!.headers).has('Content-Type')).toBe(false);
    expect(JSON.parse(String((init!.body as FormData).get('metadata')))).toEqual(metadata); expect(await ((init!.body as FormData).get('file') as File).text()).toBe('%PDF-1.7');
  });
  it('enforces file limits and taxonomy pairing without unsupported native scan claims', async () => {
    expect(validLibraryFile({ type: 'image/jpeg', size: LIBRARY_MAX_BYTES })).toBe(true);
    for (const sample of [{ type: 'application/pdf', size: LIBRARY_MAX_BYTES + 1 }, { type: 'application/dicom', size: 100 }, { type: 'model/stl', size: 100 }, { type: 'image/png', size: 0 }]) expect(validLibraryFile(sample)).toBe(false);
    const fetcher = vi.fn<typeof fetch>(), transport = createDocumentLibraryTransport({ ...options, fetcher });
    await expect(transport.upload(file, { ...metadata, type: 'cnss' }, foreign)).rejects.toMatchObject({ kind: 'invalid' }); expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses expected version for metadata edits and deletion, rejecting conflict or false receipts', async () => {
    const updated = { ...metadata, title: 'Panoramique', notes: 'Classement fictif' }, fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ item: { ...item, ...updated, version: 2 }, replayed: false })).mockResolvedValueOnce(response({}, 409)).mockResolvedValueOnce(response({ id: foreign, clinic_id: clinic, patient_id: patient, deleted: true, replayed: false }));
    const transport = createDocumentLibraryTransport({ ...options, fetcher }); expect((await transport.update(item, updated, foreign)).version).toBe(2);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual({ expected_version: 1, metadata: updated });
    await expect(transport.remove(item, foreign)).rejects.toMatchObject({ kind: 'conflict' }); expect(fetcher.mock.calls[1]![1]!.method).toBe('DELETE');
    await expect(transport.remove(item, foreign)).rejects.toMatchObject({ kind: 'uncertain' });
  });
  it('keeps a single correct download extension for original names and renamed documents', () => {
    expect(libraryDownloadName({ title: 'scan.PDF', content_type: 'application/pdf' })).toBe('scan.PDF');
    expect(libraryDownloadName({ title: 'photo.jpeg', content_type: 'image/jpeg' })).toBe('photo.jpeg');
    expect(libraryDownloadName({ title: 'Bilan / contrôle', content_type: 'application/pdf' })).toBe('Bilan _ contrôle.pdf');
  });
  it('downloads exact private bytes and rejects MIME or size substitution', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } })).mockResolvedValueOnce(new Response('bad', { headers: { 'content-type': 'application/pdf' } })).mockResolvedValueOnce(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    const transport = createDocumentLibraryTransport({ ...options, fetcher }); expect(await (await transport.content(item)).text()).toBe('%PDF-1.7'); await expect(transport.content(item)).rejects.toMatchObject({ kind: 'unavailable' }); await expect(transport.content(item)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
