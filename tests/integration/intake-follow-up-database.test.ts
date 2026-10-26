import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { FollowUpListSchema,FollowUpRecordedSchema } from '../../packages/contracts/src/intake-follow-up';
import { A,B,STAFF,PATIENT,P1,P2,P3 } from '../fixtures';
const OTHER='20000000-0000-4000-8000-000000000011';
const input={kind:'contact_attempt',channel:'phone'};
describe('follow-up SQL owner scope, immutable receipts and atomic persistence',()=>{
 let db:PGlite;
 beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}});
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const name of ['20261026131434_foundation','20261026144919_manual_intake','20261026155853_scheduling_hold','20261026181112_inquiry_follow_up']) await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
  expect((await db.query<{enabled:boolean}>('select enabled from private.intake_command_settings')).rows[0]?.enabled).toBe(false);
  await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');insert into auth.users(id) values('${STAFF}'),('${OTHER}'),('${PATIENT}');insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${A}','${STAFF}','reception',true),('${B}','${STAFF}','reception',true),('${A}','${OTHER}','manager',true);`);
 },30000);
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{
  await db.exec(`truncate private.inquiry_follow_ups,private.inquiry_follow_up_idempotency;delete from private.outbox_events;delete from private.audit_events;delete from public.inquiries;update private.intake_command_settings set enabled=true;update public.clinic_memberships set role='reception',active=true where user_id='${STAFF}';insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,source,follow_up_at) values('${P1}','${A}','${STAFF}','Synthetic Contact','private@example.test','phone','2026-11-01T10:00:00Z'),('${P2}','${A}','${STAFF}','Synthetic Other',null,'phone',null),('${P3}','${B}','${STAFF}','Synthetic Foreign',null,'phone',null);`);
 });
 async function asUser<T>(user:string,work:(tx:PGlite)=>Promise<T>,method='POST',privileged=false) {
  return db.transaction(async tx=>{if(!privileged) await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[user,method]);return work(tx as unknown as PGlite);});
 }
 const record=async(payload:unknown=input,key=randomUUID(),id=P1,user=STAFF,clinic=A,privileged=false)=>asUser(user,async tx=>FollowUpRecordedSchema.parse((await tx.query<{result:unknown}>('select public.record_inquiry_follow_up($1,$2,$3,$4::jsonb,$5) result',[clinic,id,key,JSON.stringify(payload),randomUUID()])).rows[0]!.result),'POST',privileged);
 const list=async(id=P1,user=STAFF,clinic=A,privileged=false)=>asUser(user,async tx=>FollowUpListSchema.parse((await tx.query<{result:unknown}>('select public.list_inquiry_follow_ups($1,$2) result',[clinic,id])).rows[0]!.result),'POST',privileged);
 it('writes only attestations and minimal atomic events, leaving the inquiry unchanged',async()=>{
  const before=(await db.query('select * from public.inquiries where id=$1',[P1])).rows[0];
  const result=await record();expect(result.item).toMatchObject({clinic_id:A,inquiry_id:P1,actor_user_id:STAFF,...input,event_version:1});expect(result.replayed).toBe(false);
  expect((await db.query('select * from public.inquiries where id=$1',[P1])).rows[0]).toEqual(before);
  const event=(await db.query<{payload:Record<string,unknown>;event_type:string;aggregate_type:string;aggregate_id:string}>('select * from private.outbox_events')).rows[0]!;
  expect(event).toMatchObject({event_type:'InquiryFollowUpRecorded',aggregate_type:'inquiry',aggregate_id:P1});expect(Object.keys(event.payload).sort()).toEqual(['channel','follow_up_id','inquiry_id','kind','recorded_at']);
  expect(JSON.stringify(event)).not.toContain('private@example.test');expect((await db.query('select * from private.audit_events')).rows).toHaveLength(1);
 });
 it('requires the database command gate but permits authorized history when disabled',async()=>{
  await db.exec('update private.intake_command_settings set enabled=false');await expect(record()).rejects.toMatchObject({code:'PT503'});expect(await list()).toEqual({items:[],truncated:false});
 });
 it('accepts owner reception, manager and dentist; denies assistant, inactive, patient-only and missing subjects',async()=>{
  for(const role of ['reception','manager','dentist']) {await db.query('update public.clinic_memberships set role=$1 where clinic_id=$2 and user_id=$3',[role,A,STAFF]);await record();}
  await db.query("update public.clinic_memberships set role='assistant' where clinic_id=$1 and user_id=$2",[A,STAFF]);await expect(record()).rejects.toMatchObject({code:'42501'});await expect(list()).rejects.toMatchObject({code:'42501'});
  await db.query("update public.clinic_memberships set role='reception',active=false where clinic_id=$1 and user_id=$2",[A,STAFF]);await expect(record()).rejects.toMatchObject({code:'42501'});
  await expect(record(input,randomUUID(),P1,PATIENT)).rejects.toMatchObject({code:'42501'});await expect(record(input,randomUUID(),P1,'')).rejects.toMatchObject({code:'28000'});
 });
 it('does not reveal foreign/absent inquiry and denies another owner even on privileged paths',async()=>{
  for(const privileged of [false,true]) {
   await expect(record(input,randomUUID(),P1,OTHER,A,privileged)).rejects.toMatchObject({code:'42501'});await expect(list(P1,OTHER,A,privileged)).rejects.toMatchObject({code:'42501'});
   for(const id of [P3,randomUUID()]) {await expect(record(input,randomUUID(),id,STAFF,A,privileged)).rejects.toMatchObject({code:'PT404'});await expect(list(id,STAFF,A,privileged)).rejects.toMatchObject({code:'PT404'});}
  }
 });
 it('replays immutable receipts, scopes keys by inquiry, and rechecks ownership and revocation before replay',async()=>{
  const key=randomUUID(),first=await record(input,key);
  await db.query("update public.inquiries set display_name='Synthetic Changed',follow_up_at=null where id=$1",[P1]);expect(await record(input,key)).toEqual({...first,replayed:true});
  await expect(record({...input,channel:'email'},key)).rejects.toMatchObject({code:'PT409'});expect((await record(input,key,P2)).replayed).toBe(false);
  await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[OTHER,P1]);
  await expect(record(input,key)).rejects.toMatchObject({code:'42501'});await expect(list()).rejects.toMatchObject({code:'42501'});
  expect((await list(P1,OTHER)).items).toHaveLength(1);
  await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[STAFF,P1]);await db.query('update public.clinic_memberships set active=false where user_id=$1',[STAFF]);await expect(record(input,key)).rejects.toMatchObject({code:'42501'});
 });
 it('independently rejects unsupported/extra fields and GET transport',async()=>{
  for(const body of [null,[],{}, {...input,note:'secret'}, {...input,inquiry_id:P2},{...input,recorded_at:'2020-01-01T00:00:00Z'},{...input,kind:' contact_attempt'},{...input,channel:'whatsapp'},{...input,channel:null}]) await expect(record(body)).rejects.toMatchObject({code:'22023'});
  await expect(asUser(STAFF,tx=>tx.query('select public.list_inquiry_follow_ups($1,$2)',[A,P1]),'GET')).rejects.toMatchObject({code:'22023'});
 });
 it('denies direct client reads/writes and rejects privileged edits/deletes as append-only',async()=>{
  await record();for(const sql of ['select * from private.inquiry_follow_ups','delete from private.inquiry_follow_ups',"update private.inquiry_follow_ups set channel='email'","insert into private.inquiry_follow_up_idempotency default values"]) await expect(asUser(STAFF,tx=>tx.exec(sql))).rejects.toMatchObject({code:'42501'});
  await expect(db.exec("update private.inquiry_follow_ups set channel='email'")).rejects.toMatchObject({code:'55000'});await expect(db.exec('delete from private.inquiry_follow_ups')).rejects.toMatchObject({code:'55000'});
 });
 it('returns newest50 with deterministic UUID tie ordering and truthful truncation',async()=>{
  await db.query("insert into private.inquiry_follow_ups(id,clinic_id,inquiry_id,actor_user_id,kind,channel,recorded_at) select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,$3,'contact_attempt','phone','2026-11-01T00:00:00Z' from generate_series(1,51)n",[A,P1,STAFF]);
  const result=await list();expect(result.items).toHaveLength(50);expect(result.truncated).toBe(true);expect(result.items[0]?.id).toBe('40000000-0000-4000-8000-000000000051');expect(result.items[49]?.id).toBe('40000000-0000-4000-8000-000000000002');
 });
 it.each(['audit_events','outbox_events','inquiry_follow_up_idempotency'])('rolls back the record and all effects if %s fails',async table=>{
  await db.exec(`create function private.reject_follow_up_test() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;create trigger reject_follow_up_test before insert on private.${table} for each row execute function private.reject_follow_up_test()`);
  try {await expect(record()).rejects.toMatchObject({code:'P0001'});for(const name of ['inquiry_follow_ups','audit_events','outbox_events','inquiry_follow_up_idempotency']) expect((await db.query(`select * from private.${name}`)).rows).toHaveLength(0);}
  finally {await db.exec(`drop trigger reject_follow_up_test on private.${table};drop function private.reject_follow_up_test()`);}
 });
});
