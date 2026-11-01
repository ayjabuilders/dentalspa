import { verifyAnonymousSurface } from './verify-hosted-public-checks.mjs';

const projectRef = 'giufpdppsunryyhfnzps';
const configuredUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const failures = [];
const timeoutMs = 12_000;

const missing = [
  ['SUPABASE_URL', configuredUrl],
  ['SUPABASE_ANON_KEY', anonKey],
].filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`Missing required local variables: ${missing.join(', ')}.`);
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

function headers(extra = {}) {
  return {
    apikey: anonKey,
    ...(!anonKey.startsWith('sb_') ? { Authorization: `Bearer ${anonKey}` } : {}),
    ...extra,
  };
}

async function request(path, options = {}) {
  return fetch(`${projectUrl.origin}${path}`, {
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(timeoutMs),
    ...options,
    headers: headers(options.headers),
  });
}

function record(label, passed, detail = '') {
  if (passed) {
    console.log(`PASS ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` (${detail})` : ''}`);
    failures.push(label);
  }
}

try {
  const checks = await verifyAnonymousSurface(request);
  for (const check of checks) record(check.label, check.passed, check.detail);
} catch (error) {
  console.error(error instanceof Error ? `Read-only preflight request failed: ${error.name}.` : 'Read-only preflight request failed.');
  failures.push('network request');
}

console.log('SKIP signed-in tenant isolation and object-level Storage denial; run hosted:verify after configuring the local server-only key.');
if (failures.length) {
  console.error(`Read-only hosted preflight failed: ${failures.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log('Read-only hosted Auth and anonymous API preflight passed.');
}
