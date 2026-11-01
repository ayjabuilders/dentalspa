import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifyHostedPrerequisites } from '../apps/dental-api/scripts/verify-hosted-prerequisites.mjs';

process.loadEnvFile('apps/dental-api/.env.hosted.local');
const provider = 'https://giufpdppsunryyhfnzps.supabase.co';
assert.equal(process.env.SUPABASE_URL, provider, 'Approved Dev project only');
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(adminKey && process.env.SUPABASE_ANON_KEY, 'Hosted credentials required');
const gate = JSON.parse(readFileSync('.local/qa/hosted-team-gate.json', 'utf8'));
assert.equal(gate.project, 'giufpdppsunryyhfnzps');
assert.match(gate.key, /^[a-f0-9]{64}$/u);
process.env.HOSTED_SUPABASE_PROJECT_REF = gate.project;
process.env.ENABLE_HOSTED_TEAM_ACCESS = 'true';
process.env.HOSTED_TEAM_ACCESS_GATE_KEY = gate.key;
const require = createRequire(import.meta.url);
require('reflect-metadata');
// Diagnostics contain only the operation name/status, never headers or payloads.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const trace = url.origin === provider && url.pathname === '/rest/v1/rpc/update_team_access_member';
  const started = Date.now();
  if (trace) console.log('TRACE team update RPC started');
  try {
    const response = await originalFetch(input, init);
    if (trace) console.log(`TRACE team update RPC status=${response.status} elapsed_ms=${Date.now() - started}`);
    return response;
  } catch (error) { if (trace) console.log(`TRACE team update RPC transport failure elapsed_ms=${Date.now() - started}`); throw error; }
};
const { createApplication } = require('../apps/dental-api/dist/bootstrap.js');
const clinicId = '10000000-0000-4000-8000-000000000001';
const clinicB = '10000000-0000-4000-8000-000000000002';
const fixture = { runId: randomUUID(), managerId: null, memberId: null, cleaned: false };
const journal = `.local/qa/hosted-team-${fixture.runId}.json`;
const save = () => writeFileSync(journal, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const sessions = [];
let app, origin;
const failures = [];
const call = (url, options = {}) => fetch(url, { redirect: 'error', signal: globalThis.AbortSignal.timeout(20000), ...options });
function ok(response, label) { if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`); return response; }
const adminRequest = (path, options = {}) => call(provider + path, { ...options, headers: {
  apikey: adminKey, ...(!adminKey.startsWith('sb_') ? { Authorization: `Bearer ${adminKey}` } : {}),
  'Content-Type': 'application/json', ...options.headers,
} });
async function login(email, password) {
  const response = ok(await call(`${provider}/auth/v1/token?grant_type=password`, { method: 'POST', headers: {
    apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ email, password }) }), 'Synthetic login');
  const token = (await response.json()).access_token; sessions.push(token); return token;
}
const request = (token, path, method = 'GET', body, key, clinic = clinicId) => call(`${origin}/api/v1${path}`, {
  method, headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinic,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const endpoint = '/team/access/members';
save();
try {
  await verifyHostedPrerequisites({ adminRequest, clinicA: clinicId, clinicB });
  const email = `team-verifier-${fixture.runId}@example.test`, password = randomBytes(36).toString('base64url');
  const created = ok(await adminRequest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({
    email, password, email_confirm: true, app_metadata: { hosted_verification_fixture: true },
  }) }), 'Create synthetic manager');
  fixture.managerId = (await created.json()).id; save();
  ok(await adminRequest('/rest/v1/clinic_memberships', { method: 'POST', body: JSON.stringify({ clinic_id: clinicId, user_id: fixture.managerId, role: 'manager', active: true }) }), 'Manager membership');
  const token = await login(email, password);
  app = await createApplication(); await app.listen(0, '127.0.0.1');
  origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const input = { display_name: 'Imane El Idrissi — équipe FICTIVE', email: `team-member-${fixture.runId}@example.test`, temporary_password: randomBytes(36).toString('base64url'), roles: ['assistant'] };
  const key = randomUUID();
  const receipt = await ok(await request(token, endpoint, 'POST', input, key), 'Create member').json();
  fixture.memberId = receipt.member.user_id; save();
  assert.deepEqual(receipt.member.roles, ['assistant']); assert.equal(receipt.member.active, true);
  const replay = await ok(await request(token, endpoint, 'POST', input, key), 'Replay create').json();
  assert.equal(replay.member.user_id, fixture.memberId); assert.equal(replay.replayed, true);
  console.log('PASS member creation and duplicate-safe replay');
  const memberToken = await login(input.email, input.temporary_password);
  assert.equal((await request(memberToken, endpoint)).status, 403);
  assert.equal((await request(token, endpoint, 'GET', undefined, undefined, clinicB)).status, 403);
  assert.equal((await request(token, `${endpoint}/${fixture.managerId}`, 'PATCH', { expected_version: 1, roles: ['assistant'], active: true }, randomUUID())).status, 403);
  console.log('PASS assistant, cross-clinic and self-access modification denied');
  const path = `${endpoint}/${fixture.memberId}`;
  const update = { expected_version: receipt.member.version, roles: ['reception'], active: true };
  const updateKey = randomUUID();
  const changed = await ok(await request(token, path, 'PATCH', update, updateKey), 'Update role').json();
  assert.deepEqual(changed.member.roles, ['reception']); assert.ok(changed.member.version > receipt.member.version);
  assert.equal((await ok(await request(token, path, 'PATCH', update, updateKey), 'Replay update').json()).replayed, true);
  assert.equal((await request(token, path, 'PATCH', update, randomUUID())).status, 409);
  console.log('PASS role update, replay and stale version conflict');
  const disabled = await ok(await request(token, path, 'PATCH', { expected_version: changed.member.version, roles: ['reception'], active: false }, randomUUID()), 'Disable member').json();
  assert.equal(disabled.member.active, false);
  assert.equal((await request(memberToken, '/team/roster')).status, 403);
  const list = await ok(await request(token, `${endpoint}?q=${encodeURIComponent(input.email)}`), 'Search member').json();
  assert.equal(list.items.length, 1); assert.equal(list.items[0].active, false);
  console.log('PASS deactivation denies existing session and persists in team search');
} catch (error) { failures.push(error); } finally {
  const previousFailures = failures.length;
  // Revoke sessions before banning; continue cleanup if one operation fails.
  for (const token of sessions) {
    try { ok(await call(`${provider}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }), 'Revoke test session'); }
    catch (error) { failures.push(error); }
  }
  for (const id of [fixture.memberId, fixture.managerId].filter(Boolean)) {
    try { ok(await adminRequest(`/rest/v1/clinic_memberships?user_id=eq.${id}&clinic_id=eq.${clinicId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) }), 'Disable test membership'); }
    catch (error) { failures.push(error); }
    try { ok(await adminRequest(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) }), 'Ban test login'); }
    catch (error) { failures.push(error); }
  }
  if (app) await app.close();
  globalThis.fetch = originalFetch;
  fixture.cleaned = failures.length === previousFailures; save();
}
if (failures.length) throw new AggregateError(failures, 'Hosted team verification or cleanup failed');
console.log('PASS hosted team HTTP workflow; audit-linked fixtures retained, memberships disabled and sessions revoked.');
console.log('Coordinator must restore the temporary team gate.');
