import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, STAFF, PATIENT, P1, P2 } from '../fixtures';

const CORRELATION = '20000000-0000-4000-8000-000000000099';
const FOREIGN_USER = '20000000-0000-4000-8000-000000000098';

describe('audited own-patient profile RPC on embedded PostgreSQL', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite({ extensions: { btree_gist } });
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(readFileSync('supabase/migrations/20261026131434_foundation.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261026155853_scheduling_hold.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261028130608_api_default_privilege_hardening.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261028164500_patient_profile_read_audit.sql', 'utf8'));
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users(id) values('${STAFF}'),('${PATIENT}'),('${FOREIGN_USER}');`);
  }, 30000);

  afterAll(async () => { await db?.close(); });

  beforeEach(async () => {
    await db.exec(`delete from private.outbox_events;delete from private.audit_events;
      delete from public.patient_account_links;delete from public.patients;
      insert into public.patients(id,clinic_id,reference,display_name) values
        ('${P1}','${A}','R-001','Synthetic Alice'),('${P2}','${B}','R-002','Foreign Profile');
      insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by)
        values('${PATIENT}','${A}','${P1}',now(),'${STAFF}');`);
  });

  async function asUser<T>(subject: string, work: (tx: PGlite) => Promise<T>, method = 'POST', role = 'authenticated') {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)", [subject, method]);
      return work(tx as unknown as PGlite);
    });
  }

  async function read(subject = PATIENT, clinic = A, method = 'POST', correlation = CORRELATION) {
    return asUser(subject, async tx => (await tx.query('select * from public.read_my_patient_profile($1,$2)', [clinic, correlation])).rows, method);
  }

  it('returns only the linked profile and writes minimal audit plus outbox atomically', async () => {
    expect(await read()).toEqual([{ id: P1, clinic_id: A, display_name: 'Synthetic Alice', reference: 'R-001' }]);
    const audit = (await db.query<{ action: string; aggregate_id: string; actor_ref: string; correlation_id: string }>('select action,aggregate_id,actor_ref,correlation_id from private.audit_events')).rows;
    expect(audit).toEqual([{ action: 'PatientProfileViewed', aggregate_id: P1, actor_ref: PATIENT, correlation_id: CORRELATION }]);
    const events = (await db.query<{ event_type: string; aggregate_type: string; aggregate_id: string; correlation_id: string; payload: Record<string, unknown> }>('select event_type,aggregate_type,aggregate_id,correlation_id,payload from private.outbox_events')).rows;
    expect(events).toEqual([{ event_type: 'PatientProfileViewed', aggregate_type: 'patient', aggregate_id: P1, correlation_id: CORRELATION, payload: { access_scope: 'own_profile' } }]);
    expect(JSON.stringify([...audit, ...events])).not.toMatch(/Synthetic Alice|R-001|contact|email/i);
  });

  it('does not reveal a profile or emit audit when the requested clinic or verified link differs', async () => {
    expect(await read(PATIENT, B)).toEqual([]);
    await db.exec(`update public.patient_account_links set verified_at=null,verified_by=null where user_id='${PATIENT}'`);
    expect(await read()).toEqual([]);
    expect(await read(FOREIGN_USER)).toEqual([]);
    expect((await db.query('select * from private.audit_events')).rows).toEqual([]);
    expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);
  });

  it('requires an authenticated POST with explicit clinic and correlation IDs', async () => {
    await expect(read('', A, 'POST')).rejects.toMatchObject({ code: '28000' });
    await expect(read(PATIENT, A, 'GET')).rejects.toMatchObject({ code: '22023' });
    await expect(asUser(PATIENT, async tx => tx.query('select * from public.read_my_patient_profile(null,$1)', [CORRELATION]))).rejects.toMatchObject({ code: '22023' });
    await expect(asUser(PATIENT, async tx => tx.query('select * from public.read_my_patient_profile($1,null)', [A]))).rejects.toMatchObject({ code: '22023' });
    expect((await db.query('select * from private.audit_events')).rows).toEqual([]);
  });

  it('denies direct audit access and function execution to anon and service_role', async () => {
    for (const role of ['anon', 'service_role']) {
      await expect(asUser(PATIENT, async tx => tx.query('select * from public.read_my_patient_profile($1,$2)', [A, CORRELATION]), 'POST', role)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(asUser(PATIENT, async tx => tx.query('select * from private.audit_events'))).rejects.toMatchObject({ code: '42501' });
  });

  it('rolls back the audit row if the transactional outbox insert fails', async () => {
    await db.exec(`create function private.fail_patient_profile_outbox() returns trigger language plpgsql as $$begin raise exception using errcode='P0001',message='synthetic sink failure';end$$;
      create trigger fail_patient_profile_outbox before insert on private.outbox_events for each row execute function private.fail_patient_profile_outbox();`);
    try { await expect(read()).rejects.toMatchObject({ code: 'P0001' }); }
    finally { await db.exec('drop trigger fail_patient_profile_outbox on private.outbox_events;drop function private.fail_patient_profile_outbox()'); }
    expect((await db.query('select * from private.audit_events')).rows).toEqual([]);
    expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);
  });

  it('keeps the definer, search path and authenticated-only execute grant explicit', async () => {
    const routine = (await db.query<{ definer: boolean; config: string[] }>(`select p.prosecdef definer,p.proconfig config from pg_proc p where p.oid='public.read_my_patient_profile(uuid,uuid)'::regprocedure`)).rows[0]!;
    expect(routine.definer).toBe(true);
    expect(routine.config).toContain('search_path=""');
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.read_my_patient_profile(uuid,uuid)','execute') allowed")).rows[0]?.allowed).toBe(true);
    for (const role of ['anon', 'service_role']) expect((await db.query<{ allowed: boolean }>('select has_function_privilege($1,$2,$3) allowed', [role, 'public.read_my_patient_profile(uuid,uuid)', 'execute'])).rows[0]?.allowed).toBe(false);
  });
});
