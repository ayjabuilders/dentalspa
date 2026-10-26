import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { InquiryOwnerWorklistSchema } from '../../packages/contracts/src/inquiry-worklist';
import { InquirySchema } from '../../packages/contracts/src/intake';
import { A,B,STAFF,PATIENT,P1,P2,P3 } from '../fixtures';
const OTHER='20000000-0000-4000-8000-000000000011';
describe('owner worklist actual SQL reads',()=>{
 let db:PGlite;
 beforeAll(async()=>{
  db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const name of ['20261026131434_foundation','20261026144919_manual_intake','20261026184134_inquiry_owner_worklist'])await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
  await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');insert into auth.users(id) values('${STAFF}'),('${OTHER}'),('${PATIENT}');insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${A}','${STAFF}','reception',true),('${B}','${STAFF}','reception',true),('${A}','${OTHER}','manager',true);`);
 },30000);
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{await db.exec(`delete from public.inquiries;update public.clinic_memberships set role='reception',active=true where user_id='${STAFF}';update private.intake_command_settings set enabled=false;`);});
 const insert=async(id=P1,clinic=A,owner=STAFF,due:string|null='2000-01-01T00:00:00Z',created='2020-01-01T00:00:00Z')=>db.query("insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,contact_phone,source,follow_up_at,created_at) values($1,$2,$3,'Synthetic Reminder','synthetic-secret@example.test','+212 000 000','phone',$4,$5)",[id,clinic,owner,due,created]);
 async function user<T>(actor:string,fn:(tx:PGlite)=>Promise<T>,privileged=false,method='POST') {return db.transaction(async tx=>{if(!privileged)await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[actor,method]);return fn(tx as unknown as PGlite);});}
 const list=async(actor=STAFF,clinic=A,privileged=false)=>user(actor,async tx=>InquiryOwnerWorklistSchema.parse((await tx.query<{result:unknown}>('select public.inquiry_owner_worklist($1) result',[clinic])).rows[0]!.result),privileged);
 const detail=async(id=P1,actor=STAFF,clinic=A,privileged=false)=>user(actor,async tx=>InquirySchema.parse((await tx.query<{result:unknown}>('select public.get_owned_inquiry($1,$2) result',[clinic,id])).rows[0]!.result),privileged);
 it('has explicit empty buckets and works with both write gates disabled without writes',async()=>{
  const empty=await list();for(const name of ['overdue','upcoming','undated'] as const)expect(empty[name]).toEqual({items:[],truncated:false});
  await insert();const before=(await db.query('select * from public.inquiries')).rows;await list();await detail();expect((await db.query('select * from public.inquiries')).rows).toEqual(before);expect((await db.query('select * from private.audit_events')).rows).toHaveLength(0);expect((await db.query('select * from private.outbox_events')).rows).toHaveLength(0);
 });
 it('accepts active permitted roles while denying assistant, inactive, patient-only and anonymous',async()=>{
  await insert();for(const role of ['reception','manager','dentist']){await db.query('update public.clinic_memberships set role=$1 where clinic_id=$2 and user_id=$3',[role,A,STAFF]);expect((await list()).overdue.items).toHaveLength(1);await detail();}
  await db.query("update public.clinic_memberships set role='assistant' where clinic_id=$1 and user_id=$2",[A,STAFF]);await expect(list()).rejects.toMatchObject({code:'42501'});await expect(detail()).rejects.toMatchObject({code:'42501'});
  await db.query("update public.clinic_memberships set role='reception',active=false where clinic_id=$1 and user_id=$2",[A,STAFF]);await expect(list()).rejects.toMatchObject({code:'42501'});
  await expect(list(PATIENT)).rejects.toMatchObject({code:'42501'});await expect(list('')).rejects.toMatchObject({code:'28000'});
 });
 it('enforces tenant and current owner even for privileged callers, concealing all missing cases',async()=>{
  await insert();await insert(P2,A,OTHER);await insert(P3,B,STAFF);
  for(const privileged of [false,true]) {
   expect((await list(STAFF,A,privileged)).overdue.items.map(item=>item.id)).toEqual([P1]);
   for(const id of [P2,P3,randomUUID()])await expect(detail(id,STAFF,A,privileged)).rejects.toMatchObject({code:'PT404',message:'Inquiry not found'});
   await expect(list(PATIENT,A,privileged)).rejects.toMatchObject({code:'42501'});
  }
  await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[OTHER,P1]);expect((await list()).overdue.items).toHaveLength(0);await expect(detail()).rejects.toMatchObject({code:'PT404'});expect((await detail(P1,OTHER)).id).toBe(P1);
 });
 it('projects no contact fields while owner detail retains its existing strict schema',async()=>{
  await insert();const result=await list();expect(JSON.stringify(result)).not.toContain('synthetic-secret');expect(result.overdue.items[0]).not.toHaveProperty('contact_phone');expect((await detail()).contact_email).toBe('synthetic-secret@example.test');
 });
 it('classifies equality overdue and one microsecond later upcoming at the same DB observation',async()=>{
  await insert(P1);await insert(P2);const result=await user(STAFF,async tx=>{
   // Trusted fixture setup in the same statement supplies the exact public observation boundary.
   await tx.exec('reset role');
   return InquiryOwnerWorklistSchema.parse((await tx.query<{result:unknown}>(`with changed as(update public.inquiries set follow_up_at=statement_timestamp()+case when id=$2::uuid then interval '1 microsecond' else interval '0' end where clinic_id=$1 returning id) select public.inquiry_owner_worklist($1) result from (select count(*) from changed) completed`,[A,P2])).rows[0]!.result);
  });
  expect(result.overdue.items.map(item=>item.id)).toEqual([P1]);expect(result.upcoming.items.map(item=>item.id)).toEqual([P2]);expect(result.overdue.items[0]?.follow_up_at).toBe(result.observed_at);
 });
 it.each(['overdue','upcoming','undated'] as const)('orders and reports50/51 truthfully for %s',async bucket=>{
  const due=bucket==='undated'?null:bucket==='overdue'?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z';
  await db.query("insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source,follow_up_at,created_at) select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'Synthetic '||n,'phone',$3,'2020-01-01T00:00:00Z' from generate_series(1,50)n",[A,STAFF,due]);
  let result=(await list())[bucket];expect(result.items).toHaveLength(50);expect(result.truncated).toBe(false);expect(result.items[0]?.id).toBe(bucket==='undated'?'40000000-0000-4000-8000-000000000050':'40000000-0000-4000-8000-000000000001');
  await insert('40000000-0000-4000-8000-000000000051',A,STAFF,due);result=(await list())[bucket];expect(result.items).toHaveLength(50);expect(result.truncated).toBe(true);
  await db.query('update public.inquiries set follow_up_at=$1,created_at=$2 where id=$3',[bucket==='undated'?null:bucket==='overdue'?'1990-01-01Z':'2090-01-01Z','2030-01-01Z','40000000-0000-4000-8000-000000000025']);
  expect((await list())[bucket].items[0]?.id).toBe('40000000-0000-4000-8000-000000000025');
 });
 it('retrieves an old owned detail outside newest100 and rejects wrong RPC transport',async()=>{
  await insert();await db.query("insert into public.inquiries(clinic_id,owner_user_id,display_name,source,created_at) select $1,$2,'Synthetic New '||n,'phone','2030-01-01Z' from generate_series(1,101)n",[A,STAFF]);
  expect((await detail()).id).toBe(P1);
  await expect(user(STAFF,tx=>tx.query('select public.inquiry_owner_worklist($1)',[A]),false,'GET')).rejects.toMatchObject({code:'22023'});
  await expect(user(STAFF,tx=>tx.query('select public.get_owned_inquiry($1,null)',[A]))).rejects.toMatchObject({code:'22023'});
 });
});
