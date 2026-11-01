import { createHash, randomUUID } from 'node:crypto';

// Adapter-driven acceptance flow; the caller owns fixture provisioning, private
// credentials, gate restoration, session cleanup and retained audit fixtures.
export async function verifyDocumentLibraryFlow({ request, upload, download, patientId, foreignPatientId, rememberDocument, rememberUpload, report }) {
  const base = `/patients/${patientId}/documents/library`;
  const bytes = Buffer.alloc(6 * 1024 * 1024, 32);
  bytes.write('%PDF-1.7\n% Synthetic patient library acceptance\n');
  bytes.write('\n%%EOF', bytes.length - 6);
  const metadata = { category: 'administrative', type: 'identity', title: `FICTIF — hosted document verification ${randomUUID()}`, document_date: null, notes: 'Synthetic acceptance fixture only.', related_appointment_id: null };
  const key = randomUUID();
  function require(condition, label) {
    if (!condition) throw new Error(`Document workflow check failed: ${label}`);
    report(label);
  }
  async function body(response, label) {
    if (response.status !== 200) throw new Error(`Document workflow ${label} returned HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error(`Document workflow ${label} returned invalid JSON`); }
  }
  const options = await body(await request(`${base}/options`), 'options');
  require(options.patient_id === patientId && options.categories.some(category => category.id === 'administrative'), 'authorized filing options');
  const start = await body(await request(`${base}/uploads/start`, 'POST', {
    metadata, original_name: 'synthetic.pdf', content_type: 'application/pdf', size_bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }, key), 'start');
  require(typeof start.upload_url === 'string' && typeof start.ticket === 'string', 'upload capability returned');
  rememberUpload(start.upload_url);
  require((await upload(start.upload_url, bytes)).ok, 'direct 6 MiB upload');
  const receipt = await body(await request(`${base}/uploads/finish`, 'POST', { ticket: start.ticket }, key), 'finish');
  require(receipt.item?.patient_id === patientId && typeof receipt.item?.id === 'string', 'scoped persisted receipt');
  rememberDocument(receipt.item);
  const replay = await body(await request(`${base}/uploads/finish`, 'POST', { ticket: start.ticket }, key), 'retry');
  require(replay.replayed === true && replay.item.id === receipt.item.id, 'lost-response recovery returns original document');
  const listing = await body(await request(base), 'list');
  require(listing.items.some(item => item.id === receipt.item.id), 'uploaded document appears in library');
  const contentPath = `/patients/${patientId}/documents/${receipt.item.id}`;
  const link = await body(await request(`${contentPath}/content-link`), 'download link');
  const content = await download(link.url);
  require(content.ok && Buffer.from(await content.arrayBuffer()).equals(bytes), 'authorized download preserves exact bytes');
  const foreign = await request(`/patients/${foreignPatientId}/documents/${receipt.item.id}/content-link`);
  require([403, 404].includes(foreign.status), 'other patient cannot issue download capability');
  const archived = await body(await request(`${base}/${receipt.item.id}`, 'DELETE', { expected_version: receipt.item.version }, randomUUID()), 'archive');
  require(archived.deleted === true, 'document archived with audit history');
  const denied = await request(`${contentPath}/content-link`);
  require([403, 404].includes(denied.status), 'archived document cannot issue a capability');
  return receipt.item;
}
