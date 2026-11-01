import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifyFinanceFlow } from '../apps/dental-api/scripts/verify-finance-flow.mjs';

process.loadEnvFile('apps/dental-api/.env.hosted.local');
const provider = 'https://giufpdppsunryyhfnzps.supabase.co';
assert.equal(process.env.SUPABASE_URL, provider);
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(adminKey && process.env.SUPABASE_ANON_KEY);
const setup = JSON.parse(readFileSync('.local/qa/hosted-finance-gate.json', 'utf8'));
assert.equal(setup.project, 'giufpdppsunryyhfnzps'); assert.match(setup.key, /^[a-f0-9]{64}$/u);
for (const name of ['clinicId', 'patientId', 'otherPatientId']) assert.match(setup[name], /^[a-f0-9-]{36}$/u);
const clinicName = `Cabinet Finance QA ${setup.clinicId.slice(0, 8)} (FICTIF)`;
Object.assign(process.env, { HOSTED_SUPABASE_PROJECT_REF: setup.project, HOSTED_FINANCE_GATE_KEY: setup.key,
  ENABLE_HOSTED_QUOTE_DRAFTS: 'true', ENABLE_HOSTED_INVOICES: 'true', ENABLE_HOSTED_PAYMENTS: 'true' });
const require = createRequire(import.meta.url); require('reflect-metadata');
const { createApplication } = require('../apps/dental-api/dist/bootstrap.js');
const fixture = { clinicId: setup.clinicId, userId: null, records: null, cleaned: false };
const save = () => writeFileSync(`.local/qa/hosted-finance-${setup.clinicId}.json`, JSON.stringify(fixture, null, 2));
const call = (url, options = {}) => fetch(url, { redirect: 'error', signal: globalThis.AbortSignal.timeout(20000), ...options });
const adminRequest = (path, options = {}) => call(provider + path, { ...options, headers: {
  apikey: adminKey, ...(!adminKey.startsWith('sb_') ? { Authorization: `Bearer ${adminKey}` } : {}),
  'Content-Type': 'application/json', ...options.headers,
} });
function ok(response, label) { if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`); return response; }
let app, token, origin;
const failures = [];
const request = (path, method = 'GET', body, key, overrides = {}) => call(`${origin}/api/v1${path}`, {
  method, headers: { Authorization: `Bearer ${overrides.token ?? token}`, 'X-Clinic-Id': overrides.clinicId ?? setup.clinicId,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
save();
try {
  const clinics = await ok(await adminRequest(`/rest/v1/clinics?id=eq.${setup.clinicId}&select=id,name`), 'Read fixture clinic').json();
  assert.equal(clinics.length, 1); assert.equal(clinics[0].name, clinicName);
  const email = `finance-verifier-${setup.clinicId}@example.test`, password = randomBytes(36).toString('base64url');
  const created = await ok(await adminRequest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { hosted_verification_fixture: true } }) }), 'Create synthetic manager').json();
  fixture.userId = created.id; save();
  ok(await adminRequest('/rest/v1/clinic_memberships', { method: 'POST', body: JSON.stringify({ clinic_id: setup.clinicId, user_id: created.id, role: 'manager', active: true }) }), 'Add fixture membership');
  const auth = await ok(await call(`${provider}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }), 'Synthetic login').json();
  token = auth.access_token;
  app = await createApplication(); await app.listen(0, '127.0.0.1'); origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  fixture.records = await verifyFinanceFlow({ request, ...setup, foreignClinicId: '10000000-0000-4000-8000-000000000001', report: message => console.log(`PASS ${message}`) }); save();
  ok(await adminRequest(`/rest/v1/clinic_memberships?user_id=eq.${fixture.userId}&clinic_id=eq.${setup.clinicId}`, { method: 'PATCH', body: JSON.stringify({ role: 'assistant' }) }), 'Change fixture role');
  assert.equal((await request(`/finance/patients/${setup.patientId}/payments`)).status, 403);
  assert.equal((await request('/finance/services')).status, 403);
  console.log('PASS role downgrade immediately denies finance reads');
} catch (error) { failures.push(error); } finally {
  const previousFailures = failures.length;
  if (token) try { ok(await call(`${provider}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }), 'Revoke test session'); } catch (error) { failures.push(error); }
  if (fixture.userId) {
    try { ok(await adminRequest(`/rest/v1/clinic_memberships?user_id=eq.${fixture.userId}&clinic_id=eq.${setup.clinicId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) }), 'Disable fixture membership'); } catch (error) { failures.push(error); }
    try { ok(await adminRequest(`/auth/v1/admin/users/${fixture.userId}`, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) }), 'Ban fixture account'); } catch (error) { failures.push(error); }
  }
  if (app) await app.close();
  fixture.cleaned = previousFailures === failures.length; save();
}
if (failures.length) throw new AggregateError(failures, 'Hosted finance verification or cleanup failed');
console.log('PASS hosted finance flow; synthetic ledger retained, verifier disabled. Coordinator must disable the fixture gates.');
