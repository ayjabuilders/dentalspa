// Temporary local Auth/DB fixtures for the real browser→API→PostgreSQL demo test.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { join } from 'node:path';

function supabaseStatus() {
  if (process.platform === 'win32') {
    const dockerDirectory = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin');
    process.env.PATH = `${dockerDirectory};${process.env.PATH ?? ''}`;
  }
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, maxBuffer: 1024 * 1024 };
  try {
    const output = process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], options)
      : execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], options);
    return JSON.parse(output);
  } catch { throw new Error('Start the repository local Supabase stack first.'); }
}

function assertLocalUrl(value, port, pathname, user) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Supabase status returned an invalid local endpoint.'); }
  if (!['http:', 'postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== port || url.pathname !== pathname || (user && url.username !== user) || url.search || url.hash) {
    throw new Error('Refusing to use any non-local Supabase endpoint.');
  }
  return url;
}

async function adminRequest(base, serviceKey, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Local Auth fixture setup failed (${response.status}).`);
  return body;
}

async function main() {
  const status = supabaseStatus();
  const apiUrl = assertLocalUrl(status.API_URL, '54321', '/', null);
  const databaseUrl = assertLocalUrl(status.DB_URL, '54322', '/postgres', 'postgres');
  assert.equal(apiUrl.protocol, 'http:');
  assert.equal(typeof status.SERVICE_ROLE_KEY, 'string');
  const apiBase = 'http://127.0.0.1:4300';
  const apiStatus = await fetch(`${apiBase}/api/v1/booking-requests/demo-status`, { cache: 'no-store' });
  if (!apiStatus.ok || !(await apiStatus.json()).confirmation_enabled) throw new Error('Enable the local confirmation demo and restart Dental API before this test.');

  const fixtureId = randomUUID();
  const email = `booking-confirm-${fixtureId}@dentalspa.test`;
  const password = `Local!${randomBytes(27).toString('base64url')}9`;
  const requestIds = [randomUUID(), randomUUID()];
  const publicRequestKey = randomUUID();
  let authUserId;
  let client;
  let authCreated = false;
  let failure;
  try {
    const created = await adminRequest(apiUrl.origin, status.SERVICE_ROLE_KEY, '/auth/v1/admin/users', {
      method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: 'Synthetic Booking Reviewer' } }),
    });
    if (!created.id) throw new Error('Local Auth did not return the fixture user ID.');
    authCreated = true;
    authUserId = created.id;
    const connection = new pg.Client({ connectionString: databaseUrl.toString(), connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    client = connection;
    await client.connect();
    await client.query('begin');
    await client.query('insert into public.profiles(user_id,display_name) values($1,$2) on conflict(user_id) do update set display_name=excluded.display_name', [authUserId, 'Synthetic Booking Reviewer']);
    await client.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values('10000000-0000-4000-8000-000000000001',$1,'reception',true)", [authUserId]);
    const fixtures = await client.query(`insert into private.demo_booking_requests(id,request_key,scenario_id,requested_date,requested_time)
      values($1,$2,'salma',current_date + ((3-extract(isodow from current_date)::int+7)%7+1),time '09:30'),
            ($3,$4,'youssef',current_date + ((3-extract(isodow from current_date)::int+7)%7+1),time '09:30') returning id,scenario_id,requested_date,requested_time`, [
      requestIds[0], randomUUID(), requestIds[1], randomUUID(),
    ]);
    assert.equal(fixtures.rowCount, 2);
    await client.query('commit');

    const environment = {
      ...process.env,
      LOCAL_BOOKING_CONFIRM_E2E_EMAIL: email,
      LOCAL_BOOKING_CONFIRM_E2E_PASSWORD: password,
      LOCAL_BOOKING_CONFIRM_SALMA_REQUEST_ID: requestIds[0],
      LOCAL_BOOKING_CONFIRM_YOUSSEF_REQUEST_ID: requestIds[1],
      LOCAL_PUBLIC_BOOKING_REQUEST_KEY: publicRequestKey,
      PUBLIC_BOOKING_LOCAL_URL: 'http://localhost:4202',
      CLINIC_OS_LOCAL_URL: 'http://localhost:4204',
      DENTAL_API_LOCAL_URL: apiBase,
    };
    const result = process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm exec playwright test tests/e2e/demo-booking-confirmation-local.spec.ts tests/e2e/public-to-confirmation.local.spec.ts --workers=1'], { cwd: process.cwd(), env: environment, encoding: 'utf8', windowsHide: true })
      : spawnSync('pnpm', ['exec', 'playwright', 'test', 'tests/e2e/demo-booking-confirmation-local.spec.ts', 'tests/e2e/public-to-confirmation.local.spec.ts', '--workers=1'], { cwd: process.cwd(), env: environment, encoding: 'utf8' });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) throw new Error('Local booking-confirmation browser/API check failed.');

    const appointment = await client.query('select id,booking_request_id from private.demo_confirmed_appointments where clinic_id=$1 and booking_request_id=any($2::uuid[])', ['10000000-0000-4000-8000-000000000001', requestIds]);
    assert.deepEqual(appointment.rows.map(row => row.booking_request_id).sort(), [requestIds[0]].sort());
    const effects = await client.query(`select count(*)::int n from private.outbox_events where event_type='DemoAppointmentConfirmed' and aggregate_id=any($1::uuid[])`, [appointment.rows.map(row => row.id)]);
    assert.equal(effects.rows[0].n, 1);
    const publicRequest = await client.query('select id,scenario_id,requested_date,requested_time from private.demo_booking_requests where request_key=$1', [publicRequestKey]);
    assert.equal(publicRequest.rowCount, 1, 'The Public Booking app must create the request used by Reception.');
    assert.equal(publicRequest.rows[0].scenario_id, 'salma');
    const publicAppointment = await client.query('select id,duration_minutes,starts_at,ends_at from private.demo_confirmed_appointments where clinic_id=$1 and booking_request_id=$2', ['10000000-0000-4000-8000-000000000001', publicRequest.rows[0].id]);
    assert.equal(publicAppointment.rowCount, 1, 'Reception must confirm the same public request.');
    assert.equal(publicAppointment.rows[0].duration_minutes, 45);
    const publicEffects = await client.query(`select count(*)::int n from private.outbox_events where event_type='DemoAppointmentConfirmed' and aggregate_id=$1`, [publicAppointment.rows[0].id]);
    assert.equal(publicEffects.rows[0].n, 1);
    console.log('Local public request→Reception→PostgreSQL confirmation and collision checks passed; temporary fixtures will be removed.');
  } catch (error) { failure = error; }
  finally {
    if (client) {
      try {
        await client.query('begin');
        await client.query("set local session_replication_role='replica'");
        const publicRows = await client.query('select id from private.demo_booking_requests where request_key=$1', [publicRequestKey]);
        const cleanupRequestIds = [...requestIds, ...publicRows.rows.map(row => row.id)];
        const appointments = await client.query('select id from private.demo_confirmed_appointments where clinic_id=$1 and booking_request_id=any($2::uuid[])', ['10000000-0000-4000-8000-000000000001', cleanupRequestIds]);
        const aggregateIds = [...cleanupRequestIds, ...appointments.rows.map(row => row.id)];
        for (const table of ['outbox_attempts', 'outbox_deliveries', 'consumed_events']) {
          await client.query(`delete from private.${table} where event_id in(select event_id from private.outbox_events where clinic_id='10000000-0000-4000-8000-000000000001' and aggregate_id=any($1::uuid[]))`, [aggregateIds]);
        }
        await client.query('delete from private.audit_events where clinic_id=$1 and aggregate_id=any($2::uuid[])', ['10000000-0000-4000-8000-000000000001', aggregateIds]);
        await client.query('delete from private.outbox_events where clinic_id=$1 and aggregate_id=any($2::uuid[])', ['10000000-0000-4000-8000-000000000001', aggregateIds]);
        await client.query('delete from private.demo_booking_confirmation_idempotency where clinic_id=$1 and booking_request_id=any($2::uuid[])', ['10000000-0000-4000-8000-000000000001', cleanupRequestIds]);
        await client.query('delete from private.demo_confirmed_appointments where clinic_id=$1 and booking_request_id=any($2::uuid[])', ['10000000-0000-4000-8000-000000000001', cleanupRequestIds]);
        await client.query('delete from private.demo_booking_requests where clinic_id=$1 and id=any($2::uuid[])', ['10000000-0000-4000-8000-000000000001', cleanupRequestIds]);
        if (authUserId) {
          await client.query('delete from public.clinic_memberships where user_id=$1', [authUserId]);
          await client.query('delete from public.profiles where user_id=$1', [authUserId]);
        }
        await client.query('commit');
      } catch {
        failure = new Error('Local synthetic booking fixture cleanup failed; inspect the local database before using it.');
        try { await client.query('rollback'); } catch { /* connection cleanup follows */ }
      }
      await client.end().catch(() => undefined);
    }
    if (authCreated) {
      try { await adminRequest(apiUrl.origin, status.SERVICE_ROLE_KEY, `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, { method: 'DELETE' }); }
      catch { failure = new Error('Temporary local Auth fixture cleanup failed; remove the synthetic test user before continuing.'); }
    }
  }
  if (failure) throw failure;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Local booking-confirmation verification failed.');
  process.exitCode = 1;
});
