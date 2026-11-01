import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const logPath = '.local/qa/document-library-native-api.log';
const lines = [];
const check = (condition, label, detail = '') => {
  lines.push(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures++;
};
let failures = 0;
let uploadId;
let uploadVersion;
let managerToken;
let archived = false;
const sessions = [];
const clinicId = '10000000-0000-4000-8000-000000000001';
const patientId = '20000000-0000-4000-8000-000000000001';
const otherPatientId = '20000000-0000-4000-8000-000000000002';
const api = 'http://127.0.0.1:4300/api/v1';
const authUrl = 'http://127.0.0.1:54321/auth/v1';
const pdfBytes = Buffer.from('%PDF-1.4\n% Synthetic local document library verification only\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'ascii');
const settings = Object.fromEntries(readFileSync('apps/clinic-os/.env.local', 'utf8').split(/\r?\n/u).filter(line => line.includes('=')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/gu, '')]; }));
const anon = settings.NEXT_PUBLIC_SUPABASE_ANON_KEY || settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(anon, 'Local publishable Supabase key is required');
const documents = JSON.parse(readFileSync('.local/document-demo-access.json', 'utf8'));
const owner = JSON.parse(readFileSync('.local/owner-demo-access.json', 'utf8'));
assert.equal(documents.clinicId, clinicId, 'Expected local synthetic clinic');
const dentist = documents.accounts.find(account => account.role === 'dentist');
const assistant = documents.accounts.find(account => account.role === 'assistant');
assert.ok(dentist?.email && dentist?.password && assistant?.email && assistant?.password, 'Dedicated local dentist and assistant credentials are required');
const db = new pg.Client({ host: '127.0.0.1', port: 54322, database: 'postgres', user: 'postgres', password: 'postgres', connectionTimeoutMillis: 5000 });

