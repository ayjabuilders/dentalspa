import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('configured appointment patient association storage boundary', () => {
  let db: PGlite;
  const clinic = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const patient = '20000000-0000-4000-8000-000000000001';
  const foreignPatient = '20000000-0000-4000-8000-000000000002';
  const appointment = '30000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role authenticated; create schema private;
      create table public.patients(clinic_id uuid, id uuid, unique(clinic_id,id));
      create table private.configured_appointments(id uuid primary key, clinic_id uuid, starts_at timestamptz);
      alter table private.configured_appointments enable row level security;
      insert into public.patients values ('${clinic}','${patient}'),('${other}','${foreignPatient}');
      insert into private.configured_appointments values ('${appointment}','${clinic}',now());`);
    await db.exec(readFileSync('supabase/migrations/20261101033907_configured_appointment_patient_link.sql', 'utf8'));
  });
  afterAll(async () => { await db?.close(); });
  it('leaves existing public contacts unlinked', async () => {
    expect((await db.query('select patient_id from private.configured_appointments')).rows).toEqual([{ patient_id: null }]);
  });
  it('rejects foreign-clinic and nonexistent patients at the database boundary', async () => {
    for (const id of [foreignPatient, appointment]) await expect(db.query('update private.configured_appointments set patient_id=$1 where id=$2', [id, appointment])).rejects.toMatchObject({ code: '23503' });
  });
  it('permits a same-clinic association structurally without granting application writes', async () => {
    await db.query('update private.configured_appointments set patient_id=$1 where id=$2', [patient, appointment]);
    expect((await db.query('select patient_id from private.configured_appointments')).rows).toEqual([{ patient_id: patient }]);
    await db.exec('begin; set local role authenticated');
    try { await expect(db.exec('update private.configured_appointments set patient_id=null')).rejects.toMatchObject({ code: '42501' }); }
    finally { await db.exec('rollback'); }
  });
});
