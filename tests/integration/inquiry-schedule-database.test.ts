import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { InquiryScheduleResultSchema } from '../../packages/contracts/src/inquiry-schedule';
import { A,B,STAFF,PATIENT,P1,P2,P3 } from '../fixtures';
const OTHER='20000000-0000-4000-8000-000000000011';
const input={expected_follow_up_at:'2026-11-01T10:00:00Z',follow_up_at:'2026-11-02T10:00:00.123456Z'};
describe('inquiry schedule SQL owner scope, immutable receipts and atomic persistence',()=>{
 let db:PGlite;
 beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}});
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const name of ['20261026131434_foundation','20261026144919_manual_intake','20261026155853_scheduling_hold','20261026203601_inquiry_schedule']) await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
  expect((await db.query<{enabled:boolean}>('select enabled from private.intake_command_settings')).rows[0]?.enabled).toBe(false);
  await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');insert into auth.users(id) values('${STAFF}'),('${OTHER}'),('${PATIENT}');insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${A}','${STAFF}','reception',true),('${B}','${STAFF}','reception',true),('${A}','${OTHER}','manager',true);`);
 },30000);
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{
  await db.exec(`truncate private.inquiry_schedule_receipts;delete from private.outbox_events;delete from private.audit_events;delete from public.inquiries;update private.intake_command_settings set enabled=true;update public.clinic_memberships set role='reception',active=true where user_id='${STAFF}';insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,source,follow_up_at) values('${P1}','${A}','${STAFF}','Synthetic Contact','private@example.test','phone','2026-11-01T10:00:00Z'),('${P2}','${A}','${STAFF}','Synthetic Other',null,'phone',null),('${P3}','${B}','${STAFF}','Synthetic Foreign',null,'phone',null);`);
 });
 async function asUser<T>(user:string,work:(tx:PGlite)=>Promise<T>,method='POST',privileged=false) {
  return db.transaction(async tx=>{if(!privileged) await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[user,method]);return work(tx as unknown as PGlite);});
 }

 const set=async(payload:unknown=input,key=randomUUID(),id=P1,user=STAFF,clinic=A,privileged=false)=>asUser(user,async tx=>InquiryScheduleResultSchema.parse((await tx.query<{result:unknown}>('select public.set_inquiry_follow_up_schedule($1,$2,$3,$4::jsonb,$5) result',[clinic,id,key,JSON.stringify(payload),randomUUID()])).rows[0]!.result),'POST',privileged);
 it('updates only deadline and atomically emits exact minimal versioned envelope',async()=>{
  const before=(await db.query('select * from public.inquiries where id=$1',[P1])).rows[0] as Record<string,unknown>;
  const result=await set();expect(result).toMatchObject({replayed:false,receipt:{inquiry_id:P1,clinic_id:A,owner_user_id:STAFF,changed:true,event_version:1,follow_up_at:'2026-11-02T10:00:00.123456Z'}});
  const after=(await db.query('select * from public.inquiries where id=$1',[P1])).rows[0] as Record<string,unknown>;delete before.follow_up_at;delete after.follow_up_at;expect(after).toEqual(before);
  const event=(await db.query<{payload:unknown;event_type:string;event_version:number;aggregate_type:string}>('select * from private.outbox_events')).rows[0]!;expect(event).toMatchObject({event_type:'InquiryFollowUpScheduleChanged',event_version:1,aggregate_type:'inquiry'});expect(event.payload).toEqual({previous_follow_up_at:result.receipt.previous_follow_up_at,follow_up_at:result.receipt.follow_up_at,recorded_at:result.receipt.recorded_at});expect(JSON.stringify(event)).not.toContain('private@example.test');expect((await db.query('select count(*)::int n from private.audit_events')).rows).toEqual([{n:1}]);
 });
 it('replays exact normalized input after later changes, conflicts changed keys and stale CAS',async()=>{
  const key=randomUUID(),first=await set(input,key);await set({expected_follow_up_at:input.follow_up_at,follow_up_at:null});
  const replay=await set({expected_follow_up_at:'2026-11-01T11:00:00+01:00',follow_up_at:'2026-11-02T11:00:00.123456+01:00'},key);expect(replay).toEqual({...first,replayed:true});
  await expect(set({...input,follow_up_at:null},key)).rejects.toMatchObject({code:'PT409'});await expect(set()).rejects.toMatchObject({code:'PT409'});expect((await db.query('select count(*)::int n from private.inquiry_schedule_receipts')).rows).toEqual([{n:2}]);
 });
 it('records no-op receipts including null, preserves them immutably and emits no event',async()=>{
  const key=randomUUID();const result=await set({expected_follow_up_at:input.expected_follow_up_at,follow_up_at:'2026-11-01T11:00:00+01:00'},key);expect(result.receipt.changed).toBe(false);expect((await set({expected_follow_up_at:input.expected_follow_up_at,follow_up_at:input.expected_follow_up_at},key)).replayed).toBe(true);expect((await set({expected_follow_up_at:null,follow_up_at:null},randomUUID(),P2)).receipt.changed).toBe(false);
  expect((await db.query('select * from private.outbox_events')).rows).toHaveLength(0);expect((await db.query('select * from private.audit_events')).rows).toHaveLength(0);
  await expect(db.query('update private.inquiry_schedule_receipts set receipt=\'{}\'')).rejects.toMatchObject({code:'55000'});await expect(db.query('delete from private.inquiry_schedule_receipts')).rejects.toMatchObject({code:'55000'});
 });
 it('binds keys to the target and compares expected microseconds exactly',async()=>{
  const key=randomUUID();await set(input,key);
  await expect(set({expected_follow_up_at:'2026-11-02T10:00:00.123455Z',follow_up_at:null})).rejects.toMatchObject({code:'PT409'});
  expect((await set({expected_follow_up_at:null,follow_up_at:null},key,P2)).replayed).toBe(false);
  expect((await db.query('select count(*)::int n from private.inquiry_schedule_receipts')).rows).toEqual([{n:2}]);
 });
 it('rechecks privileged tenant, current owner, role and activation before replay',async()=>{
  const key=randomUUID();await set(input,key);
  for(const id of [P3,randomUUID()])await expect(set(input,key,id,STAFF,A,true)).rejects.toMatchObject({code:'PT404'});
  await expect(set(input,key,P1,OTHER,A,true)).rejects.toMatchObject({code:'PT404'});
  await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[OTHER,P1]);await expect(set(input,key,P1,STAFF,A,true)).rejects.toMatchObject({code:'PT404'});await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[STAFF,P1]);
  for(const role of ['assistant']){await db.query('update public.clinic_memberships set role=$1 where user_id=$2',[role,STAFF]);await expect(set(input,key,P1,STAFF,A,true)).rejects.toMatchObject({code:'42501'});}
  await db.query("update public.clinic_memberships set role='reception',active=false where user_id=$1",[STAFF]);await expect(set(input,key,P1,STAFF,A,true)).rejects.toMatchObject({code:'42501'});await db.query('update public.clinic_memberships set active=true where user_id=$1',[STAFF]);
  await db.exec('update private.intake_command_settings set enabled=false');await expect(set(input,key,P1,STAFF,A,true)).rejects.toMatchObject({code:'PT503'});await expect(set(input,key,P1,'',A,true)).rejects.toMatchObject({code:'28000'});
 });
 it('accepts allowed staff and year boundaries/large offsets, rejecting rounding, zero/overflow years and invalid days',async()=>{
  for(const role of ['reception','manager','dentist']){await db.query('update public.clinic_memberships set role=$1 where user_id=$2',[role,STAFF]);expect((await set({expected_follow_up_at:null,follow_up_at:null},randomUUID(),P2)).receipt.changed).toBe(false);}
  for(const value of ['0001-01-01T00:00:00Z','9999-12-31T23:59:59.999999Z','2026-11-02T23:59:00+23:59','2026-11-02T10:00Z']){const result=await set({expected_follow_up_at:null,follow_up_at:value},randomUUID(),P2);await set({expected_follow_up_at:result.receipt.follow_up_at,follow_up_at:null},randomUUID(),P2);}
  for(const value of ['0000-01-01T00:00:00Z','0001-01-01T00:00:00+01:00','9999-12-31T23:59:59-01:00','2026-01-01T00:00:00.1234567Z','2026-02-30T00:00:00Z','2026-01-01T24:00:00Z'])await expect(set({expected_follow_up_at:null,follow_up_at:value},randomUUID(),P2)).rejects.toMatchObject({code:'22023'});
  for(const payload of [{},null,{...input,extra:true},{...input,follow_up_at:2}])await expect(set(payload)).rejects.toMatchObject({code:'22023'});
 });
 it('rolls back update, receipt and audit when outbox fails, then permits recovery with same key',async()=>{
  const key=randomUUID();await db.exec("create function private.fail_schedule_sink() returns trigger language plpgsql as $$begin raise exception 'synthetic sink failure';end$$;create trigger fail_schedule_sink before insert on private.outbox_events for each row execute function private.fail_schedule_sink();");
  await expect(set(input,key)).rejects.toThrow('synthetic sink failure');expect((await db.query('select * from private.inquiry_schedule_receipts')).rows).toHaveLength(0);expect((await db.query('select * from private.audit_events')).rows).toHaveLength(0);expect((await db.query<{unchanged:boolean}>('select follow_up_at=$1::timestamptz unchanged from public.inquiries where id=$2',[input.expected_follow_up_at,P1])).rows[0]?.unchanged).toBe(true);
  await db.exec('drop trigger fail_schedule_sink on private.outbox_events;drop function private.fail_schedule_sink();');expect((await set(input,key)).replayed).toBe(false);
 });
 it('denies direct tables, anonymous execution and GET transport; UTC normalization survives session timezone',async()=>{
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.set_inquiry_follow_up_schedule(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') allowed")).rows[0]?.allowed).toBe(false);
  await expect(asUser(STAFF,tx=>tx.query('select * from private.inquiry_schedule_receipts'))).rejects.toMatchObject({code:'42501'});
  await expect(asUser(STAFF,tx=>tx.query('select public.set_inquiry_follow_up_schedule($1,$2,$3,$4::jsonb,$5)',[A,P1,randomUUID(),JSON.stringify(input),randomUUID()]),'GET')).rejects.toMatchObject({code:'22023'});
  const key=randomUUID(),first=await set(input,key);await db.exec("set timezone='Pacific/Auckland'");expect(await set(input,key)).toEqual({...first,replayed:true});await db.exec("set timezone='UTC'");
 });
});
