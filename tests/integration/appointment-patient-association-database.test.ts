import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, B, STAFF, P1, P2 } from '../fixtures';

describe('appointment patient association transaction', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema private; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${STAFF}'::uuid$$;
      create function auth.jwt() returns jsonb language sql as $$select '{"session_id":"${STAFF}"}'::jsonb$$;
      create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
      insert into auth.sessions values ('${STAFF}','${STAFF}',null);
      create table public.clinic_memberships(clinic_id uuid,user_id uuid,active boolean,role text);
      insert into public.clinic_memberships values ('${A}','${STAFF}',true,'manager');
      create table public.patients(clinic_id uuid,id uuid,unique(clinic_id,id));
      insert into public.patients values ('${A}','${P1}'),('${B}','${P2}');
      create table private.agenda_configuration_gates(clinic_id uuid,enabled boolean,synthetic_only boolean,confirmations_enabled boolean,api_gate_key text);
      insert into private.agenda_configuration_gates values ('${A}',true,true,true,'test-gate');
      create table private.configured_appointments(id uuid primary key,clinic_id uuid,starts_at timestamptz,version integer);
      insert into private.configured_appointments values ('${P2}','${A}',now(),1);
      create table private.configured_appointment_commands(clinic_id uuid,actor_ref uuid,request_key uuid,appointment_id uuid,canonical_payload jsonb,receipt jsonb,primary key(clinic_id,actor_ref,request_key));
      create table private.audit_events(clinic_id uuid,actor_ref uuid,action text,aggregate_id uuid,correlation_id uuid,occurred_at timestamptz);
      create table private.outbox_events(clinic_id uuid,event_type text,event_version integer,aggregate_type text,aggregate_id uuid,correlation_id uuid,actor_ref uuid,occurred_at timestamptz,payload jsonb);`);
    for (const file of ['20261101033907_configured_appointment_patient_link.sql', '20261101034102_configured_appointment_patient_association_command.sql']) await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  });
  afterAll(async () => { await db?.close(); });
  const command = (patient: string | null = P1, version = 1, key = STAFF, clinic = A) => db.query<{ receipt: { version: number; replayed: boolean; association_status: string; identity_verified: boolean } }>('select public.associate_local_configured_appointment_patient($1,$2,$3,$4,$5,$6) receipt', [clinic, P2, patient, version, key, 'test-gate']);
  async function transaction(run: () => Promise<void>) { await db.exec('begin'); try { await run(); } finally { await db.exec('rollback'); } }
  it('records only a possible match, with atomic audit/outbox and idempotent replay', () => transaction(async () => {
    const first = (await command()).rows[0]!.receipt;
    expect(first).toMatchObject({ version: 2, replayed: false, association_status: 'possible_match', identity_verified: false });
    expect((await command()).rows[0]!.receipt.replayed).toBe(true);
    expect((await db.query('select (select count(*)::int from private.audit_events) audits,(select count(*)::int from private.outbox_events) events')).rows[0]).toEqual({ audits: 1, events: 1 });
    expect((await command(null, 2, P1)).rows[0]!.receipt).toMatchObject({ version: 3, association_status: 'unlinked', identity_verified: false });
  }));
  it('rejects stale versions without mutation', () => transaction(async () => {
    await expect(command(P1, 2)).rejects.toMatchObject({ code: 'SH409' });
  }));
  it('rejects foreign patients', () => transaction(async () => {
    await expect(command(P2)).rejects.toMatchObject({ code: 'SH404' });
  }));
  it('rejects another clinic', () => transaction(async () => {
    await expect(command(P1, 1, STAFF, B)).rejects.toMatchObject({ code: '42501' });
  }));
  it('rejects a changed payload with the same request key', () => transaction(async () => {
    await command(); await expect(command(null)).rejects.toMatchObject({ code: 'SH410' });
  }));
  it.each(['assistant', 'dentist'])('rejects role %s', role => transaction(async () => {
    await db.query('update public.clinic_memberships set role=$1', [role]);
    await expect(command()).rejects.toMatchObject({ code: '42501' });
  }));
  it('rechecks session revocation even for replay', () => transaction(async () => {
    await command(); await db.exec('delete from auth.sessions');
    await expect(command()).rejects.toMatchObject({ code: '28000' });
  }));
  it('respects the disabled capability', () => transaction(async () => {
    await db.exec('update private.agenda_configuration_gates set enabled=false');
    await expect(command()).rejects.toMatchObject({ code: 'PT503' });
  }));
});
