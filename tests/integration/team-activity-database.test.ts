import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { TeamActivitySchema } from '../../packages/contracts/src/team-activity';
import { A,B,STAFF,PATIENT } from '../fixtures';
describe('team activity SQL privacy and authority',()=>{
 let db:PGlite;
 beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);for(const name of ['20261026131434_foundation','20261026200408_team_activity'])await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');insert into auth.users(id) values('${STAFF}'),('${PATIENT}');`);},30000);
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{await db.exec(`delete from private.audit_events;delete from public.clinic_memberships;delete from public.profiles;insert into public.profiles(user_id,display_name) values('${STAFF}','Synthetic Manager');insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${A}','${STAFF}','manager',true);`);});
 async function user<T>(actor:string,fn:(tx:PGlite)=>Promise<T>,privileged=false,method='POST',role='authenticated'){return db.transaction(async tx=>{if(!privileged)await tx.exec(`set local role ${role}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[actor,method]);return fn(tx as unknown as PGlite);});}
 const activity=(actor=STAFF,clinic=A,privileged=false)=>user(actor,async tx=>TeamActivitySchema.parse((await tx.query<{result:unknown}>('select public.team_activity($1) result',[clinic])).rows[0]!.result),privileged);
 const event=(action='InquiryCreated',clinic=A,actor=STAFF,time='2026-10-26T19:00:00Z',id=randomUUID())=>db.query('insert into private.audit_events(id,clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at) values($1,$2,$3,$4,$5,$6,$7)',[id,clinic,actor,action,randomUUID(),randomUUID(),time]);
 it('permits manager only and independently denies privileged role, inactive, foreign and absent callers',async()=>{
  expect((await activity()).items).toEqual([]);await expect(activity(STAFF,B,true)).rejects.toMatchObject({code:'42501'});
  for(const role of ['dentist','reception','assistant']){await db.query('update public.clinic_memberships set role=$1',[role]);for(const privileged of [false,true])await expect(activity(STAFF,A,privileged)).rejects.toMatchObject({code:'42501'});}
  await db.exec("update public.clinic_memberships set role='manager',active=false");await expect(activity(STAFF,A,true)).rejects.toMatchObject({code:'42501'});await expect(activity(PATIENT)).rejects.toMatchObject({code:'42501'});await expect(activity('',A,true)).rejects.toMatchObject({code:'28000'});
  await expect(user('',tx=>tx.query('select public.team_activity($1)',[A]),false,'POST','anon')).rejects.toMatchObject({code:'42501'});
 });
 it('maps only allowlisted same-clinic actions and never discloses identifiers or changes audit/outbox',async()=>{
  for(const action of ['InquiryCreated','InquiryFollowUpRecorded','SlotHoldCreated','SlotHoldReleased'])await event(action);
  await event('UnknownFutureAction');await event('SlotHoldExpired');await event('InquiryCreated',B);
  const result=await activity();expect(result.items.map(item=>item.kind).sort()).toEqual(['inquiry_created','inquiry_follow_up_recorded','slot_hold_created','slot_hold_released']);for(const item of result.items)expect(Object.keys(item).sort()).toEqual(['actor_display_name','kind','occurred_at']);
  expect((await db.query('select count(*)::int n from private.audit_events')).rows).toEqual([{n:7}]);expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);
  await expect(user(STAFF,tx=>tx.query('select * from private.audit_events'))).rejects.toMatchObject({code:'42501'});
 });
 it('uses nullable current name with no UUID fallback for missing and removed profiles',async()=>{
  await event();await db.exec("update public.profiles set display_name='Synthetic Renamed'");expect((await activity()).items[0]?.actor_display_name).toBe('Synthetic Renamed');await db.exec('delete from public.profiles');expect((await activity()).items[0]?.actor_display_name).toBeNull();expect(JSON.stringify(await activity())).not.toContain(STAFF);
 });
 it('orders full timestamp instants then private UUID descending, preserving microseconds',async()=>{
  await event('InquiryCreated',A,STAFF,'2026-10-26T19:00:00.000001Z','30000000-0000-4000-8000-000000000001');
  await event('SlotHoldCreated',A,STAFF,'2026-10-26T20:00:00.000002+01:00','30000000-0000-4000-8000-000000000002');
  await event('SlotHoldReleased',A,STAFF,'2026-10-26T19:00:00.000002Z','30000000-0000-4000-8000-000000000003');
  const result=await activity();expect(result.items.map(item=>item.kind)).toEqual(['slot_hold_released','slot_hold_created','inquiry_created']);expect(result.items[0]?.occurred_at).toContain('.000002');
 });
 it('returns exactly50 and indicates51 supported rows, unaffected by unsupported rows',async()=>{
  for(let i=0;i<50;i++)await event();await event('Unknown');let result=await activity();expect(result.items).toHaveLength(50);expect(result.truncated).toBe(false);await event();result=await activity();expect(result.items).toHaveLength(50);expect(result.truncated).toBe(true);
 });
 it('uses one observation with fixed search path and rejects GET RPC transport',async()=>{
  const fn=(await db.query<{provolatile:string;proconfig:string[]}>('select provolatile,proconfig from pg_proc where oid=\'public.team_activity(uuid)\'::regprocedure')).rows[0]!;expect(fn.provolatile).toBe('s');expect(fn.proconfig).toContain('search_path=""');await expect(user(STAFF,tx=>tx.query('select public.team_activity($1)',[A]),false,'GET')).rejects.toMatchObject({code:'22023'});
  expect((await user(STAFF,tx=>tx.query<{same:boolean}>('select (public.team_activity($1)->>\'observed_at\')::timestamptz=statement_timestamp() same',[A]))).rows[0]?.same).toBe(true);
 });
});
