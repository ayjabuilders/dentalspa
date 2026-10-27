import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { InquiryOwnerSearchPageResultSchema } from '../../packages/contracts/src/inquiry-owner-search-page';
import { A,B,STAFF,PATIENT,P1,P2,P3 } from '../fixtures';
const OTHER='20000000-0000-4000-8000-000000000011';

describe('owner search SQL privacy and literal matching',()=>{
 let db:PGlite;
 beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}});
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const name of ['20261026131434_foundation','20261026144919_manual_intake','20261026155853_scheduling_hold','20261026203601_inquiry_schedule','20261026215804_inquiry_owner_search','20261027051211_inquiry_owner_search_page']) await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
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



 const search=async(payload:unknown={before:null,name:'Synthetic'},user=STAFF,clinic=A,privileged=false)=>asUser(user,async tx=>InquiryOwnerSearchPageResultSchema.parse((await tx.query<{result:unknown}>('select public.inquiry_owner_search_page($1,$2::jsonb) result',[clinic,JSON.stringify(payload)])).rows[0]!.result),'POST',privileged);
 const add=async(name:string,owner=STAFF,clinic=A,time='2026-10-26T20:00:00Z',id:string=randomUUID())=>{await db.query("insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source,created_at) values($1,$2,$3,$4,'phone',$5)",[id,clinic,owner,name,time]);return id;};
 it('allows active intake roles with writes disabled and returns only current actor clinic summaries',async()=>{await db.exec('update private.intake_command_settings set enabled=false');for(const role of ['reception','manager','dentist']){await db.query('update public.clinic_memberships set role=$1 where user_id=$2',[role,STAFF]);const result=await search();expect(result).toMatchObject({clinic_id:A,owner_user_id:STAFF,truncated:false});expect(result.items.map(x=>x.id).sort()).toEqual([P1,P2].sort());for(const item of result.items)expect(Object.keys(item).sort()).toEqual(['created_at','display_name','follow_up_at','id','source','status']);}expect((await db.query('select * from private.audit_events')).rows).toEqual([]);expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);});
 it('denies privileged cross-clinic, assistant, inactive, patient-only and anonymous callers',async()=>{await db.query('delete from public.clinic_memberships where clinic_id=$1',[B]);await expect(search({before:null,name:'Synthetic'},STAFF,B,true)).rejects.toMatchObject({code:'42501'});await db.query("update public.clinic_memberships set role='assistant' where user_id=$1",[STAFF]);await expect(search({before:null,name:'Synthetic'},STAFF,A,true)).rejects.toMatchObject({code:'42501'});await db.query("update public.clinic_memberships set role='reception',active=false where user_id=$1",[STAFF]);await expect(search()).rejects.toMatchObject({code:'42501'});await expect(search({before:null,name:'Synthetic'},PATIENT,A,true)).rejects.toMatchObject({code:'42501'});await expect(search({before:null,name:'Synthetic'},'',A,true)).rejects.toMatchObject({code:'28000'});expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.inquiry_owner_search_page(uuid,jsonb)','EXECUTE') allowed")).rows[0]?.allowed).toBe(false);});
 it('treats wildcard-only, combined and trailing backslash queries literally',async()=>{for(const name of ['Literal %_','Literal \\%_','Literal tail\\','Literal %%','Literal \\_','Decoy anything'])await add(name);for(const name of ['%_','\\%_','tail\\','%%','\\_']){const expected=(await db.query<{id:string}>('select id from public.inquiries where clinic_id=$1 and owner_user_id=$2 and position($3 in display_name)>0 order by created_at desc,id desc',[A,STAFF,name])).rows.map(x=>x.id);expect((await search({before:null,name})).items.map(x=>x.id)).toEqual(expected);expect(expected.length).toBeGreaterThan(0);}});
 it('uses actual database case/accent semantics while requiring ASCII case folding',async()=>{await add('MiXeD');await add('Cafe');await add('Café');expect((await search({before:null,name:'mixed'})).items).toHaveLength(1);expect((await search({before:null,name:'Cafe'})).items.map(x=>x.display_name)).toEqual(['Cafe']);const actual=(await db.query<{before:null,name:string}>("select display_name name from public.inquiries where clinic_id=$1 and owner_user_id=$2 and display_name ilike '%CAFÉ%' order by created_at desc,id desc",[A,STAFF])).rows.map(x=>x.name);expect((await search({before:null,name:'CAFÉ'})).items.map(x=>x.display_name)).toEqual(actual);});
 it('rejects noncanonical Unicode bounds, control bytes and extra dimensions without silently trimming',async()=>{for(const payload of [null,{},[],{before:null,name:null},{before:null,name:'A'},{before:null,name:'😀'},{before:null,name:'x'.repeat(81)},{before:null,name:'😀'.repeat(81)},{before:null,name:' Li'},{before:null,name:'Li '},{before:null,name:'Li\tna'},{before:null,name:'Li\u007fna'},{before:null,name:'Li',owner_user_id:OTHER}])await expect(search(payload)).rejects.toMatchObject({code:'22023'});await add('😀'.repeat(80));expect((await search({before:null,name:'😀'.repeat(80)})).items).toHaveLength(1);await add('\u00a0Li\u00a0');expect((await search({before:null,name:'\u00a0Li\u00a0'})).items).toHaveLength(1);});
 it('filters name, current owner and clinic before limiting, including old records outside newest100',async()=>{for(let i=0;i<105;i++){await add('Decoy',STAFF,A);await add('Needle',OTHER,A);await add('Needle',STAFF,B);}const target=await add('Needle',STAFF,A,'2000-01-01T00:00:00Z');expect((await search({before:null,name:'Needle'})).items.map(x=>x.id)).toEqual([target]);await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[OTHER,target]);expect((await search({before:null,name:'Needle'})).items).toEqual([]);});
 it('orders exact instants and descending UUID and distinguishes50/51',async()=>{await add('Order',STAFF,A,'2026-10-26T20:00:00.000001Z','70000000-0000-4000-8000-000000000003');await add('Order',STAFF,A,'2026-10-26T21:00:00.000002+01:00','70000000-0000-4000-8000-000000000001');await add('Order',STAFF,A,'2026-10-26T20:00:00.000002Z','70000000-0000-4000-8000-000000000002');expect((await search({before:null,name:'Order'})).items.map(x=>x.id.slice(-1))).toEqual(['2','1','3']);for(let i=0;i<47;i++)await add('Order');let result=await search({before:null,name:'Order'});expect(result.items).toHaveLength(50);expect(result.truncated).toBe(false);await add('Order');result=await search({before:null,name:'Order'});expect(result.items).toHaveLength(50);expect(result.truncated).toBe(true);});
 it('uses fixed search path and denies GET direct RPC',async()=>{await expect(asUser(STAFF,tx=>tx.query('select public.inquiry_owner_search_page($1,$2)',[A,{before:null,name:'Synthetic'}]),'GET')).rejects.toMatchObject({code:'22023'});const fn=(await db.query<{proconfig:string[];provolatile:string}>("select proconfig,provolatile from pg_proc where oid='public.inquiry_owner_search_page(uuid,jsonb)'::regprocedure")).rows[0]!;expect(fn.proconfig).toContain('search_path=""');expect(fn.provolatile).toBe('s');});
 it('uses fabricated foreign/missing tuples only as bounds and echoes offset spelling exactly',async()=>{
  await add('Page',STAFF,A,'2026-10-26T20:00:00.123455Z',P1.replace('1','8'));
  const before={created_at:'2026-10-26T21:00:00.123456+01:00',inquiry_id:P3};
  const result=await search({name:'Page',before});expect(result.before).toEqual(before);expect(result.name).toBe('Page');expect(result.items).toHaveLength(1);
  expect((await search({name:'Page',before:{created_at:'0001-01-01T00:00:00Z',inquiry_id:P3}})).items).toEqual([]);
 });
 it('walks 51 matches without overlap, with strict timestamp/UUID bound before limit',async()=>{
  for(let i=1;i<=51;i++)await add('Paged',STAFF,A,'2026-10-26T20:00:00.123456Z','70000000-0000-4000-8000-'+String(i).padStart(12,'0'));
  const first=await search({name:'Paged',before:null});expect(first.items).toHaveLength(50);expect(first.truncated).toBe(true);
  expect(first.next_before).toEqual({created_at:first.items[49]!.created_at,inquiry_id:first.items[49]!.id});
  const second=await search({name:'Paged',before:first.next_before});expect(second.items.map(x=>x.id)).toEqual(['70000000-0000-4000-8000-000000000001']);expect(second.truncated).toBe(false);expect(second.next_before).toBeNull();
  await db.query('update public.inquiries set owner_user_id=$1 where id=$2',[OTHER,second.items[0]!.id]);expect((await search({name:'Paged',before:first.next_before})).items).toEqual([]);
 });
 it('preserves microseconds and equivalent offset boundaries, including exact tuple exclusion',async()=>{
  await add('Precise',STAFF,A,'2026-10-26T20:00:00.000001Z','70000000-0000-4000-8000-000000000003');
  await add('Precise',STAFF,A,'2026-10-26T20:00:00.000002Z','70000000-0000-4000-8000-000000000002');
  await add('Precise',STAFF,A,'2026-10-26T20:00:00.000002Z','70000000-0000-4000-8000-000000000001');
  for(const created_at of ['2026-10-26T20:00:00.000002Z','2026-10-26T21:00:00.000002+01:00']){
   const result=await search({name:'Precise',before:{created_at,inquiry_id:'70000000-0000-4000-8000-000000000002'}});
   expect(result.items.map(x=>x.id.slice(-1))).toEqual(['1','3']);
  }
 });
 it('rejects cursor coercion, precision loss and UTC range overflow',async()=>{
  for(const before of [{},[],false,{created_at:null,inquiry_id:P1},{created_at:'2026-10-26T20:00:00.0000001Z',inquiry_id:P1},{created_at:'0000-01-01T00:00:00Z',inquiry_id:P1},{created_at:'0001-01-01T00:00:00+01:00',inquiry_id:P1},{created_at:'9999-12-31T23:59:59-01:00',inquiry_id:P1},{created_at:'2026-10-26T20:00:00Z',inquiry_id:P1.replaceAll('-','')},{created_at:'2026-10-26T20:00:00Z',inquiry_id:P1,extra:true}])await expect(search({name:'Synthetic',before})).rejects.toMatchObject({code:'22023'});
  await expect(search({name:'Synthetic'})).rejects.toMatchObject({code:'22023'});
 });
});
