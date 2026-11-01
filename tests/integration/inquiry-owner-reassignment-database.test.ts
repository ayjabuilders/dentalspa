import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, P1, P2, STAFF } from '../fixtures';

const OWNER = '20000000-0000-4000-8000-000000000004';
const TARGET = '20000000-0000-4000-8000-000000000005';
const ASSISTANT = '20000000-0000-4000-8000-000000000006';
const INACTIVE = '20000000-0000-4000-8000-000000000007';
const FOREIGN = '20000000-0000-4000-8000-000000000008';
const KEY = '40000000-0000-4000-8000-000000000001';
const CORRELATION = '40000000-0000-4000-8000-000000000002';

describe('manager-only inquiry owner reassignment RPC on embedded PostgreSQL', () => {
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
    await db.exec(readFileSync('supabase/migrations/20261026144919_manual_intake.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261026155853_scheduling_hold.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261028213646_inquiry_owner_reassignment.sql', 'utf8'));
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users(id) values('${STAFF}'),('${OWNER}'),('${TARGET}'),('${ASSISTANT}'),('${INACTIVE}'),('${FOREIGN}');
      insert into public.clinic_memberships(clinic_id,user_id,role,active) values
        ('${A}','${STAFF}','manager',true),('${A}','${OWNER}','reception',true),('${A}','${TARGET}','dentist',true),
        ('${A}','${ASSISTANT}','assistant',true),('${A}','${INACTIVE}','reception',false),('${B}','${FOREIGN}','manager',true);`);
  }, 30000);

  afterAll(async () => { await db?.close(); });

  beforeEach(async () => {
    await db.exec(`delete from private.inquiry_owner_reassignment_idempotency;
      delete from private.outbox_events;delete from private.audit_events;delete from public.inquiries;
      update private.intake_command_settings set enabled=true where singleton;
      insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source) values
        ('${P1}','${A}','${OWNER}','Synthetic inquiry A','phone'),('${P2}','${B}','${FOREIGN}','Foreign inquiry B','website');`);
  });

  async function asRole<T>(subject: string, role: string, work: (tx: PGlite) => Promise<T>, method = 'POST') {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)", [subject, method]);
      return work(tx as unknown as PGlite);
    });
  }

  async function reassign(owner = TARGET, expected = OWNER, key = KEY, clinic = A, inquiry = P1, actor = STAFF, method = 'POST') {
    return asRole(actor, 'authenticated', async tx => (await tx.query<{ result: Record<string, unknown> }>(
      'select public.reassign_inquiry_owner($1,$2,$3,$4,$5,$6) as result', [clinic, inquiry, expected, owner, key, CORRELATION],
    )).rows[0]?.result, method);
  }

  it('changes only the owner and atomically emits minimal audit and outbox records', async () => {
    const result = await reassign();
    expect(result).toMatchObject({ replayed: false, receipt: { inquiry_id: P1, clinic_id: A, previous_owner_user_id: OWNER, owner_user_id: TARGET, changed: true, event_version: 1 } });
    expect((await db.query('select owner_user_id from public.inquiries where id=$1', [P1])).rows).toEqual([{ owner_user_id: TARGET }]);
    expect((await db.query('select action,aggregate_id,actor_ref,correlation_id from private.audit_events')).rows).toEqual([{ action: 'InquiryOwnerReassigned', aggregate_id: P1, actor_ref: STAFF, correlation_id: CORRELATION }]);
    const events = (await db.query<{ event_type: string; aggregate_type: string; aggregate_id: string; payload: Record<string, unknown> }>('select event_type,aggregate_type,aggregate_id,payload from private.outbox_events')).rows;
    expect(events).toEqual([{ event_type: 'InquiryOwnerReassigned', aggregate_type: 'inquiry', aggregate_id: P1, payload: { inquiry_id: P1, previous_owner_user_id: OWNER, owner_user_id: TARGET } }]);
    expect(JSON.stringify(events)).not.toMatch(/Synthetic inquiry|contact|email|phone/i);
  });

  it('returns the original receipt on identical replay and rejects key reuse with changed input', async () => {
    const first = await reassign();
    const replay = await reassign();
    expect(replay).toMatchObject({ ...first, replayed: true });
    expect((await db.query<{ count: number }>('select count(*)::int as count from private.audit_events')).rows[0]?.count).toBe(1);
    await expect(reassign(ASSISTANT)).rejects.toMatchObject({ code: 'PT409' });
    expect((await db.query<{ count: number }>('select count(*)::int as count from private.outbox_events')).rows[0]?.count).toBe(1);
  });

  it('denies non-manager, inactive manager, ineligible target, foreign target, and foreign inquiry', async () => {
    await expect(reassign(TARGET, OWNER, KEY, A, P1, OWNER)).rejects.toMatchObject({ code: '42501' });
    await expect(reassign(TARGET, OWNER, KEY, A, P1, INACTIVE)).rejects.toMatchObject({ code: '42501' });
    await expect(reassign(ASSISTANT)).rejects.toMatchObject({ code: '42501' });
    await expect(reassign(INACTIVE)).rejects.toMatchObject({ code: '42501' });
    await expect(reassign(FOREIGN)).rejects.toMatchObject({ code: '42501' });
    await expect(reassign(TARGET, OWNER, KEY, A, P2)).rejects.toMatchObject({ code: 'PT404' });
    expect((await db.query<{ owner_user_id: string }>('select owner_user_id from public.inquiries where id=$1', [P1])).rows[0]?.owner_user_id).toBe(OWNER);
    expect((await db.query('select * from private.audit_events')).rows).toEqual([]);
    expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);
  });

  it('compares the observed owner, supports a no-op without emitting an event, and honors activation', async () => {
    await expect(reassign(TARGET, STAFF, KEY)).rejects.toMatchObject({ code: 'PT409' });
    const noop = await reassign(OWNER, OWNER, '40000000-0000-4000-8000-000000000003');
    expect(noop).toMatchObject({ replayed: false, receipt: { changed: false, previous_owner_user_id: OWNER, owner_user_id: OWNER } });
    expect((await db.query('select * from private.audit_events')).rows).toEqual([]);
    expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);
    await db.exec('update private.intake_command_settings set enabled=false where singleton');
    await expect(reassign(TARGET, OWNER, '40000000-0000-4000-8000-000000000004')).rejects.toMatchObject({ code: 'PT503' });
  });

  it('requires authenticated POST and authenticated-only function privileges', async () => {
    await expect(asRole('', 'authenticated', tx => tx.query('select public.reassign_inquiry_owner($1,$2,$3,$4,$5,$6)', [A, P1, OWNER, TARGET, KEY, CORRELATION]))).rejects.toMatchObject({ code: '28000' });
    await expect(reassign(TARGET, OWNER, KEY, A, P1, STAFF, 'GET')).rejects.toMatchObject({ code: '22023' });
    for (const role of ['anon', 'service_role']) {
      await expect(asRole(STAFF, role, tx => tx.query('select public.reassign_inquiry_owner($1,$2,$3,$4,$5,$6)', [A, P1, OWNER, TARGET, KEY, CORRELATION]))).rejects.toMatchObject({ code: '42501' });
    }
    const routine = (await db.query<{ definer: boolean; config: string[] }>(`select p.prosecdef definer,p.proconfig config from pg_proc p where p.oid='public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure`)).rows[0]!;
    expect(routine.definer).toBe(true);
    expect(routine.config).toContain('search_path=""');
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid)','execute') allowed")).rows[0]?.allowed).toBe(true);
  });

  it('rolls back owner and audit changes if the outbox insert fails', async () => {
    await db.exec(`create function private.fail_owner_reassignment_outbox() returns trigger language plpgsql as $$begin raise exception using errcode='P0001',message='synthetic sink failure';end$$;
      create trigger fail_owner_reassignment_outbox before insert on private.outbox_events for each row execute function private.fail_owner_reassignment_outbox();`);
    try { await expect(reassign()).rejects.toMatchObject({ code: 'P0001' }); }
    finally { await db.exec('drop trigger fail_owner_reassignment_outbox on private.outbox_events;drop function private.fail_owner_reassignment_outbox()'); }
    expect((await db.query<{ owner_user_id: string }>('select owner_user_id from public.inquiries where id=$1', [P1])).rows[0]?.owner_user_id).toBe(OWNER);
    expect((await db.query('select * from private.audit_events')).rows).toEqual([]);
    expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);
  });
});
