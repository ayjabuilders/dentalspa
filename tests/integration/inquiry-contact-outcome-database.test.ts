import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { InquiryContactOutcomeListSchema,InquiryContactOutcomeRecordedSchema } from '../../packages/contracts/src/inquiry-contact-outcome';
import { A,B,STAFF,PATIENT,P1,P2,P3 } from '../fixtures';

const OTHER='20000000-0000-4000-8000-000000000011';
const KEY='50000000-0000-4000-8000-000000000011';
const CORRELATION='50000000-0000-4000-8000-000000000012';
const input={outcome:'reached'};

describe('inquiry contact outcome SQL tenant scope, default-off setting and append-only history',()=>{
  let db:PGlite;
  beforeAll(async()=>{
    db=new PGlite({extensions:{btree_gist}});
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for(const migration of ['20261026131434_foundation.sql','20261026144919_manual_intake.sql','20261026155853_scheduling_hold.sql','20261029120000_inquiry_contact_outcomes.sql']){
      await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
    }
    expect((await db.query<{enabled:boolean}>('select enabled from private.inquiry_contact_outcome_settings')).rows[0]?.enabled).toBe(false);
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users(id) values('${STAFF}'),('${OTHER}'),('${PATIENT}');
      insert into public.clinic_memberships(clinic_id,user_id,role,active) values
        ('${A}','${STAFF}','reception',true),('${A}','${OTHER}','manager',true);`);
  },30000);
  afterAll(async()=>{await db?.close();});
  beforeEach(async()=>{
    await db.exec(`truncate private.inquiry_contact_outcomes,private.inquiry_contact_outcome_idempotency;
      delete from private.outbox_events;delete from private.audit_events;delete from public.inquiries;
      update private.inquiry_contact_outcome_settings set enabled=false where singleton;
      update public.clinic_memberships set role='reception',active=true where clinic_id='${A}' and user_id='${STAFF}';
      insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,source,follow_up_at) values
        ('${P1}','${A}','${STAFF}','Synthetic Contact','private@example.test','phone','2026-11-01T10:00:00Z'),
        ('${P2}','${A}','${OTHER}','Synthetic Other',null,'phone',null),
        ('${P3}','${B}','${STAFF}','Synthetic Foreign',null,'phone',null);`);
  });
  async function asUser<T>(user:string,work:(tx:PGlite)=>Promise<T>,method='POST',privileged=false){
    return db.transaction(async tx=>{if(!privileged) await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[user,method]);return work(tx as unknown as PGlite);});
  }
  const enable=()=>db.exec('update private.inquiry_contact_outcome_settings set enabled=true where singleton');
  const record=async(payload:unknown=input,key=randomUUID(),id=P1,user=STAFF,clinic=A,privileged=false)=>asUser(user,async tx=>InquiryContactOutcomeRecordedSchema.parse((await tx.query<{result:unknown}>(
    'select public.record_inquiry_contact_outcome($1,$2,$3,$4::jsonb,$5) result',[clinic,id,key,JSON.stringify(payload),CORRELATION])).rows[0]!.result),'POST',privileged);
  const list=async(id=P1,user=STAFF,clinic=A,privileged=false)=>asUser(user,async tx=>InquiryContactOutcomeListSchema.parse((await tx.query<{result:unknown}>(
    'select public.list_inquiry_contact_outcomes($1,$2) result',[clinic,id])).rows[0]!.result),'POST',privileged);

  it('keeps both list and write RPCs closed by default without creating data',async()=>{
    await expect(record()).rejects.toMatchObject({code:'PT503'});
    await expect(list()).rejects.toMatchObject({code:'PT503'});
    expect((await db.query('select * from private.inquiry_contact_outcomes')).rows).toEqual([]);
    expect((await db.query('select * from private.inquiry_contact_outcome_idempotency')).rows).toEqual([]);
  });

  it('records exact factual events and minimal audit/outbox atomically without changing the inquiry',async()=>{
    await enable();const before=(await db.query('select * from public.inquiries where id=$1',[P1])).rows[0];
    const result=await record();expect(result).toMatchObject({item:{clinic_id:A,inquiry_id:P1,outcome:'reached',event_version:1},replayed:false});
    expect((await db.query('select * from public.inquiries where id=$1',[P1])).rows[0]).toEqual(before);
    expect((await db.query('select * from private.inquiry_contact_outcomes')).rows).toHaveLength(1);
    expect((await db.query('select * from private.audit_events')).rows).toHaveLength(1);
    const event=(await db.query<{event_type:string;aggregate_type:string;aggregate_id:string;payload:Record<string,unknown>}>('select * from private.outbox_events')).rows[0]!;
    expect(event).toMatchObject({event_type:'InquiryContactOutcomeRecorded',aggregate_type:'inquiry',aggregate_id:P1});
    expect(Object.keys(event.payload).sort()).toEqual(['contact_outcome_id','outcome','recorded_at']);
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|Synthetic Contact|patient_id|diagnosis|note/i);
  });

  it('uses exact idempotent retries while allowing repeated outcome events with new keys',async()=>{
    await enable();const first=await record(input,KEY);expect(first.replayed).toBe(false);
    expect(await record(input,KEY)).toEqual({...first,replayed:true});
    await expect(record({outcome:'declined'},KEY)).rejects.toMatchObject({code:'PT409'});
    expect((await record(input,'50000000-0000-4000-8000-000000000013')).replayed).toBe(false);
    expect((await list()).items).toHaveLength(2);
  });

  it('enforces active same-clinic roles and current owner before read or write',async()=>{
    await enable();
    for(const role of ['reception','manager','dentist']){await db.query('update public.clinic_memberships set role=$1 where clinic_id=$2 and user_id=$3',[role,A,STAFF]);expect((await record()).replayed).toBe(false);}
    await db.query("update public.clinic_memberships set role='assistant' where clinic_id=$1 and user_id=$2",[A,STAFF]);
    await expect(record()).rejects.toMatchObject({code:'42501'});await expect(list()).rejects.toMatchObject({code:'42501'});
    await db.query("update public.clinic_memberships set role='reception',active=false where clinic_id=$1 and user_id=$2",[A,STAFF]);
    await expect(record()).rejects.toMatchObject({code:'42501'});
    await db.query("update public.clinic_memberships set active=true,role='reception' where clinic_id=$1 and user_id=$2",[A,STAFF]);
    await expect(record(input,randomUUID(),P2)).rejects.toMatchObject({code:'42501'});
    await expect(list(P2)).rejects.toMatchObject({code:'42501'});
  });

  it('conceals foreign-tenant and absent inquiry identifiers and does not trust the clinic argument',async()=>{
    await enable();
    await expect(record(input,randomUUID(),P3,STAFF,A)).rejects.toMatchObject({code:'PT404'});
    await expect(list(P3,STAFF,A)).rejects.toMatchObject({code:'PT404'});
    await expect(record(input,randomUUID(),P1,OTHER,A)).rejects.toMatchObject({code:'42501'});
    await expect(list(P1,OTHER,A)).rejects.toMatchObject({code:'42501'});
    await expect(record(input,randomUUID(),P1,STAFF,B)).rejects.toMatchObject({code:'42501'});
    await expect(list(P1,STAFF,B)).rejects.toMatchObject({code:'42501'});
    for(const privileged of [false,true]){
      await expect(record(input,randomUUID(),randomUUID(),STAFF,A,privileged)).rejects.toMatchObject({code:'PT404'});
      await expect(list(randomUUID(),STAFF,A,privileged)).rejects.toMatchObject({code:'PT404'});
    }
  });

  it('rejects no-attempt persistence, extra fields, noncanonical outcomes and non-POST transport',async()=>{
    await enable();
    for(const payload of [null,[],{}, {outcome:'no_attempt'}, {outcome:'attempted_no_answer',note:'secret'}, {outcome:' reached'}, {outcome:null}])
      await expect(record(payload)).rejects.toMatchObject({code:'22023'});
    await expect(asUser(STAFF,tx=>tx.query('select public.list_inquiry_contact_outcomes($1,$2)',[A,P1]),'GET')).rejects.toMatchObject({code:'22023'});
  });

  it('keeps private tables inaccessible and event rows immutable',async()=>{
    await enable();await record();
    for(const sql of ['select * from private.inquiry_contact_outcomes','delete from private.inquiry_contact_outcomes',"update private.inquiry_contact_outcomes set outcome='declined'",'insert into private.inquiry_contact_outcome_idempotency default values'])
      await expect(asUser(STAFF,tx=>tx.exec(sql))).rejects.toMatchObject({code:'42501'});
    await expect(db.exec("update private.inquiry_contact_outcomes set outcome='declined'")).rejects.toMatchObject({code:'55000'});
    await expect(db.exec('delete from private.inquiry_contact_outcomes')).rejects.toMatchObject({code:'55000'});
  });

  it('returns only the newest 50 records with explicit truncation and deterministic order',async()=>{
    await enable();
    await db.query(`insert into private.inquiry_contact_outcomes(id,clinic_id,inquiry_id,actor_user_id,outcome,recorded_at)
      select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,$3,'reached','2026-11-01T00:00:00Z' from generate_series(1,51)n`,[A,P1,STAFF]);
    const result=await list();expect(result.items).toHaveLength(50);expect(result.truncated).toBe(true);
    expect(result.items[0]?.id).toBe('40000000-0000-4000-8000-000000000051');
    expect(result.items[49]?.id).toBe('40000000-0000-4000-8000-000000000002');
  });

  it.each(['audit_events','outbox_events','inquiry_contact_outcome_idempotency'])('rolls back all contact outcome writes if %s fails',async table=>{
    await enable();
    await db.exec(`create function private.reject_contact_outcome_test() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;
      create trigger reject_contact_outcome_test before insert on private.${table} for each row execute function private.reject_contact_outcome_test()`);
    try{
      await expect(record()).rejects.toMatchObject({code:'P0001'});
      for(const name of ['inquiry_contact_outcomes','audit_events','outbox_events','inquiry_contact_outcome_idempotency'])
        expect((await db.query(`select * from private.${name}`)).rows).toHaveLength(0);
    }finally{await db.exec(`drop trigger reject_contact_outcome_test on private.${table};drop function private.reject_contact_outcome_test()`);}
  });
});
