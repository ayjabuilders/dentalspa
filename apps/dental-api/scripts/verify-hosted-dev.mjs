import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { URLSearchParams } from 'node:url';
import { verifyHostedPrerequisites as assertHostedPrerequisites } from './verify-hosted-prerequisites.mjs';
import { verifyRevokedAccess } from './verify-revoked-access.mjs';

const projectRef = 'giufpdppsunryyhfnzps';
const clinicA = '10000000-0000-4000-8000-000000000001';
const clinicB = '10000000-0000-4000-8000-000000000002';
const configuredUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const missingVariables = [
  ['SUPABASE_URL', configuredUrl],
  ['SUPABASE_ANON_KEY', anonKey],
  ['SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY', adminKey],
].filter(([, value]) => !value).map(([name]) => name);
if (missingVariables.length) {
  console.error(`Missing required local variables: ${missingVariables.join(', ')}.`);
  process.exit(2);
}

let projectUrl;
try {
  projectUrl = new URL(configuredUrl);
} catch {
  console.error('SUPABASE_URL must be a valid URL.');
  process.exit(2);
}
if (projectUrl.hostname !== `${projectRef}.supabase.co` || projectUrl.protocol !== 'https:' || projectUrl.pathname !== '/' || projectUrl.search || projectUrl.hash) {
  console.error(`Refusing to run: this verifier is restricted to Supabase project ${projectRef}.`);
  process.exit(2);
}
const baseUrl = projectUrl.origin;

let apiOrigin;
const fixtureTag = `codex-hosted-verify-${randomUUID()}`;
const storagePath = `${clinicA}/verification/${randomUUID()}.pdf`;
const storageApiPath = storagePath.split('/').map(encodeURIComponent).join('/');
const unexpectedUploadPath = `${clinicA}/verification/${randomUUID()}.pdf`;
const unexpectedUploadApiPath = unexpectedUploadPath.split('/').map(encodeURIComponent).join('/');
const fixtureUsers = [];
const fixturePatients = [];
const failures = [];
const requestTimeoutMs = 15_000;
let app;
let storageObjectCreated = false;
let unexpectedUploadAttempted = false;
let downloadCapability;
let downloadCapabilityDeadline;

function apiKeyHeaders(key, extra = {}) {
  return {
    apikey: key,
    ...(!key.startsWith('sb_') ? { Authorization: `Bearer ${key}` } : {}),
    ...extra,
  };
}

