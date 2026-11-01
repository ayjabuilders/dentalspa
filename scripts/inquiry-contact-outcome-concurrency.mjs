// Real PostgreSQL evidence for synthetic local fixtures only. Never accepts an env DB URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';

function validateDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Local Supabase status did not provide DB_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '54322' || url.pathname !== '/postgres' || url.username !== 'postgres' || url.search || url.hash) {
    throw new Error('Refusing connection outside the repository local PostgreSQL endpoint.');
  }
  return url.toString();
}

function localDatabaseUrl() {
  let status;
  try {
    const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, maxBuffer: 1024 * 1024 };
    const output = process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], options)
      : execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], options);
    status = JSON.parse(output); // Never print local status: it contains credentials.
  } catch {
    throw new Error('Local Supabase unavailable; start the repository local stack before contention evidence.');
  }
  return validateDatabaseUrl(status?.DB_URL);
}

async function query(client, sql, params = []) {
  try { return await client.query(sql, params); }
  catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'UNKNOWN';
    throw Object.assign(new Error(`Database operation failed (${code})`), { code });
  }
}

async function waitForBlock(f) {
  const deadline = performance.now() + 8000;
  while (performance.now() < deadline) {
    const result = await query(f.observer, 'select $2::integer=any(pg_blocking_pids($1)) blocked', [f.bPid, f.aPid]);
    if (result.rows[0].blocked) return;
    await delay(20);
  }
  throw new Error('Expected independent-session inquiry row-lock contention was not observed.');
}

async function fixture(url, work) {
  const f = { clinic: randomUUID(), owner: randomUUID(), manager: randomUUID(), inquiry: randomUUID(), clients: [], pending: [] };
  let failure;
  try {
    for (const name of ['observer', 'a', 'b']) {
      const client = new pg.Client({
        connectionString: url,
        application_name: `contact-outcome-evidence-${name}-${f.clinic}`,
        connectionTimeoutMillis: 5000,
        statement_timeout: 15000,
        lock_timeout: 12000,
        idle_in_transaction_session_timeout: 20000,
      });
      client.on('error', () => { f.connectionFailed = true; });
      f.clients.push(client);
      f[name] = client;
      try { await client.connect(); } catch { throw new Error('Local PostgreSQL connection failed.'); }
      f[`${name}Pid`] = (await query(client, 'select pg_backend_pid() pid')).rows[0].pid;
    }
    assert.equal(new Set([f.observerPid, f.aPid, f.bPid]).size, 3, 'three independent PostgreSQL sessions are required');
    const settings = await query(f.observer, 'select enabled from private.inquiry_contact_outcome_settings where singleton');
    assert.equal(settings.rowCount, 1);
    assert.equal(settings.rows[0].enabled, false, 'refuse to run if the DB feature gate is already enabled');

    await query(f.observer, 'begin');
    await query(f.observer, 'insert into public.clinics(id,name) values($1,$2)', [f.clinic, 'Synthetic contact outcome contention']);
    await query(f.observer, 'insert into auth.users(id) values($1),($2)', [f.owner, f.manager]);
    await query(f.observer, "insert into auth.sessions(id,user_id,not_after) values($1,$1,now()+interval '1 hour'),($2,$2,now()+interval '1 hour')", [f.owner, f.manager]);
    await query(f.observer, "insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true),($1,$3,'manager',true)", [f.clinic, f.owner, f.manager]);
    await query(f.observer, "insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source) values($1,$2,$3,'Synthetic contention subject','phone')", [f.inquiry, f.clinic, f.owner]);
    await query(f.observer, 'update private.inquiry_contact_outcome_settings set enabled=true where singleton');
    await query(f.observer, 'commit');

    await work(f);
    assert.ok(!f.connectionFailed, 'all local database sessions remained healthy');
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    const clean = async action => { try { await action(); } catch { cleanupErrors.push(true); } };
    if (f.observer) {
      for (const pid of [f.aPid, f.bPid].filter(Boolean)) await clean(() => query(f.observer, 'select pg_cancel_backend($1)', [pid]));
    }
    await Promise.allSettled(f.pending);
    for (const client of [f.a, f.b].filter(Boolean)) await clean(() => query(client, 'rollback'));
    if (f.observer) await clean(async () => {
      await query(f.observer, 'begin');
      await query(f.observer, "set local session_replication_role='replica'");
      await query(f.observer, 'delete from private.outbox_attempts where event_id in(select event_id from private.outbox_events where clinic_id=$1)', [f.clinic]);
      await query(f.observer, 'delete from private.outbox_deliveries where event_id in(select event_id from private.outbox_events where clinic_id=$1)', [f.clinic]);
      await query(f.observer, 'delete from private.consumed_events where event_id in(select event_id from private.outbox_events where clinic_id=$1)', [f.clinic]);
      for (const table of ['inquiry_contact_outcome_idempotency', 'inquiry_contact_outcomes', 'audit_events', 'outbox_events']) {
        await query(f.observer, `delete from private.${table} where clinic_id=$1`, [f.clinic]);
      }
      await query(f.observer, 'delete from public.inquiries where clinic_id=$1', [f.clinic]);
      await query(f.observer, 'delete from public.clinic_memberships where clinic_id=$1', [f.clinic]);
      await query(f.observer, 'delete from public.clinics where id=$1', [f.clinic]);
      await query(f.observer, 'delete from auth.sessions where user_id in($1,$2)', [f.owner, f.manager]);
      await query(f.observer, 'delete from auth.users where id in($1,$2)', [f.owner, f.manager]);
      await query(f.observer, 'update private.inquiry_contact_outcome_settings set enabled=false where singleton');
      await query(f.observer, 'commit');
    });
    for (const client of f.clients) await clean(() => client.end());
    if (cleanupErrors.length) failure = new Error(`Synthetic fixture cleanup failed (${cleanupErrors.length} operations); inspect and restore the local stack before continuing.`);
  }
  if (failure) throw failure;
}

