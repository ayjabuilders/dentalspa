import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifyDocumentLibraryFlow } from '../apps/dental-api/scripts/verify-document-library-flow.mjs';

process.loadEnvFile('apps/dental-api/.env.local');
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(process.env.SUPABASE_URL)) throw new Error('Local-only verifier');
const provider = process.env.SUPABASE_URL;
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { createApplication } = require('../apps/dental-api/dist/bootstrap.js');
const { SupabasePrivateDocumentStorage } = require('../apps/dental-api/dist/documents/infrastructure/supabase-private-document-storage.js');
const account = JSON.parse(readFileSync('.local/owner-demo-access.json', 'utf8'));
const patientId = '20000000-0000-4000-8000-000000000001';
const clinicId = '10000000-0000-4000-8000-000000000001';
const staging = [];
let app, token, item, origin, archived = false;
const storage = new SupabasePrivateDocumentStorage();
function requireOk(response, message) { if (!response.ok) throw new Error(message); }
async function request(path, method = 'GET', body, key) {
  return fetch(`${origin}/api/v1${path}`, { method, redirect: 'error', signal: globalThis.AbortSignal.timeout(15000), headers: {
    Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function privateUrl(value) {
  const url = new URL(value);
  if (url.origin !== provider || url.username || url.password || url.hash || !url.pathname.startsWith('/storage/v1/object/')) throw new Error('Unexpected Storage destination');
  return url;
}
try {
  const auth = await fetch(`${provider}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
  if (!auth.ok) throw new Error(`Synthetic login failed (${auth.status})`);
  token = (await auth.json()).access_token;
  app = await createApplication(); await app.listen(0, '127.0.0.1');
  origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  await verifyDocumentLibraryFlow({ request, patientId, foreignPatientId: '20000000-0000-4000-8000-000000000002',
    upload: (url, bytes) => fetch(privateUrl(url), { method: 'PUT', redirect: 'error', headers: { 'Content-Type': 'application/pdf' }, body: bytes }),
    download: url => fetch(privateUrl(url), { redirect: 'error', cache: 'no-store' }),
    rememberUpload: value => { const path = privateUrl(value).pathname.replace('/storage/v1/object/upload/sign/patient-documents/', ''); if (!/^_staging\/\d{13}\/[0-9a-f-]{36}$/u.test(path)) throw new Error('Unexpected staging path'); staging.push(path); },
    rememberDocument: value => { item = value; }, report: label => console.log(`PASS ${label}`),
  });
  archived = true;
} finally {
  try {
    if (item && !archived) {
      const result = await request(`/patients/${patientId}/documents/library/${item.id}`, 'DELETE', { expected_version: item.version }, randomUUID());
      requireOk(result, 'Synthetic document archive requires review');
    }
    for (const path of staging) await storage.removeStaging([path]);
  } finally {
    try {
      if (token) {
        const result = await fetch(`${provider}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
        requireOk(result, 'Synthetic session cleanup failed');
      }
    } finally { if (app) await app.close(); }
  }
}
console.log('PASS HTTP workflow complete; synthetic document archived, staging removed, session revoked.');
