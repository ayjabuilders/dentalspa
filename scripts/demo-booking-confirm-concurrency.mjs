// Real independent local PostgreSQL sessions; synthetic, fixture-scoped rows only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';

function validateDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Local Supabase status did not provide DB_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '54322' || url.pathname !== '/postgres' || url.username !== 'postgres' || url.search || url.hash) {
    throw new Error('Refusing a database endpoint outside the local Supabase stack.');
  }
  return url.toString();
}

function localDatabaseUrl() {
  if (process.platform === 'win32') {
    const dockerDirectory = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin');
    process.env.PATH = `${dockerDirectory};${process.env.PATH ?? ''}`;
  }
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, maxBuffer: 1024 * 1024 };
  try {
    const result = process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], options)
      : execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], options);
    return validateDatabaseUrl(JSON.parse(result).DB_URL);
  } catch {
    throw new Error('Local Supabase unavailable or not loopback-only.');
  }
}

function localGateKey() {
  const content = readFileSync(join(process.cwd(), 'apps', 'dental-api', '.env.local'), 'utf8');
  const key = content.match(/^DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY=(.*)$/m)?.[1]?.trim();
  if (!key || !/^[A-Za-z0-9_-]{40,}$/.test(key)) throw new Error('Run the local booking-confirmation setup before contention evidence.');
  return key;
}

async function query(client, sql, params = []) {
  try { return await client.query(sql, params); }
  catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'UNKNOWN';
    throw Object.assign(new Error(`Local database operation failed (${code}).`), { code });
  }
}

async function waitForBlock(f) {
  const deadline = performance.now() + 8000;
  while (performance.now() < deadline) {
    const result = await query(f.observer, 'select $2::integer=any(pg_blocking_pids($1)) blocked', [f.bPid, f.aPid]);
    if (result.rows[0].blocked) return;
    await delay(20);
  }
  throw new Error('Expected separate PostgreSQL confirmations to contend on the clinic scheduling lock.');
}

async function beginAsReception(f, client) {
  await query(client, 'begin');
  await query(client, 'set local role authenticated');
  await query(client, "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.method','POST',true)", [f.actor, JSON.stringify({ sub: f.actor, session_id: f.actor, role: 'authenticated' })]);
  assert.deepEqual((await query(client, 'select current_user role,auth.uid() subject')).rows[0], { role: 'authenticated', subject: f.actor });
}

async function fixture(url, work) {
  const f = { clinic: '10000000-0000-4000-8000-000000000001', actor: randomUUID(), requests: [randomUUID(), randomUUID()], keys: [randomUUID(), randomUUID()], clients: [], pending: [] };
  let failure;
  try {
    for (const name of ['observer', 'a', 'b']) {
      const client = new pg.Client({ connectionString: url, application_name: `demo-booking-confirm-${name}-${f.actor}`, connectionTimeoutMillis: 5000, statement_timeout: 15000, lock_timeout: 12000, idle_in_transaction_session_timeout: 20000 });
      client.on('error', () => { f.connectionFailed = true; });
      f.clients.push(client); f[name] = client;
      try { await client.connect(); } catch { throw new Error('Local PostgreSQL connection failed.'); }
      f[`${name}Pid`] = (await query(client, 'select pg_backend_pid() pid')).rows[0].pid;
    }
    assert.equal(new Set([f.observerPid, f.aPid, f.bPid]).size, 3, 'three distinct PostgreSQL sessions are required');
    const gate = await query(f.observer, 'select enabled from private.demo_booking_confirmation_settings where singleton');
    assert.equal(gate.rows[0]?.enabled, true, 'the explicit local demo setup must enable the DB gate');
    await query(f.observer, 'begin');
    await query(f.observer, 'insert into auth.users(id) values($1)', [f.actor]);
    await query(f.observer, "insert into auth.sessions(id,user_id,not_after) values($1,$1,now()+interval '1 hour')", [f.actor]);
    await query(f.observer, "insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)", [f.clinic, f.actor]);
    await query(f.observer, `insert into private.demo_booking_requests(id,request_key,scenario_id,requested_date,requested_time)
      values($1,$2,'salma',current_date + ((3-extract(isodow from current_date)::int+7)%7+1),time '09:30'),
            ($3,$4,'youssef',current_date + ((3-extract(isodow from current_date)::int+7)%7+1),time '09:30')`, [f.requests[0], randomUUID(), f.requests[1], randomUUID()]);
    await query(f.observer, 'commit');
    await work(f, localGateKey());
    assert.ok(!f.connectionFailed, 'all local PostgreSQL sessions remained healthy');
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    const clean = async action => { try { await action(); } catch { cleanupErrors.push(true); } };
    if (f.observer) for (const pid of [f.aPid, f.bPid].filter(Boolean)) await clean(() => query(f.observer, 'select pg_cancel_backend($1)', [pid]));
    await Promise.allSettled(f.pending);
    for (const client of [f.a, f.b].filter(Boolean)) await clean(() => query(client, 'rollback'));
    if (f.observer) await clean(async () => {
      await query(f.observer, 'begin');
      await query(f.observer, "set local session_replication_role='replica'");
      for (const table of ['outbox_attempts', 'outbox_deliveries', 'consumed_events']) {
        await query(f.observer, `delete from private.${table} where event_id in (select event_id from private.outbox_events where clinic_id=$1 and event_type='DemoAppointmentConfirmed' and correlation_id=any($2::uuid[]))`, [f.clinic, f.keys]);
      }
      await query(f.observer, "delete from private.audit_events where clinic_id=$1 and action='DemoAppointmentConfirmed' and correlation_id=any($2::uuid[])", [f.clinic, f.keys]);
      await query(f.observer, "delete from private.outbox_events where clinic_id=$1 and event_type='DemoAppointmentConfirmed' and correlation_id=any($2::uuid[])", [f.clinic, f.keys]);
      for (const table of ['demo_booking_confirmation_idempotency', 'demo_confirmed_appointments']) {
        await query(f.observer, `delete from private.${table} where clinic_id=$1 and booking_request_id=any($2::uuid[])`, [f.clinic, f.requests]);
      }
      await query(f.observer, 'delete from private.demo_booking_requests where clinic_id=$1 and id=any($2::uuid[])', [f.clinic, f.requests]);
      await query(f.observer, 'delete from public.clinic_memberships where clinic_id=$1 and user_id=$2', [f.clinic, f.actor]);
      await query(f.observer, 'delete from auth.sessions where user_id=$1', [f.actor]);
      await query(f.observer, 'delete from auth.users where id=$1', [f.actor]);
      await query(f.observer, 'commit');
    });
    for (const client of f.clients) await clean(() => client.end());
    if (cleanupErrors.length) failure = new Error(`Local synthetic fixture cleanup failed (${cleanupErrors.length} operations).`);
  }
  if (failure) throw failure;
}