function userHeaders(key, token, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${token}`, ...extra };
}

async function call(url, options = {}) {
  return fetch(url, { redirect: 'error', signal: globalThis.AbortSignal.timeout(requestTimeoutMs), ...options });
}

async function check(label, response, expected) {
  const success = typeof expected === 'number'
    ? response.status === expected
    : expected(response);
  if (success) {
    console.log(`PASS ${label} (${response.status})`);
  } else {
    console.error(`FAIL ${label} (received ${response.status})`);
    failures.push(label);
  }
  return success;
}

function isClientDenied(response) {
  return response.status >= 400 && response.status < 500 && response.status !== 429;
}

async function adminRequest(path, options = {}) {
  return call(`${baseUrl}${path}`, {
    ...options,
    headers: apiKeyHeaders(adminKey, {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    }),
  });
}

async function createUser(displayName, clinicId, patientName) {
  const email = `${fixtureTag}-${fixtureUsers.length + 1}@example.test`;
  const password = randomBytes(36).toString('base64url');
  const create = await adminRequest('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { hosted_verification_fixture: true },
      user_metadata: { display_name: displayName },
    }),
  });
  if (!create.ok) throw new Error(`Synthetic Auth user creation failed (HTTP ${create.status}).`);
  const user = await create.json();
  fixtureUsers.push(user.id);

  const membership = await adminRequest('/rest/v1/clinic_memberships', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ clinic_id: clinicId, user_id: user.id, role: 'reception', active: true }),
  });
  if (!membership.ok) throw new Error(`Synthetic clinic membership creation failed (HTTP ${membership.status}).`);

  const patientId = randomUUID();
  const patient = await adminRequest('/rest/v1/patients', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: patientId,
      clinic_id: clinicId,
      reference: `${fixtureTag}-${fixtureUsers.length}`,
      display_name: patientName,
    }),
  });
  if (!patient.ok) throw new Error(`Synthetic patient creation failed (HTTP ${patient.status}).`);
  fixturePatients.push({ clinicId, patientId });

  const signIn = await call(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: apiKeyHeaders(anonKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  });
  if (!signIn.ok) throw new Error(`Synthetic Auth sign-in failed (HTTP ${signIn.status}).`);
  const session = await signIn.json();
  return { id: user.id, token: session.access_token, refreshToken: session.refresh_token, clinicId, patientId };
}

async function verifyHostedPrerequisites() {
  await assertHostedPrerequisites({ adminRequest, clinicA, clinicB });
  console.log('PASS both synthetic clinic fixtures exist');
  console.log('PASS patient-documents bucket is private');
}

async function requestApi(path, user, clinicId) {
  return call(`${apiOrigin}/api/v1${path}`, {
    headers: {
      ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
      'X-Clinic-Id': clinicId,
    },
  });
}

async function cleanup() {
  const cleanupFailures = [];
  async function remove(label, operation) {
    try {
      const result = await operation();
      if (!result.ok) cleanupFailures.push(`${label} (HTTP ${result.status})`);
    } catch {
      cleanupFailures.push(label);
    }
  }

  for (const path of [storageObjectCreated ? storagePath : null, unexpectedUploadAttempted ? unexpectedUploadPath : null]) {
    if (!path) continue;
    await remove(`storage object ${path}`, () => adminRequest('/storage/v1/object/patient-documents', {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: [path] }),
    }));
  }
  for (const patient of fixturePatients) {
    const query = new URLSearchParams({ clinic_id: `eq.${patient.clinicId}`, id: `eq.${patient.patientId}` });
    await remove(`synthetic patient ${patient.patientId}`, () => adminRequest(`/rest/v1/patients?${query}`, { method: 'DELETE' }));
  }
  for (const userId of [...fixtureUsers].reverse()) {
    await remove(`synthetic auth user ${userId}`, () => adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }));
  }
  if (cleanupFailures.length) {
    console.error(`CLEANUP INCOMPLETE (${cleanupFailures.length} deletion(s)). Failures: ${cleanupFailures.join('; ')}. Synthetic fixture user IDs: ${fixtureUsers.join(', ') || 'none'}; storage paths: ${[storageObjectCreated ? storagePath : null, unexpectedUploadAttempted ? unexpectedUploadPath : null].filter(Boolean).join(', ') || 'none'}.`);
    failures.push('fixture cleanup');
  } else {
    console.log('PASS temporary fixture cleanup');
  }
}

try {
  await verifyHostedPrerequisites();
  const { createApplication } = await import('../dist/bootstrap.js');
  app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') throw new Error('Could not resolve the local API listener address.');
  apiOrigin = `http://127.0.0.1:${address.port}`;

  const unauthenticated = await requestApi('/me/workspace', undefined, clinicA);
  await check('workspace rejects missing bearer token', unauthenticated, 401);

  const userA = await createUser('Salma Alaoui (FICTIF)', clinicA, 'Yasmine Benjelloun (FICTIF)');
  const userB = await createUser('Youssef Mansouri (FICTIF)', clinicB, 'Adam Berrada (FICTIF)');

  const ownWorkspace = await requestApi('/me/workspace', userA, clinicA);
  const ownWorkspaceOk = await check('user A resolves only clinic A workspace', ownWorkspace, 200);
  if (ownWorkspaceOk) {
    const body = await ownWorkspace.json();
    if (body.user_id !== userA.id || body.clinic_id !== clinicA || !body.roles?.includes('reception')) {
      failures.push('user A workspace scope');
      console.error('FAIL user A workspace returned an unexpected scope.');
    }
  }

  const ownWorkspaceB = await requestApi('/me/workspace', userB, clinicB);
  const ownWorkspaceBOk = await check('user B resolves only clinic B workspace', ownWorkspaceB, 200);
  if (ownWorkspaceBOk) {
    const body = await ownWorkspaceB.json();
    if (body.user_id !== userB.id || body.clinic_id !== clinicB || !body.roles?.includes('reception')) {
      failures.push('user B workspace scope');
      console.error('FAIL user B workspace returned an unexpected scope.');
    }
  }

  await check('user A cannot select clinic B', await requestApi('/me/workspace', userA, clinicB), 403);
  await check('user B cannot select clinic A', await requestApi('/me/workspace', userB, clinicA), 403);
  await check('user A reads own-clinic patient', await requestApi(`/patients/${userA.patientId}`, userA, clinicA), 200);
  await check('user A cannot read clinic B patient ID', await requestApi(`/patients/${userB.patientId}`, userA, clinicA), 404);
  await check('user B reads own-clinic patient', await requestApi(`/patients/${userB.patientId}`, userB, clinicB), 200);
  await check('user B cannot read clinic A patient ID', await requestApi(`/patients/${userA.patientId}`, userB, clinicB), 404);

  storageObjectCreated = true;
  const fixtureBytes = Buffer.alloc(6 * 1024 * 1024, 32);
  fixtureBytes.write('%PDF-1.4\n% synthetic hosted verification fixture\n');
  fixtureBytes.write('\n%%EOF\n', fixtureBytes.length - 7);
  const objectCreate = await adminRequest(`/storage/v1/object/patient-documents/${storageApiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
    body: fixtureBytes,
  });
  if (!objectCreate.ok) throw new Error(`Synthetic Storage fixture creation failed (HTTP ${objectCreate.status}).`);
  const signed = await adminRequest(`/storage/v1/object/sign/patient-documents/${storageApiPath}`, {
    method: 'POST', body: JSON.stringify({ expiresIn: 30 }),
  });
  if (!signed.ok) throw new Error(`Server-authorized download signing failed (HTTP ${signed.status}).`);
  const signingResult = await signed.json();
  if (typeof signingResult.signedURL !== 'string') throw new Error('Download signing response is invalid.');
  // The Storage REST endpoint returns a path relative to /storage/v1,
  // whereas supabase-js wraps this as an absolute signedUrl.
  const capability = new URL(`${baseUrl}/storage/v1${signingResult.signedURL}`);
  if (capability.origin !== baseUrl || capability.username || capability.password || capability.hash
      || capability.pathname !== `/storage/v1/object/sign/patient-documents/${storageApiPath}`) {
    throw new Error('Download signing returned an unexpected destination.');
  }
  downloadCapability = capability.toString();
  downloadCapabilityDeadline = Date.now() + 32_000;
  const authorizedDownload = await call(downloadCapability, { cache: 'no-store' });
  const exactBytes = authorizedDownload.ok && Buffer.from(await authorizedDownload.arrayBuffer()).equals(fixtureBytes);
  await check('server-issued private capability downloads exact 6 MiB fixture', authorizedDownload, () => exactBytes);
  const apiKeyHeader = apiKeyHeaders(anonKey);
  await check('anonymous client cannot download private object', await call(`${baseUrl}/storage/v1/object/patient-documents/${storageApiPath}`, { headers: apiKeyHeader }), isClientDenied);
  await check('authenticated clinic A cannot download object', await call(`${baseUrl}/storage/v1/object/patient-documents/${storageApiPath}`, { headers: userHeaders(anonKey, userA.token) }), isClientDenied);
  await check('authenticated clinic B cannot download object', await call(`${baseUrl}/storage/v1/object/patient-documents/${storageApiPath}`, { headers: userHeaders(anonKey, userB.token) }), isClientDenied);
  await check('authenticated user cannot create signed URL', await call(`${baseUrl}/storage/v1/object/sign/patient-documents/${storageApiPath}`, {
    method: 'POST',
    headers: userHeaders(anonKey, userA.token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: 60 }),
  }), isClientDenied);
  unexpectedUploadAttempted = true;
  const uploadAttempt = await call(`${baseUrl}/storage/v1/object/patient-documents/${unexpectedUploadApiPath}`, {
    method: 'POST',
    headers: userHeaders(anonKey, userA.token, { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }),
    body: '%PDF-1.4\n% synthetic upload denial check\n%%EOF\n',
  });
  if (!isClientDenied(uploadAttempt)) {
    console.error('FAIL authenticated user cannot upload private object (request unexpectedly succeeded).');
    failures.push('authenticated user cannot upload private object');
  } else {
    console.log(`PASS authenticated user cannot upload private object (${uploadAttempt.status})`);
  }

  const signOut = await call(`${baseUrl}/auth/v1/logout?scope=global`, {
    method: 'POST',
    headers: userHeaders(anonKey, userA.token),
  });
  await check('global sign-out succeeds for synthetic user A', signOut, response => response.ok);

  const refresh = await call(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: apiKeyHeaders(anonKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ refresh_token: userA.refreshToken }),
  });
  await check('revoked refresh token cannot mint another access token', refresh, isClientDenied);
  const revokedChecks = await verifyRevokedAccess({
    patientId: userA.patientId,
    clinicId: clinicA,
    requestApi: path => requestApi(path, userA, clinicA),
    requestData: (path, body) => call(`${baseUrl}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: userHeaders(anonKey, userA.token, { 'Content-Type': 'application/json' }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  for (const result of revokedChecks) {
    if (result.passed) console.log(`PASS ${result.label}`);
    else {
      failures.push(result.label);
      console.error(`FAIL ${result.label} (HTTP ${result.status ?? 'unavailable'}).`);
    }
  }
  await check('sign-out of user A preserves user B access', await requestApi('/me/workspace', userB, clinicB), 200);
  await delay(Math.max(0, downloadCapabilityDeadline - Date.now()));
  const expiredDownload = await call(downloadCapability, { cache: 'no-store' });
  await check('hosted private download capability expires after 30 seconds', expiredDownload,
    response => [400, 401, 403].includes(response.status));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Hosted verification failed.');
  failures.push('verification execution');
} finally {
  try {
    await cleanup();
  } catch {
    console.error(`CLEANUP INCOMPLETE. Synthetic fixture user IDs: ${fixtureUsers.join(', ') || 'none'}; storage paths: ${[storageObjectCreated ? storagePath : null, unexpectedUploadAttempted ? unexpectedUploadPath : null].filter(Boolean).join(', ') || 'none'}.`);
    failures.push('fixture cleanup');
  }
  if (app) {
    try {
      await app.close();
    } catch {
      console.error('Local API shutdown failed.');
      failures.push('local API shutdown');
    }
  }
}

if (failures.length) {
  console.error(`Hosted verification failed: ${failures.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log('Hosted identity, tenant isolation, revocation, and private Storage checks passed.');
}
