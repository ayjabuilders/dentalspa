import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, B, STAFF, P1, P2 } from '../fixtures';
describe('configured calendar patient projection', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema private; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${STAFF}'::uuid$$;
      create function auth.jwt() returns jsonb language sql as $$select '{"session_id":"${STAFF}"}'::jsonb$$;
      create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
      insert into auth.sessions values ('${STAFF}','${STAFF}',null);
      create table public.clinic_memberships(clinic_id uuid,user_id uuid,active boolean,role text);
      insert into public.clinic_memberships values ('${A}','${STAFF}',true,'manager');
      create table public.patients(id uuid,clinic_id uuid,display_name text,reference text);
      insert into public.patients values ('${P1}','${A}','Synthetic local','LOCAL'),('${P2}','${B}','Synthetic foreign','FOREIGN');
      create function private.scheduling_time(timestamptz) returns text language sql as $$select to_char($1 at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')$$;
      create table private.configured_appointments(id uuid,clinic_id uuid,patient_id uuid,starts_at timestamptz,ends_at timestamptz,status text,version integer,request_id uuid,configuration_revision integer,provider_resource_id uuid,chair_resource_id uuid);
      create table private.demo_confirmed_appointments (like private.configured_appointments);
      create table private.demo_booking_sample_resources(id uuid,clinic_id uuid,display_name text);
      create table private.scheduling_resources (like private.demo_booking_sample_resources);
      insert into private.scheduling_resources values ('${STAFF}','${A}','Synthetic resource');
      create table private.configured_booking_requests(id uuid,clinic_id uuid,contact_name text,visit_type_id uuid);
      insert into private.configured_booking_requests values ('${P2}','${A}','Public contact','${STAFF}');
      create table private.agenda_configuration_versions(clinic_id uuid,revision integer,configuration jsonb);
      insert into private.agenda_configuration_versions values ('${A}',1,'{"visit_types":[{"id":"${STAFF}","name":"Consultation"}]}');
      insert into private.configured_appointments values ('${P2}','${A}','${P1}','2026-11-02T09:00Z','2026-11-02T09:30Z','confirmed',2,'${P2}',1,'${STAFF}','${STAFF}');`);
    await db.exec(readFileSync('supabase/migrations/20261101034724_configured_appointment_patient_projection.sql', 'utf8'));
  });
  afterAll(async () => { await db?.close(); });
  const read = () => db.query<{ result: { items: Array<{ patient: unknown; source: string; contact_name: string }> } }>(`select public.list_local_patient_appointments('${A}','2026-11-02','2026-11-02') result`);
  it('returns the associated same-clinic dossier and preserves the public contact separately', async () => {
    expect((await read()).rows[0]!.result.items[0]).toMatchObject({ source: 'configured', contact_name: 'Public contact', patient: { id: P1, display_name: 'Synthetic local', reference: 'LOCAL' } });
  });
  it('does not project another clinic even for a corrupt association fixture', async () => {
    await db.exec('begin');
    try {
      await db.query('update private.configured_appointments set patient_id=$1', [P2]);
      expect((await read()).rows[0]!.result.items[0]!.patient).toBeNull();
    } finally { await db.exec('rollback'); }
  });
  it('removes the dossier from the projection after unlink', async () => {
    await db.exec('begin');
    try {
      await db.exec('update private.configured_appointments set patient_id=null');
      expect((await read()).rows[0]!.result.items[0]!.patient).toBeNull();
    } finally { await db.exec('rollback'); }
  });
});