function launch(f, operation) {
  const pending = operation().then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code ?? 'UNKNOWN' }));
  f.pending.push(pending);
  return pending;
}

async function confirm(f, client, requestId, key, gateKey) {
  return (await query(client, `select public.confirm_demo_booking_request($1,$2,$3,$4,$5,$6) result`, [
    f.clinic, requestId, '73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000003', key, gateKey,
  ])).rows[0].result;
}

test('demo confirmation concurrency uses only the loopback Supabase endpoint', () => {
  const local = 'postgresql://postgres:synthetic-password@127.0.0.1:54322/postgres';
  assert.equal(validateDatabaseUrl(local), local);
  for (const value of [undefined, 'invalid', local.replace('127.0.0.1','db.example.org'), local.replace('54322','5432'), `${local}?sslmode=require`, local.replace('/postgres','/other')]) {
    assert.throws(() => validateDatabaseUrl(value), error => !error.message.includes('synthetic-password') && !error.message.includes('db.example.org'));
  }
});

test('independent local PostgreSQL sessions confirm at most one request for one sample slot', { timeout: 90000 }, async () => {
  const url = localDatabaseUrl();
  await fixture(url, async (f, gateKey) => {
    await beginAsReception(f, f.a);
    await beginAsReception(f, f.b);
    const firstPromise = confirm(f, f.a, f.requests[0], f.keys[0], gateKey);
    const first = await firstPromise;
    assert.equal(first.status, 'confirmed');
    const second = launch(f, () => confirm(f, f.b, f.requests[1], f.keys[1], gateKey));
    await waitForBlock(f);
    await query(f.a, 'commit');
    assert.deepEqual(await second, { ok: false, code: 'SH409' });
    await query(f.b, 'rollback');
    const counts = await query(f.observer, `select
      (select count(*)::int from private.demo_confirmed_appointments where clinic_id=$1 and booking_request_id=any($2::uuid[])) appointments,
      (select count(*)::int from private.demo_booking_confirmation_idempotency where clinic_id=$1 and booking_request_id=any($2::uuid[])) receipts,
      (select count(*)::int from private.audit_events where clinic_id=$1 and action='DemoAppointmentConfirmed' and aggregate_id=$3) audit,
      (select count(*)::int from private.outbox_events where clinic_id=$1 and event_type='DemoAppointmentConfirmed' and aggregate_id=$3) outbox`, [f.clinic, f.requests, first.appointment_id]);
    assert.deepEqual(counts.rows[0], { appointments: 1, receipts: 1, audit: 1, outbox: 1 });
  });
});
