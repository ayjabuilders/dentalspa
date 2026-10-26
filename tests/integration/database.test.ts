import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, B, STAFF, PATIENT, P1, P2, P3 } from '../fixtures';

// Executes the actual migration on PostgreSQL in WASM. Auth/storage schemas are
// minimal stubs: this is SQL/RLS evidence, NOT a hosted Supabase integration test.
describe('foundation migration on embedded PostgreSQL', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(readFileSync('supabase/migrations/20261026131434_foundation.sql','utf8'));
    await db.exec(`insert into public.clinics(id,name) values ('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users values ('${STAFF}'),('${PATIENT}');
      insert into public.profiles(user_id,display_name) values ('${STAFF}','Synthetic staff'),('${PATIENT}','Synthetic patient');
      insert into public.clinic_memberships(clinic_id,user_id,role,active) values ('${A}','${STAFF}','reception',true);
      insert into public.patients(id,clinic_id,display_name,reference) values ('${P1}','${A}','Synthetic A','A'),('${P2}','${B}','Synthetic B','B'),('${P3}','${A}','Synthetic C','C');
      insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by) values ('${PATIENT}','${A}','${P1}',now(),'${STAFF}');`);
  },30000);
  afterAll(async () => { await db?.close(); });
  async function asUser(user: string, callback: () => Promise<void>) {
    await db.exec('begin; set local role authenticated;');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    try { await callback(); } finally { await db.exec('rollback;'); }
  }
  it('enforces tenant RLS on list and guessed IDs', async () => {
    await asUser(STAFF,async () => {
      expect((await db.query<{id:string}>('select id from public.patients order by reference')).rows.map(p=>p.id)).toEqual([P1,P3]);
      expect((await db.query('select * from public.patients where id=$1',[P2])).rows).toHaveLength(0);
      expect((await db.query('select * from public.clinics')).rows).toHaveLength(1);
    });
  });
  it('enforces own-patient scope independently of clinic membership', async () => {
    await asUser(PATIENT,async () => {
      expect((await db.query<{id:string}>('select id from public.patients')).rows.map(p=>p.id)).toEqual([P1]);
      expect((await db.query('select * from public.clinic_memberships')).rows).toHaveLength(0);
    });
  });
  it('denies direct mutation and self-assigned roles', async () => {
    await asUser(STAFF,async () => { await expect(db.exec(`update public.clinic_memberships set role='dentist'`)).rejects.toThrow(/permission denied/); });
    await asUser(PATIENT,async () => { await expect(db.exec(`update public.patient_account_links set patient_id='${P3}'`)).rejects.toThrow(/permission denied/); });
  });
  it('denies direct insert and delete even inside an authorized clinic', async () => {
    await asUser(STAFF,async () => { await expect(db.exec(`insert into public.patients(clinic_id,reference,display_name) values ('${A}','DENIED','Synthetic denied')`)).rejects.toMatchObject({code:'42501'}); });
    await asUser(STAFF,async () => { await expect(db.exec(`delete from public.patients where id='${P1}'`)).rejects.toMatchObject({code:'42501'}); });
  });
  it('exposes only own profile and verified links, never patient links to staff', async () => {
    await asUser(STAFF,async () => {
      expect((await db.query<{user_id:string}>('select user_id from public.profiles')).rows.map(p=>p.user_id)).toEqual([STAFF]);
      expect((await db.query('select * from public.patient_account_links')).rows).toHaveLength(0);
    });
    await asUser(PATIENT,async () => {
      expect((await db.query<{patient_id:string}>('select patient_id from public.patient_account_links')).rows.map(p=>p.patient_id)).toEqual([P1]);
    });
  });
  it('denies an unverified link and removes access as soon as verification is revoked', async () => {
    await db.exec(`update public.patient_account_links set verified_at=null,verified_by=null where user_id='${PATIENT}'`);
    try {
      await asUser(PATIENT,async () => {
        for (const table of ['patients','clinics','patient_account_links']) expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
      });
    } finally {
      await db.exec(`update public.patient_account_links set verified_at=now(),verified_by='${STAFF}' where user_id='${PATIENT}'`);
    }
  });
  it('denies missing subjects and subjects with no provisioned scope', async () => {
    for (const subject of ['', '20000000-0000-4000-8000-000000000099']) {
      await asUser(subject,async () => {
        expect((await db.query('select * from public.patients')).rows).toHaveLength(0);
        expect((await db.query('select * from public.clinics')).rows).toHaveLength(0);
      });
    }
  });
  it('denies anonymous and revoked membership access', async () => {
    await db.exec('begin; set local role anon;');
    try { await expect(db.exec('select * from public.patients')).rejects.toThrow(/permission denied/); } finally { await db.exec('rollback;'); }
    await db.exec('update public.clinic_memberships set active=false;');
    try {
      await asUser(STAFF,async () => {
        expect((await db.query('select * from public.patients')).rows).toHaveLength(0);
        expect((await db.query('select * from public.clinic_memberships')).rows).toHaveLength(0);
      });
    } finally { await db.exec('update public.clinic_memberships set active=true;'); }
  });
  it('rejects cross-clinic account links even with privileged SQL', async () => {
    await expect(db.exec(`update public.patient_account_links set patient_id='${P2}' where user_id='${PATIENT}'`)).rejects.toThrow(/foreign key constraint/);
  });
  it('keeps documents private and audit/outbox unavailable to clients', async () => {
    expect((await db.query<{public:boolean}>("select public from storage.buckets where id='patient-documents'")).rows[0]?.public).toBe(false);
    await asUser(STAFF,async () => { await expect(db.exec('select * from private.audit_events')).rejects.toThrow(/permission denied/); });
    await asUser(PATIENT,async () => { await expect(db.exec('select * from private.outbox_events')).rejects.toMatchObject({code:'42501'}); });
  });
  it('enables RLS on every public foundation table', async () => {
    const result = await db.query<{relname:string;relrowsecurity:boolean}>(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`);
    expect(result.rows.map(row=>row.relname)).toEqual(['clinic_memberships','clinics','patient_account_links','patients','profiles']);
    expect(result.rows.every(row=>row.relrowsecurity)).toBe(true);
  });
  it('consumer identity makes event delivery replay idempotent', async () => {
    await db.exec(`insert into private.outbox_events(event_id,clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref) values ('${P1}','${A}','FoundationAccessReviewed',1,'${P1}','${P3}','${STAFF}');
      insert into private.consumed_events(consumer_id,event_id) values ('test-consumer','${P1}');`);
    await expect(db.exec(`insert into private.consumed_events(consumer_id,event_id) values ('test-consumer','${P1}')`)).rejects.toThrow(/duplicate key/);
  });
});
