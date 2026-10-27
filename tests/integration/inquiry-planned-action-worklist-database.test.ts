import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';

import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { InquiryPlannedActionWorklistSchema } from '../../packages/contracts/src/inquiry-planned-action-worklist';
import { A,B,STAFF,PATIENT,P1,P2,P3 } from '../fixtures';
const OTHER='20000000-0000-4000-8000-000000000011';

describe('planned action SQL authority, revisions and atomicity',()=>{
 let db:PGlite;
 beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}});
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const name of ['20261026131434_foundation','20261026144919_manual_intake','20261026155853_scheduling_hold','20261026222243_inquiry_contact_preference','20261026230716_inquiry_communication_language','20261026233457_inquiry_communication_time_zone','20261026181112_inquiry_follow_up','20261027000249_inquiry_planned_action','20261027010818_inquiry_planned_action_worklist']) await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
  expect((await db.query<{enabled:boolean}>('select enabled from private.intake_command_settings')).rows[0]?.enabled).toBe(false);
  await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');insert into auth.users(id) values('${STAFF}'),('${OTHER}'),('${PATIENT}');insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${A}','${STAFF}','reception',true),('${B}','${STAFF}','reception',true),('${A}','${OTHER}','manager',true);`);
 },30000);
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{
  await db.exec(`truncate private.inquiry_follow_up_idempotency,private.inquiry_follow_ups,private.inquiry_communication_time_zone_receipts,private.inquiry_communication_time_zones,private.inquiry_communication_language_receipts,private.inquiry_communication_languages,private.inquiry_contact_preference_receipts,private.inquiry_contact_preferences,private.inquiry_planned_action_receipts,private.inquiry_planned_actions;delete from private.outbox_events;delete from private.audit_events;delete from public.inquiries;update private.intake_command_settings set enabled=false;update public.clinic_memberships set role='reception',active=true where user_id='${STAFF}';insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,source,follow_up_at) values('${P1}','${A}','${STAFF}','Synthetic Contact','private@example.test','phone','2026-11-01T10:00:00Z'),('${P2}','${A}','${STAFF}','Synthetic Other',null,'phone',null),('${P3}','${B}','${STAFF}','Synthetic Foreign',null,'phone',null);`);
 });
 async function asUser<T>(user:string,work:(tx:PGlite)=>Promise<T>,method='POST',privileged=false) {
  return db.transaction(async tx=>{if(!privileged) await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[user,method]);return work(tx as unknown as PGlite);});
 }


 const list=(user=STAFF,clinic=A,privileged=false,method='POST')=>asUser(user,async tx=>InquiryPlannedActionWorklistSchema.parse((await tx.query<{result:unknown}>('select public.inquiry_owner_planned_actions($1) result',[clinic])).rows[0]!.result),method,privileged);
 async function plan(id=P1,clinic=A,value:string|null='review_inquiry',at='2026-10-27T00:00:00.000001Z'){await db.query('insert into private.inquiry_planned_actions(clinic_id,inquiry_id,planned_action,revision,updated_at) values($1,$2,$3,1,$4)',[clinic,id,value,at]);}
 it('reads empty or minimal scoped projection with DB writes disabled and no effects',async()=>{
  expect((await list()).items).toEqual([]);await plan();
  const before=await db.query('select * from public.inquiries order by id');
  const result=await list();expect(result).toMatchObject({schema_version:1,clinic_id:A,owner_user_id:STAFF,truncated:false});
  expect(result.items).toEqual([{inquiry_id:P1,display_name:'Synthetic Contact',planned_action:'review_inquiry',vocabulary_version:1,revision:1,updated_at:'2026-10-27T00:00:00.000001Z'}]);
  expect((await db.query('select * from public.inquiries order by id')).rows).toEqual(before.rows);
  for(const table of ['inquiry_planned_action_receipts','audit_events','outbox_events'])expect((await db.query('select count(*)::int n from private.'+table)).rows).toEqual([{n:0}]);
 });
 it('filters null, foreign and other/former owners through privileged SQL',async()=>{
  await plan();await plan(P2,A,null);await plan(P3,B);
  expect((await list(STAFF,A,true)).items.map(x=>x.inquiry_id)).toEqual([P1]);
  expect((await list(OTHER,A,true)).items).toEqual([]);
  await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[OTHER,P1]);
  expect((await list(STAFF,A,true)).items).toEqual([]);
  const current=await list(OTHER,A,true);expect(current.owner_user_id).toBe(OTHER);expect(current.items[0]?.inquiry_id).toBe(P1);
  expect(JSON.stringify(current)).not.toContain(STAFF);await expect(list(OTHER,B,true)).rejects.toMatchObject({code:'42501'});
 });
 it('permits exactly active intake roles and denies privileged anonymous/patient/assistant/inactive',async()=>{
  for(const role of ['reception','manager','dentist']){await db.query('update public.clinic_memberships set role=$1 where user_id=$2',[role,STAFF]);await list();}
  await db.query("update public.clinic_memberships set role='assistant' where user_id=$1",[STAFF]);await expect(list(STAFF,A,true)).rejects.toMatchObject({code:'42501'});
  await db.query("update public.clinic_memberships set role='reception',active=false where user_id=$1",[STAFF]);await expect(list(STAFF,A,true)).rejects.toMatchObject({code:'42501'});
  await expect(list(PATIENT,A,true)).rejects.toMatchObject({code:'42501'});await expect(list('',A,true)).rejects.toMatchObject({code:'28000'});
 });
 it('preserves microseconds, native UUID tie-break and UTC under different session timezone',async()=>{
  await plan(P1,A,'review_inquiry','2026-10-27T01:00:00.000001+01:00');await plan(P2,A,'review_follow_up','2026-10-27T00:00:00.000002Z');
  await db.exec("set timezone='Pacific/Auckland'");expect((await list()).items.map(x=>x.inquiry_id)).toEqual([P2,P1]);
  await db.exec("update private.inquiry_planned_actions set updated_at='2026-10-27T00:00:00.000002Z'");expect((await list()).items.map(x=>x.inquiry_id)).toEqual([P2,P1]);await db.exec("set timezone='UTC'");
 });
 it('filters before the 51-row limit and returns exact 50/51 truncation',async()=>{
  for(let index=1;index<=55;index++){
   const id='40000000-0000-4000-8000-'+String(index).padStart(12,'0');
   await db.query("insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source) values($1,$2,$3,'Synthetic bounded','phone')",[id,A,STAFF]);await plan(id);
  }
  for(let index=1;index<=55;index++){
   const id='50000000-0000-4000-8000-'+String(index).padStart(12,'0');
   await db.query("insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source) values($1,$2,$3,'Synthetic excluded','phone')",[id,A,index%2?OTHER:STAFF]);await plan(id,A,index%2?'review_inquiry':null,'2026-10-28T00:00:00Z');
  }
  const result=await list();expect(result.items).toHaveLength(50);expect(result.truncated).toBe(true);expect(result.items[0]!.inquiry_id.endsWith('000055')).toBe(true);expect(result.items[49]!.inquiry_id.endsWith('000006')).toBe(true);
  await db.exec("update private.inquiry_planned_actions set planned_action=null where inquiry_id::text like '40000000%' and right(inquiry_id::text,6)::int<=5");
  expect((await list()).items).toHaveLength(50);expect((await list()).truncated).toBe(false);
 });
 it('rejects GET direct RPC and grants no new private-table access',async()=>{
  await expect(list(STAFF,A,true,'GET')).rejects.toMatchObject({code:'22023'});
  await expect(asUser(STAFF,tx=>tx.query('select * from private.inquiry_planned_actions'))).rejects.toMatchObject({code:'42501'});
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.inquiry_owner_planned_actions(uuid)','execute') allowed")).rows[0]!.allowed).toBe(false);
 });
});
