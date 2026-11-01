import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifyDocumentLibraryFlow } from '../apps/dental-api/scripts/verify-document-library-flow.mjs';
import { verifyHostedPrerequisites } from '../apps/dental-api/scripts/verify-hosted-prerequisites.mjs';

process.loadEnvFile('apps/dental-api/.env.hosted.local');
const provider = 'https://giufpdppsunryyhfnzps.supabase.co';
if (process.env.SUPABASE_URL !== provider) throw new Error('Approved Dev project only');
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!adminKey || !process.env.SUPABASE_ANON_KEY) throw new Error('Missing hosted credentials');
const gate = JSON.parse(readFileSync('.local/qa/hosted-documents-gate.json', 'utf8'));
if (gate.project !== 'giufpdppsunryyhfnzps' || !/^[a-f0-9]{64}$/u.test(gate.key)) throw new Error('Invalid isolated test gate');
process.env.HOSTED_SUPABASE_PROJECT_REF = gate.project;
process.env.ENABLE_HOSTED_PATIENT_DOCUMENTS = 'true';
process.env.HOSTED_PATIENT_DOCUMENTS_GATE_KEY = gate.key;
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { createApplication } = require('../apps/dental-api/dist/bootstrap.js');
const { SupabasePrivateDocumentStorage } = require('../apps/dental-api/dist/documents/infrastructure/supabase-private-document-storage.js');
const clinicId = '10000000-0000-4000-8000-000000000001';
const clinicB = '10000000-0000-4000-8000-000000000002';
const fixture = { runId: randomUUID(), clinicId, patientId: randomUUID(), foreignPatientId: randomUUID(), userId: null, documentId: null, archived: false, disabled: false };
const journal = `.local/qa/hosted-documents-${fixture.runId}.json`;
const save = () => writeFileSync(journal, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const staging = [];
let app, token, item, origin;
const storage = new SupabasePrivateDocumentStorage();
function requireOk(response, label) { if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`); }
const call = (url, options = {}) => fetch(url, { redirect: 'error', signal: globalThis.AbortSignal.timeout(20000), ...options });
async function adminRequest(path, options = {}) {
  return call(provider + path, { ...options, headers: { apikey: adminKey,
    ...(!adminKey.startsWith('sb_') ? { Authorization: `Bearer ${adminKey}` } : {}),
    'Content-Type': 'application/json', ...options.headers } });
}
async function request(path, method = 'GET', body, key) {
  return call(`${origin}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function privateUrl(value) {
  const url = new URL(value);
  if (url.origin !== provider || url.username || url.password || url.hash || !url.pathname.startsWith('/storage/v1/object/')) throw new Error('Unexpected Storage destination');
  return url;
}
save();
try {
  await verifyHostedPrerequisites({ adminRequest, clinicA: clinicId, clinicB });
  const email = `document-verifier-${fixture.runId}@example.test`, password = randomBytes(36).toString('base64url');
  const created = await adminRequest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { hosted_verification_fixture: true }, user_metadata: { display_name: 'Gestionnaire documents FICTIF' } }) });
  requireOk(created, 'Create synthetic verifier'); fixture.userId = (await created.json()).id; save();
  requireOk(await adminRequest('/rest/v1/clinic_memberships', { method: 'POST', body: JSON.stringify({ clinic_id: clinicId, user_id: fixture.userId, role: 'manager', active: true }) }), 'Synthetic membership');
  requireOk(await adminRequest('/rest/v1/patients', { method: 'POST', body: JSON.stringify([
    { id: fixture.patientId, clinic_id: clinicId, reference: `DOC-QA-${fixture.runId}`, display_name: 'Salma Alaoui — vérification FICTIVE' },
    { id: fixture.foreignPatientId, clinic_id: clinicB, reference: `DOC-QA-B-${fixture.runId}`, display_name: 'Youssef Benali — vérification FICTIVE' },
  ]) }), 'Synthetic patient fixtures');
  const auth = await call(`${provider}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  requireOk(auth, 'Synthetic login'); token = (await auth.json()).access_token;
  app = await createApplication(); await app.listen(0, '127.0.0.1'); origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  await verifyDocumentLibraryFlow({ request, patientId: fixture.patientId, foreignPatientId: fixture.foreignPatientId,
    upload: (url, bytes) => call(privateUrl(url), { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes }),
    download: url => call(privateUrl(url), { cache: 'no-store' }),
    rememberUpload: value => { const path = privateUrl(value).pathname.replace('/storage/v1/object/upload/sign/patient-documents/', ''); if (!/^_staging\/\d{13}\/[0-9a-f-]{36}$/u.test(path)) throw new Error('Unexpected staging path'); staging.push(path); },
    rememberDocument: value => { item = value; fixture.documentId = value.id; save(); }, report: label => console.log(`PASS ${label}`),
  });
  fixture.archived = true; save();
} finally {
  try {
    if (item && !fixture.archived) {
      const archived = await request(`/patients/${fixture.patientId}/documents/library/${item.id}`, 'DELETE', { expected_version: item.version }, randomUUID());
      requireOk(archived, 'Archive synthetic document'); fixture.archived = true; save();
    }
    for (const path of staging) await storage.removeStaging([path]);
  } finally {
    try {
      if (fixture.userId) {
        requireOk(await adminRequest(`/rest/v1/clinic_memberships?user_id=eq.${fixture.userId}&clinic_id=eq.${clinicId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) }), 'Disable synthetic membership');
        try {
          if (token) requireOk(await call(`${provider}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }), 'Revoke synthetic session');
        } finally {
          requireOk(await adminRequest(`/auth/v1/admin/users/${fixture.userId}`, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) }), 'Disable synthetic login');
        }
        fixture.disabled = true; save();
      }
    } finally { if (app) await app.close(); }
  }
}
console.log('PASS hosted library workflow; synthetic audit-linked records retained, document archived and account disabled.');
console.log('Coordinator must restore the temporary database gate.');