async function login(account) {
  const response = await fetch(`${authUrl}/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
  assert.equal(response.status, 200, 'Local synthetic account login');
  const session = await response.json();
  assert.ok(typeof session.access_token === 'string' && session.access_token.length > 0, 'Local login returned an access token');
  sessions.push(session.access_token);
  return session.access_token;
}

function headers(token, extra = {}) { return { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId, ...extra }; }
async function jsonRequest(token, path, method = 'GET', body, idempotencyKey) {
  const response = await fetch(`${api}${path}`, { method, headers: headers(token, { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data;
  try { data = await response.json(); } catch { data = undefined; }
  return { response, data };
}

try {
  await db.connect();
  const patientCheck = await db.query('select count(*)::int n from public.patients where clinic_id=$1 and id=any($2::uuid[])', [clinicId, [patientId, otherPatientId]]);
  assert.equal(patientCheck.rows[0]?.n, 2, 'Two existing synthetic patients in the fixture clinic are required');
  managerToken = await login(owner);
  const dentistToken = await login(dentist);
  const assistantToken = await login(assistant);
  lines.push('PASS local Auth login for manager, dentist, and assistant');

  const uploadKey = randomUUID();
  const metadata = { category: 'imaging', type: 'panoramic', title: 'QA document fictif', document_date: '2026-11-01', notes: 'Vérification technique locale uniquement.', related_appointment_id: null };
  const upload = async () => {
    const form = new globalThis.FormData();
    form.set('file', new globalThis.Blob([pdfBytes], { type: 'application/pdf' }), 'document-test.pdf');
    form.set('metadata', JSON.stringify(metadata));
    return fetch(`${api}/patients/${patientId}/documents/library/uploads`, { method: 'POST', headers: headers(managerToken, { 'Idempotency-Key': uploadKey }), body: form });
  };
  const firstResponse = await upload();
  check(firstResponse.status === 200, 'manager uploads clinical file to private Storage through API');
  const first = await firstResponse.json();
  uploadId = first?.item?.id;
  uploadVersion = first?.item?.version;
  check(typeof uploadId === 'string' && uploadVersion === 1, 'upload receipt contains scoped file id and initial version');
  check(first?.item?.clinic_id === clinicId && first?.item?.patient_id === patientId, 'upload receipt is tenant and patient scoped');
  check(!JSON.stringify(first).includes('storage_path') && !JSON.stringify(first).includes('signedUrl'), 'receipt does not expose Storage path or public URL');

  const retryResponse = await upload();
  const retry = await retryResponse.json();
  check(retryResponse.status === 200 && retry?.item?.id === uploadId && retry?.replayed === true, 'same idempotency key replays the original upload exactly once');

  const updateKey = randomUUID();
  const updatedMetadata = { ...metadata, title: 'QA document fictif — classé' };
  const updateBody = { expected_version: 1, metadata: updatedMetadata };
  const update = await jsonRequest(managerToken, `/patients/${patientId}/documents/library/${uploadId}`, 'PATCH', updateBody, updateKey);
  check(update.response.status === 200 && update.data?.item?.version === 2 && update.data?.item?.title === updatedMetadata.title, 'manager metadata edit advances compare-and-set version');
  const updateReplay = await jsonRequest(managerToken, `/patients/${patientId}/documents/library/${uploadId}`, 'PATCH', updateBody, updateKey);
  check(updateReplay.response.status === 200 && updateReplay.data?.replayed === true && updateReplay.data?.item?.version === 2, 'same metadata command replays its saved receipt');
  const stale = await jsonRequest(managerToken, `/patients/${patientId}/documents/library/${uploadId}`, 'PATCH', { expected_version: 1, metadata: { ...updatedMetadata, notes: 'stale update' } }, randomUUID());
  check(stale.response.status === 409, 'stale metadata compare-and-set is rejected');

  const contentPath = `/patients/${patientId}/documents/${uploadId}/content`;
  const content = await fetch(`${api}${contentPath}`, { headers: headers(managerToken) });
  const downloaded = Buffer.from(await content.arrayBuffer());
  check(content.status === 200 && downloaded.equals(pdfBytes), 'authenticated preview/download returns exact uploaded bytes');

  const assistantList = await jsonRequest(assistantToken, `/patients/${patientId}/documents/library?section=clinical`);
  const assistantItem = assistantList.data?.items?.find(item => item.id === uploadId);
  check(assistantList.response.status === 200 && assistantItem?.can_edit === false, 'assistant can read but cannot edit the manager imported file');
  const assistantEdit = await jsonRequest(assistantToken, `/patients/${patientId}/documents/library/${uploadId}`, 'PATCH', { expected_version: 2, metadata: updatedMetadata }, randomUUID());
  check(assistantEdit.response.status === 403, 'assistant cannot modify a manager imported file');

  const foreignContent = await fetch(`${api}/patients/${otherPatientId}/documents/${uploadId}/content`, { headers: headers(managerToken) });
  check([403, 404].includes(foreignContent.status), 'same-clinic other-patient content request is denied', `HTTP ${foreignContent.status}`);
  const otherList = await jsonRequest(managerToken, `/patients/${otherPatientId}/documents/library?section=clinical`);
  check(otherList.response.status === 200 && !otherList.data?.items?.some(item => item.id === uploadId), 'other patient library does not include the imported file');

  const archive = await jsonRequest(managerToken, `/patients/${patientId}/documents/library/${uploadId}`, 'DELETE', { expected_version: 2 }, randomUUID());
  check(archive.response.status === 200 && archive.data?.deleted === true, 'manager soft archives with expected version');
  archived = archive.response.status === 200 && archive.data?.deleted === true;
  const archivedContent = await fetch(`${api}${contentPath}`, { headers: headers(managerToken) });
  check([403, 404].includes(archivedContent.status), 'archived content is denied through the old content route', `HTTP ${archivedContent.status}`);

  const persisted = await db.query(`select u.deleted_at is not null deleted,
      exists(select 1 from storage.objects o where o.bucket_id='patient-documents' and o.name=u.storage_path) object_retained,
      (select count(*)::int from private.audit_events a where a.aggregate_id=u.id and a.action in('patient_document.library_uploaded','patient_document.library_metadata_updated','patient_document.library_archived')) audit_count,
      (select count(*)::int from private.outbox_events e where e.aggregate_id=u.id and e.event_type in('PatientDocumentLibraryUploaded','PatientDocumentLibraryMetadataUpdated','PatientDocumentLibraryArchived')) outbox_count
    from private.patient_document_uploads u where u.id=$1 and u.clinic_id=$2 and u.patient_id=$3`, [uploadId, clinicId, patientId]);
  check(persisted.rowCount === 1 && persisted.rows[0]?.deleted === true && persisted.rows[0]?.object_retained === true, 'soft archive preserves the private Storage object and metadata row');
  check(persisted.rows[0]?.audit_count === 3 && persisted.rows[0]?.outbox_count === 3, 'upload, metadata edit, and archive each emitted audit and outbox events');

  const dentistList = await jsonRequest(dentistToken, `/patients/${patientId}/documents/library?section=clinical`);
  check(dentistList.response.status === 200, 'dentist authenticated read of the clinical library');
} catch (error) {
  lines.push(`ERROR ${error instanceof Error ? error.message.replace(/[\r\n]/gu, ' ') : 'local document library verification failed'}`);
  failures++;
} finally {
  if (uploadId && managerToken && !archived) {
    try {
      const cleanup = await jsonRequest(managerToken, `/patients/${patientId}/documents/library/${uploadId}`, 'DELETE', { expected_version: uploadVersion ?? 1 }, randomUUID());
      if (cleanup.response.status === 200) lines.push('PASS cleanup archived incomplete synthetic test upload');
      else lines.push('NOTE synthetic test upload may require local archive review');
    } catch { lines.push('NOTE synthetic test upload may require local archive review'); }
  }
  for (const token of sessions) {
    try { await fetch(`${authUrl}/logout?scope=local`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}` } }); } catch { /* local session cleanup only */ }
  }
  await db.end().catch(() => {});
  mkdirSync('.local/qa', { recursive: true });
  lines.push(failures ? `RESULT failed ${failures} checks` : 'RESULT all API/Auth/Storage checks passed');
  writeFileSync(logPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
}

if (failures) process.exitCode = 1;
