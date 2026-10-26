import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CreateInquirySchema, InquiryCreatedSchema, InquiryListSchema } from '../../packages/contracts/src/intake';
import { A, B, STAFF, PATIENT, P1, P2, P3 } from '../fixtures';

const migration='supabase/migrations/20261026144919_manual_intake.sql';
const input={display_name:'  Synthetic Inquiry  ',contact_email:'Synthetic@example.test',contact_phone:' +212 600-000-000 ',source:'phone',follow_up_at:'2026-11-01T10:00:00+01:00'};
const MANAGER='20000000-0000-4000-8000-000000000011';
const DENTIST='20000000-0000-4000-8000-000000000012';
const ASSISTANT='20000000-0000-4000-8000-000000000013';
const INACTIVE='20000000-0000-4000-8000-000000000014';
describe('manual intake SQL authorization and atomic commands (embedded PostgreSQL)',()=>{
  let db:PGlite;
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(readFileSync('supabase/migrations/20261026131434_foundation.sql','utf8'));
    await db.exec(readFileSync(migration,'utf8'));
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users(id) values('${STAFF}'),('${PATIENT}'),('${MANAGER}'),('${DENTIST}'),('${ASSISTANT}'),('${INACTIVE}');
      insert into public.clinic_memberships(clinic_id,user_id,role,active) values
      ('${A}','${STAFF}','reception',true),('${B}','${STAFF}','reception',true),('${A}','${MANAGER}','manager',true),('${A}','${DENTIST}','dentist',true),('${A}','${ASSISTANT}','assistant',true),('${A}','${INACTIVE}','reception',false);`);
  },30000);
  afterAll(async()=>{await db?.close();});
  beforeEach(async()=>{
    await db.exec(`delete from private.intake_idempotency; delete from private.outbox_events; delete from private.audit_events; delete from public.inquiries;
      update private.intake_command_settings set enabled=true; update public.clinic_memberships set active=true where user_id='${STAFF}';`);
  });
  async function asUser<T>(user:string,work:(tx:PGlite)=>Promise<T>,role='authenticated') {
    return db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
      return work(tx as unknown as PGlite);
    });
  }
  async function create(user=STAFF,key:string=randomUUID(),payload:unknown=input,clinic=A){
    return asUser(user,async tx=>(await tx.query<{result:unknown}>('select public.create_inquiry($1,$2,$3::jsonb,$4) result',[clinic,key,JSON.stringify(payload),P3])).rows[0]!.result);
  }
  it('database activation defaults off and cannot be enabled by a browser actor',async()=>{
    const isolated=new PGlite();
    try {
      await isolated.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$; create schema storage; create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
      await isolated.exec(readFileSync('supabase/migrations/20261026131434_foundation.sql','utf8')); await isolated.exec(readFileSync(migration,'utf8'));
      expect((await isolated.query<{enabled:boolean}>('select enabled from private.intake_command_settings')).rows[0]?.enabled).toBe(false);
    } finally {await isolated.close();}
    await db.exec('update private.intake_command_settings set enabled=false');
    await expect(create()).rejects.toMatchObject({code:'PT503'});
    await expect(asUser(STAFF,tx=>tx.exec('update private.intake_command_settings set enabled=true'))).rejects.toMatchObject({code:'42501'});
  });
  it('creates normalized inquiry and minimal audit/outbox in one transaction',async()=>{
    const result=InquiryCreatedSchema.parse(await create());
    expect(result.replayed).toBe(false); expect(result.item.owner_user_id).toBe(STAFF); expect(result.item.status).toBe('new');
    expect(result.item.display_name).toBe('Synthetic Inquiry'); expect(result.item.contact_email).toBe(input.contact_email); expect(result.item.contact_phone).toBe('+212 600-000-000');
    expect(new Date(result.item.follow_up_at!).toISOString()).toBe('2026-11-01T09:00:00.000Z');
    const audit=(await db.query('select * from private.audit_events')).rows;
    const outbox=(await db.query('select * from private.outbox_events')).rows;
    expect(audit).toHaveLength(1); expect(outbox).toHaveLength(1);
    expect(JSON.stringify([...audit,...outbox])).not.toContain('Synthetic Inquiry'); expect(JSON.stringify([...audit,...outbox])).not.toContain(input.contact_email);
    expect(outbox[0]).toMatchObject({clinic_id:A,aggregate_id:result.item.id,event_type:'InquiryCreated',event_version:1,actor_ref:STAFF});
  });
  it('allows only active reception, manager and dentist, including direct RPC calls',async()=>{
    for(const user of [STAFF,MANAGER,DENTIST]) expect(InquiryCreatedSchema.parse(await create(user)).item.owner_user_id).toBe(user);
    for(const user of [PATIENT,ASSISTANT,INACTIVE]) {
      await expect(create(user)).rejects.toMatchObject({code:'42501'});
      await expect(asUser(user,tx=>tx.query('select public.list_inquiries($1)',[A]))).rejects.toMatchObject({code:'42501'});
      expect((await asUser(user,tx=>tx.query('select * from public.inquiries'))).rows).toHaveLength(0);
    }
    await expect(create('')).rejects.toMatchObject({code:'28000'});
    await expect(asUser('',tx=>tx.query('select public.list_inquiries($1)',[A]),'anon')).rejects.toMatchObject({code:'42501'});
  });
  it('denies direct writes, foreign tenant selection and revoked membership',async()=>{
    await create();
    await expect(asUser(STAFF,tx=>tx.exec("update public.inquiries set display_name='changed'"))).rejects.toMatchObject({code:'42501'});
    await expect(create(MANAGER,randomUUID(),input,B)).rejects.toMatchObject({code:'42501'});
    await expect(asUser(MANAGER,tx=>tx.query('select public.list_inquiries($1)',[B]))).rejects.toMatchObject({code:'42501'});
    await db.exec(`update public.clinic_memberships set active=false where user_id='${STAFF}'`);
    expect((await asUser(STAFF,tx=>tx.query('select * from public.inquiries'))).rows).toHaveLength(0);
    await expect(create()).rejects.toMatchObject({code:'42501'});
  });
  it('enforces strict input even when bypassing HTTP validation',async()=>{
    for(const payload of [null,[],{}, {...input,owner_user_id:MANAGER},{...input,status:'confirmed'},{...input,display_name:'   '},{...input,contact_phone:'<script>'},{...input,contact_email:' A@example.test'},{...input,source:'integration'},{...input,follow_up_at:'2026-02-30T09:00:00Z'},{...input,follow_up_at:'2026-11-01T24:00:00Z'},{...input,follow_up_at:'2026-11-01T09:00Z'},{...input,follow_up_at:'9999-12-31T23:00:00-02:00'},{...input,follow_up_at:'0001-01-01T00:00:00+02:00'}]) {
      await expect(create(STAFF,randomUUID(),payload)).rejects.toMatchObject({code:'22023'});
    }
    expect((await db.query('select * from public.inquiries')).rows).toHaveLength(0);
    expect((await db.query('select * from private.intake_idempotency')).rows).toHaveLength(0);
  });
  it('matches contract email validation on representative direct RPC values',async()=>{
    for(const email of ["a'b@example.test","a'@example.test",'a..b@example.test','a@domain-.test','a@-domain.test','a@example.test','A+tag@example.test','a@a.b.test','a@example.test\n']) {
      const payload={...input,contact_email:email};
      if(CreateInquirySchema.safeParse(payload).success) await expect(create(STAFF,randomUUID(),payload)).resolves.toBeDefined();
      else await expect(create(STAFF,randomUUID(),payload)).rejects.toMatchObject({code:'22023'});
    }
  });
  it('returns original result for canonical replay; conflict cannot add side effects',async()=>{
    const first=InquiryCreatedSchema.parse(await create(STAFF,P1));
    await db.exec("set timezone='Pacific/Auckland'");
    const replay=InquiryCreatedSchema.parse(await create(STAFF,P1,{...input,display_name:'Synthetic Inquiry',contact_phone:'+212 600-000-000',follow_up_at:'2026-11-01T09:00:00Z'}));
    expect(replay).toEqual({...first,replayed:true});
    await db.exec("set timezone='UTC'");
    await expect(create(STAFF,P1,{...input,source:'email'})).rejects.toMatchObject({code:'PT409'});
    for(const table of ['public.inquiries','private.intake_idempotency','private.audit_events','private.outbox_events']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(1);
  });
  it('uses codepoint name limits and JS whitespace trimming for direct RPC parity',async()=>{
    const accepted={...input,display_name:'😀'.repeat(120)};
    const rejected={...input,display_name:'😀'.repeat(121)};
    expect(CreateInquirySchema.safeParse(accepted).success).toBe(true);expect(CreateInquirySchema.safeParse(rejected).success).toBe(false);
    expect(InquiryCreatedSchema.parse(await create(STAFF,randomUUID(),accepted)).item.display_name).toBe(accepted.display_name);
    await expect(create(STAFF,randomUUID(),rejected)).rejects.toMatchObject({code:'22023'});
    expect(InquiryCreatedSchema.parse(await create(STAFF,randomUUID(),{...input,display_name:'\v\u00a0Victor\uFEFF'})).item.display_name).toBe('Victor');
  });
  it('scopes uniqueness by actor and clinic under queued concurrent calls',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>create(STAFF,P1)));
    expect(results.map(r=>InquiryCreatedSchema.parse(r)).filter(r=>!r.replayed)).toHaveLength(1);
    await create(STAFF,P1,input,B); await create(MANAGER,P1);
    expect((await db.query('select * from public.inquiries')).rows).toHaveLength(3);
    expect((await db.query('select * from private.audit_events')).rows).toHaveLength(3);
    // PGlite queues transactions. Real multi-connection contention remains a release gate.
  });
  it('rolls back inquiry/idempotency/audit when outbox insertion fails',async()=>{
    await db.exec(`create function private.fail_intake_test() returns trigger language plpgsql as $$begin raise exception 'synthetic failure'; end$$;
      create trigger test_fail_outbox before insert on private.outbox_events for each row execute function private.fail_intake_test();`);
    try {await expect(create()).rejects.toThrow('synthetic failure');}
    finally {await db.exec('drop trigger test_fail_outbox on private.outbox_events; drop function private.fail_intake_test()');}
    for(const table of ['public.inquiries','private.intake_idempotency','private.audit_events','private.outbox_events']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  });
  it('returns at most 100 in deterministic order and exposes truncation without foreign rows',async()=>{
    await db.query(`insert into public.inquiries(clinic_id,owner_user_id,display_name,source,created_at) select $1,$2,'Synthetic '||n,'phone',timestamp '2026-10-01'+n*interval '1 minute' from generate_series(1,102) n`,[A,STAFF]);
    await create(STAFF,P2,input,B);
    const listed=InquiryListSchema.parse((await asUser(MANAGER,tx=>tx.query<{result:unknown}>('select public.list_inquiries($1) result',[A]))).rows[0]?.result);
    expect(listed.truncated).toBe(true); expect(listed.items).toHaveLength(100);
    expect(listed.items[0]?.display_name).toBe('Synthetic 102'); expect(listed.items[99]?.display_name).toBe('Synthetic 3');
    expect(listed.items.every(item=>item.clinic_id===A)).toBe(true);
    expect((await asUser(MANAGER,tx=>tx.query('select * from public.inquiries where clinic_id=$1',[B]))).rows).toHaveLength(0);
  });
});
