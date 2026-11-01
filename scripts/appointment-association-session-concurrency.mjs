// Local synthetic seed only. Appointment writes are always rolled back.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';

function connectionString() {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 };
  const raw = process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], options)
    : execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], options);
  const url = new URL(JSON.parse(raw).DB_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol)
    && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    && url.port === '54322' && url.pathname === '/postgres'
    && url.username === 'postgres' && !url.search && !url.hash, 'Local database required');
  return url.toString();
}
async function query(client, sql, values = []) {
  try { return await client.query(sql, values); }
  catch (error) { throw Object.assign(new Error('Database operation failed'), { code: error.code }); }
}

test('revocation during an actual agenda lock wait rejects association without writes', async () => {
  const url = connectionString();
  const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString: url,
    connectionTimeoutMillis: 5000, statement_timeout: 15000, lock_timeout: 12000,
    idle_in_transaction_session_timeout: 20000 }));
  const [observer, blocker, actor] = clients;
  const session = randomUUID(), request = randomUUID();
  let pending;
  let sessionCreated = false;
  try {
    for (const client of clients) await client.connect();
    const { rows: [fixture] } = await query(observer, `select a.clinic_id,a.id,a.version,a.patient_id original_patient,
      p.id patient_id,m.user_id,g.api_gate_key from private.configured_appointments a
      join public.clinics c on c.id=a.clinic_id
      join public.clinic_memberships m on m.clinic_id=c.id and m.active and m.role='manager'
      join private.agenda_configuration_gates g on g.clinic_id=c.id and g.enabled and g.synthetic_only and g.confirmations_enabled
      join public.patients p on p.clinic_id=c.id and p.id is distinct from a.patient_id
      where c.id='10000000-0000-4000-8000-000000000001'
      and c.name='Cabinet Dentaire Atlas - Casablanca (FICTIF)' order by a.id,p.id limit 1`);
    assert.ok(fixture, 'Existing synthetic fixture required');
    await query(observer, "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '10 minutes')", [session, fixture.user_id]);
    sessionCreated = true;
    await query(blocker, 'begin');
    await query(blocker, "select pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||$1,0))", [fixture.clinic_id]);
    const { rows: [{ pid }] } = await query(actor, 'select pg_backend_pid() pid');
    await query(actor, 'begin');
    await query(actor, "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [fixture.user_id, JSON.stringify({ sub: fixture.user_id, session_id: session })]);
    await query(actor, 'set local role authenticated');
    pending = query(actor, 'select public.associate_local_configured_appointment_patient($1,$2,$3,$4,$5,$6)',
      [fixture.clinic_id, fixture.id, fixture.patient_id, fixture.version, request, fixture.api_gate_key])
      .then(() => ({ ok: true }), error => ({ ok: false, code: error.code }));
    let waiting = false;
    for (let i = 0; i < 200; i++) {
      const { rows: [state] } = await query(observer, "select wait_event_type='Lock' and wait_event='advisory' waiting from pg_stat_activity where pid=$1", [pid]);
      if (state?.waiting) { waiting = true; break; }
      await delay(20);
    }
    assert.ok(waiting, 'Observed real advisory-lock wait before revocation');
    await query(observer, 'delete from auth.sessions where id=$1', [session]);
    await query(blocker, 'rollback');
    assert.deepEqual(await pending, { ok: false, code: '28000' });
    await query(actor, 'rollback');
    const { rows: [after] } = await query(observer, 'select version,patient_id from private.configured_appointments where id=$1', [fixture.id]);
    assert.deepEqual(after, { version: fixture.version, patient_id: fixture.original_patient });
    for (const [table, key] of [['configured_appointment_commands', 'request_key'], ['audit_events', 'correlation_id'], ['outbox_events', 'correlation_id']]) {
      const { rows: [{ count }] } = await query(observer, `select count(*)::int count from private.${table} where ${key}=$1`, [request]);
      assert.equal(count, 0, `${table} contains no rejected command output`);
    }
  } finally {
    await query(blocker, 'rollback').catch(() => {});
    if (pending) await pending;
    await query(actor, 'rollback').catch(() => {});
    try {
      if (sessionCreated) await query(observer, 'delete from auth.sessions where id=$1', [session]);
    } finally { await Promise.allSettled(clients.map(client => client.end())); }
  }
});
