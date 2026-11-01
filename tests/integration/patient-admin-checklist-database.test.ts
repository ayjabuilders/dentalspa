import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, P1, P2, STAFF } from '../fixtures';

const ASSISTANT = '20000000-0000-4000-8000-000000000004';
const FOREIGN_STAFF = '20000000-0000-4000-8000-000000000005';
const KEY = '50000000-0000-4000-8000-000000000001';
const KEY_2 = '50000000-0000-4000-8000-000000000002';
const CORRELATION = '50000000-0000-4000-8000-000000000003';

describe('clinic admin document checklist RPC on embedded PostgreSQL', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite({ extensions: { btree_gist } });
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const migration of [
      '20261026131434_foundation.sql',
      '20261026155853_scheduling_hold.sql',
      '20261028130608_api_default_privilege_hardening.sql',
      '20261030004627_patient_admin_checklist.sql',
    ]) await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users(id) values('${STAFF}'),('${ASSISTANT}'),('${FOREIGN_STAFF}');`);
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`alter table private.patient_admin_document_checklist_receipts disable trigger patient_admin_checklist_receipts_immutable;
      delete from private.patient_admin_document_checklist_receipts;
      alter table private.patient_admin_document_checklist_receipts enable trigger patient_admin_checklist_receipts_immutable;
      delete from private.patient_admin_document_checklist;
      delete from private.outbox_events;delete from private.audit_events;
      delete from public.clinic_memberships;delete from public.patients;
      update private.patient_admin_document_checklist_settings set enabled=false where singleton;
      insert into public.patients(id,clinic_id,reference,display_name) values
        ('${P1}','${A}','R-001','Synthetic Samira'),('${P2}','${B}','R-002','Synthetic Foreign');
      insert into public.clinic_memberships(clinic_id,user_id,role,active) values
        ('${A}','${STAFF}','reception',true),('${A}','${ASSISTANT}','assistant',true),
        ('${B}','${FOREIGN_STAFF}','manager',true);`);
  });

  async function asUser<T>(subject: string, work: (tx: PGlite) => Promise<T>, method = 'POST', role = 'authenticated') {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query('select set_config(\'request.jwt.claim.sub\',$1,true),set_config(\'request.method\',$2,true)', [subject, method]);
      return work(tx as unknown as PGlite);
    });
  }
  async function list(subject = STAFF, clinic = A, patient = P1) {
    return asUser(subject, async tx => (await tx.query<{ result: unknown }>(
      'select public.list_patient_admin_document_checklist($1,$2,$3) result', [clinic, patient, CORRELATION],
    )).rows[0]?.result);
  }
  async function set(input: unknown, key = KEY, subject = STAFF, clinic = A, patient = P1) {
    return asUser(subject, async tx => (await tx.query<{ result: unknown }>(
      'select public.set_patient_admin_document_checklist($1,$2,$3::jsonb,$4,$5) result',
      [clinic, patient, JSON.stringify(input), key, CORRELATION],
    )).rows[0]?.result);
  }

  it('defaults off, requires an active same-clinic permitted membership, and conceals foreign patients', async () => {
    await expect(list()).rejects.toMatchObject({ code: 'PT503' });
    await expect(set({ expected_revision: 0, kind: 'cnss', status: 'received' })).rejects.toMatchObject({ code: 'PT503' });
    await db.exec('update private.patient_admin_document_checklist_settings set enabled=true where singleton');
    await expect(list(ASSISTANT)).rejects.toMatchObject({ code: '42501' });
    await expect(list(FOREIGN_STAFF, A, P1)).rejects.toMatchObject({ code: '42501' });
    await expect(list(STAFF, A, P2)).rejects.toMatchObject({ code: 'PT404' });
    await expect(list(STAFF, B, P2)).rejects.toMatchObject({ code: '42501' });
    await expect(list(STAFF, A, P1)).resolves.toEqual({ schema_version: 1, clinic_id: A, patient_id: P1, items: [] });
  });

  it('uses exact allowlisted fields, revision CAS, idempotent receipts and atomic audit/outbox', async () => {
    await db.exec('update private.patient_admin_document_checklist_settings set enabled=true where singleton');
    await expect(set({ expected_revision: 0, kind: 'cnss', status: 'received', note: 'private' })).rejects.toMatchObject({ code: '22023' });
    await expect(set({ expected_revision: 0, kind: 'cnss', status: 'reimbursed' })).rejects.toMatchObject({ code: '22023' });
    const first = await set({ expected_revision: 0, kind: 'cnss', status: 'received' }) as { item: Record<string, unknown>; replayed: boolean };
    expect(first.replayed).toBe(false);
    expect(first.item).toMatchObject({ clinic_id: A, patient_id: P1, kind: 'cnss', status: 'received', revision: 1, updated_by: STAFF });
    expect(first.item.updated_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(await set({ expected_revision: 0, kind: 'cnss', status: 'received' })).toEqual({ ...first, replayed: true });
    await expect(set({ expected_revision: 0, kind: 'cnss', status: 'missing' })).rejects.toMatchObject({ code: 'PT409' });
    await expect(set({ expected_revision: 1, kind: 'cnss', status: 'missing' }, KEY)).rejects.toMatchObject({ code: 'PT409' });
    await expect(set({ expected_revision: 1, kind: 'cnss', status: 'missing' }, KEY_2)).resolves.toMatchObject({ replayed: false, item: { status: 'missing', revision: 2 } });
    expect(await list()).toMatchObject({ items: [{ kind: 'cnss', status: 'missing', revision: 2, updated_by: STAFF }] });
    expect((await db.query<{ count: number }>("select count(*)::int count from private.audit_events where action='PatientAdminDocumentChecklistChanged'")).rows[0]?.count).toBe(2);
    const events = (await db.query<{ payload: Record<string, unknown> }>("select payload from private.outbox_events where event_type='PatientAdminDocumentChecklistChanged' order by occurred_at")).rows;
    expect(events.map(event => event.payload)).toEqual([
      { kind: 'cnss', status: 'received', revision: 1 },
      { kind: 'cnss', status: 'missing', revision: 2 },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/Synthetic Samira|R-001|note|claim|eligibility/i);
  });

  it('rejects direct private-table access and immutable receipt mutation, and rolls back when outbox fails', async () => {
    await db.exec('update private.patient_admin_document_checklist_settings set enabled=true where singleton');
    await expect(asUser(STAFF, tx => tx.query('select * from private.patient_admin_document_checklist'))).rejects.toMatchObject({ code: '42501' });
    await set({ expected_revision: 0, kind: 'cnops', status: 'missing' });
    await expect(db.query("update private.patient_admin_document_checklist_receipts set item='{}'::jsonb")).rejects.toMatchObject({ code: '55000' });
    await expect(db.query('delete from private.patient_admin_document_checklist_receipts')).rejects.toMatchObject({ code: '55000' });
    await db.exec(`create function private.fail_admin_checklist_outbox() returns trigger language plpgsql as $$begin raise exception using errcode='P0001',message='synthetic outbox failure';end$$;
      create trigger fail_admin_checklist_outbox before insert on private.outbox_events for each row when(new.event_type='PatientAdminDocumentChecklistChanged') execute function private.fail_admin_checklist_outbox();`);
    try { await expect(set({ expected_revision: 1, kind: 'cnops', status: 'received' }, KEY_2)).rejects.toMatchObject({ code: 'P0001' }); }
    finally { await db.exec('drop trigger fail_admin_checklist_outbox on private.outbox_events;drop function private.fail_admin_checklist_outbox()'); }
    expect((await db.query('select status,revision from private.patient_admin_document_checklist')).rows).toEqual([{ status: 'missing', revision: 1 }]);
    expect((await db.query<{ count: number }>('select count(*)::int count from private.patient_admin_document_checklist_receipts')).rows[0]?.count).toBe(1);
  });

  it('exposes only authenticated RPC execution and denies inactive roles', async () => {
    for (const role of ['anon', 'service_role']) {
      await expect(asUser(STAFF, tx => tx.query('select public.list_patient_admin_document_checklist($1,$2,$3)', [A,P1,CORRELATION]), 'POST', role)).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(STAFF, tx => tx.query('select * from private.patient_admin_document_checklist'), 'POST', role)).rejects.toMatchObject({ code: '42501' });
    }
    await db.exec("update public.clinic_memberships set active=false where clinic_id='" + A + "' and user_id='" + STAFF + "'");
    await db.exec('update private.patient_admin_document_checklist_settings set enabled=true where singleton');
    await expect(list()).rejects.toMatchObject({ code: '42501' });
    const signature = 'public.set_patient_admin_document_checklist(uuid,uuid,jsonb,uuid,uuid)';
    expect((await db.query<{ allowed: boolean }>('select has_function_privilege($1,$2,$3) allowed', ['authenticated',signature,'execute'])).rows[0]?.allowed).toBe(true);
    for (const role of ['anon','service_role']) expect((await db.query<{ allowed: boolean }>('select has_function_privilege($1,$2,$3) allowed',[role,signature,'execute'])).rows[0]?.allowed).toBe(false);
  });
});