async function begin(f, client) {
  await query(client, 'begin');
  await query(client, 'set local role authenticated');
  await query(client, "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.method','POST',true)", [f.owner, JSON.stringify({ sub: f.owner, session_id: f.owner, role: 'authenticated' })]);
  assert.deepEqual((await query(client, 'select current_user role,auth.uid() subject')).rows[0], { role: 'authenticated', subject: f.owner });
}

async function record(f, client, key, outcome = 'reached') {
  const payload = JSON.stringify({ outcome });
  const correlationId = randomUUID();
  return (await query(client, 'select public.record_inquiry_contact_outcome($1,$2,$3,$4::jsonb,$5) result', [f.clinic, f.inquiry, key, payload, correlationId])).rows[0].result;
}

function launch(f, operation) {
  const pending = operation().then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code ?? 'UNKNOWN' }));
  f.pending.push(pending);
  return pending;
}

async function assertEffects(f, count) {
  for (const [table, sql] of [
    ['outcomes', 'select count(*)::int n from private.inquiry_contact_outcomes where clinic_id=$1 and inquiry_id=$2'],
    ['idempotency', 'select count(*)::int n from private.inquiry_contact_outcome_idempotency where clinic_id=$1 and inquiry_id=$2'],
    ['audit', "select count(*)::int n from private.audit_events where clinic_id=$1 and aggregate_id=$2 and action='InquiryContactOutcomeRecorded'"],
    ['outbox', "select count(*)::int n from private.outbox_events where clinic_id=$1 and aggregate_id=$2 and event_type='InquiryContactOutcomeRecorded'"],
  ]) {
    const actual = (await query(f.observer, sql, [f.clinic, f.inquiry])).rows[0].n;
    assert.equal(actual, count, `${table} effect count`);
  }
  const rows = (await query(f.observer, 'select outcome,actor_user_id from private.inquiry_contact_outcomes where clinic_id=$1 and inquiry_id=$2 order by recorded_at,id', [f.clinic, f.inquiry])).rows;
  assert.deepEqual(rows, Array.from({ length: count }, () => ({ outcome: 'reached', actor_user_id: f.owner })));
}

test('local-only contact outcome DB endpoint guard', () => {
  const local = 'postgresql://postgres:synthetic-password@127.0.0.1:54322/postgres';
  assert.equal(validateDatabaseUrl(local), local);
  for (const value of [undefined, 'invalid', local.replace('127.0.0.1', 'db.example.org'), local.replace('54322', '5432'), local.replace('/postgres', '/other'), `${local}?sslmode=require`, `${local}#fragment`, local.replace('postgres:synthetic', 'other:synthetic')]) {
    assert.throws(() => validateDatabaseUrl(value), error => !error.message.includes('synthetic-password') && !error.message.includes('db.example.org'));
  }
});

test('local PostgreSQL factual contact outcome concurrency', { timeout: 90000 }, async t => {
  const url = localDatabaseUrl();
  await t.test('same-key concurrent retry blocks and commits one immutable event bundle', () => fixture(url, async f => {
    await begin(f, f.a);
    await begin(f, f.b);
    const key = randomUUID();
    const first = await record(f, f.a, key);
    assert.equal(first.replayed, false);
    const second = launch(f, () => record(f, f.b, key));
    await waitForBlock(f);
    await query(f.a, 'commit');
    assert.deepEqual(await second, { ok: true, value: { ...first, replayed: true } });
    await query(f.b, 'commit');
    await assertEffects(f, 1);
  }));

  await t.test('different keys append repeated factual labels as separate events', () => fixture(url, async f => {
    await begin(f, f.a);
    await begin(f, f.b);
    const first = await record(f, f.a, randomUUID());
    assert.equal(first.replayed, false);
    const secondPromise = launch(f, () => record(f, f.b, randomUUID()));
    await waitForBlock(f);
    await query(f.a, 'commit');
    const second = await secondPromise;
    assert.equal(second.ok, true);
    assert.equal(second.value.replayed, false);
    await query(f.b, 'commit');
    await assertEffects(f, 2);
  }));

  await t.test('owner reassignment committed while a request waits is enforced before writing', () => fixture(url, async f => {
    await query(f.a, 'begin');
    await begin(f, f.b);
    await query(f.a, 'update public.inquiries set owner_user_id=$1 where clinic_id=$2 and id=$3', [f.manager, f.clinic, f.inquiry]);
    const waiting = launch(f, () => record(f, f.b, randomUUID()));
    await waitForBlock(f);
    await query(f.a, 'commit');
    assert.deepEqual(await waiting, { ok: false, code: '42501' });
    await query(f.b, 'rollback');
    await assertEffects(f, 0);
  }));
});
