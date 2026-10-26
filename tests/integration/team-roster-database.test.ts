import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { TeamRosterSchema } from '../../packages/contracts/src/team-roster';
import { A,B,STAFF,PATIENT } from '../fixtures';
const OTHER='20000000-0000-4000-8000-000000000011';
describe('team roster privileged SQL authorization and complete projection',()=>{
 let db:PGlite;
 beforeAll(async()=>{
  db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const name of ['20261026131434_foundation','20261026191955_team_roster'])await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
  await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');`);
 },30000);
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{await db.exec(`delete from public.clinic_memberships;delete from public.profiles;delete from auth.users;insert into auth.users(id) values('${STAFF}'),('${PATIENT}');insert into public.profiles(user_id,display_name) values('${STAFF}','zeta');insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${A}','${STAFF}','manager',true);`);});
 const add=async(id:string,name:string|null,clinic=A,active=true)=>{await db.query('insert into auth.users(id) values($1)',[id]);if(name!==null)await db.query('insert into public.profiles(user_id,display_name) values($1,$2)',[id,name]);await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'assistant',$3)",[clinic,id,active]);};
 async function user<T>(actor:string,fn:(tx:PGlite)=>Promise<T>,privileged=false,method='POST',role='authenticated') {return db.transaction(async tx=>{if(!privileged)await tx.exec(`set local role ${role}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[actor,method]);return fn(tx as unknown as PGlite);});}
 const roster=async(actor=STAFF,clinic=A,privileged=false)=>user(actor,async tx=>TeamRosterSchema.parse((await tx.query<{result:unknown}>('select public.team_roster($1) result',[clinic])).rows[0]!.result),privileged);
 it('allows active manager/dentist and denies reception, assistant, inactive, patient-only and anonymous',async()=>{
  for(const role of ['manager','dentist']) {await db.query('update public.clinic_memberships set role=$1 where user_id=$2',[role,STAFF]);expect((await roster()).members).toHaveLength(1);}
  for(const role of ['reception','assistant']) {await db.query('update public.clinic_memberships set role=$1 where user_id=$2',[role,STAFF]);await expect(roster()).rejects.toMatchObject({code:'42501'});await expect(roster(STAFF,A,true)).rejects.toMatchObject({code:'42501'});}
  await db.query("update public.clinic_memberships set role='manager',active=false where user_id=$1",[STAFF]);await expect(roster()).rejects.toMatchObject({code:'42501'});
  await expect(roster(PATIENT)).rejects.toMatchObject({code:'42501'});await expect(roster('')).rejects.toMatchObject({code:'28000'});
  await expect(user('',tx=>tx.query('select public.team_roster($1)',[A]),false,'POST','anon')).rejects.toMatchObject({code:'42501'});
 });
 it('rechecks clinic scope even privileged and excludes foreign/inactive memberships and profiles',async()=>{
  await add(OTHER,'Synthetic Foreign',B);await add(randomUUID(),'Synthetic Inactive',A,false);await add(randomUUID(),null,B);await add(randomUUID(),null,A,false);
  for(const privileged of [false,true]) {await expect(roster(STAFF,B,privileged)).rejects.toMatchObject({code:'42501'});expect((await roster(STAFF,A,privileged)).members.map(member=>member.user_id)).toEqual([STAFF]);}
  const direct=(await user(STAFF,tx=>tx.query('select user_id from public.profiles'))).rows;expect(direct).toEqual([{user_id:STAFF}]);
 });
 it('groups active roles uniquely in canonical order without changing memberships or emitting events',async()=>{
  await add(OTHER,'Synthetic Multi');await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true),($1,$2,'dentist',true),($1,$2,'reception',false)",[A,OTHER]);
  const before=(await db.query('select * from public.clinic_memberships order by id')).rows;
  const result=await roster();expect(result.members.find(member=>member.user_id===OTHER)?.roles).toEqual(['assistant','dentist','manager']);expect(Object.keys(result.members[0]!).sort()).toEqual(['clinic_id','display_name','roles','user_id']);
  expect((await db.query('select * from public.clinic_memberships order by id')).rows).toEqual(before);expect((await db.query('select * from private.outbox_events')).rows).toHaveLength(0);
  await expect(db.query('insert into public.profiles(user_id,display_name) values($1,$2)',[OTHER,'Duplicate'])).rejects.toMatchObject({code:'23505'});
 });
 it('uses exactly the prescribed C-collation lowercase order and UUID tie-break',async()=>{
  const names=['aLPHa','Alpha','Élodie','éclair','😀'];const ids=names.map((_,i)=>`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
  for(let i=0;i<names.length;i++)await add(ids[i]!,names[i]!);
  expect((await roster()).members.map(member=>member.user_id)).toEqual([ids[0],ids[1],STAFF,ids[2],ids[3],ids[4]]);
 });
 it('fails closed for any missing active profile, including beyond the100-member cutoff',async()=>{
  await db.query("insert into auth.users(id) select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,100)n");
  await db.query("insert into public.profiles(user_id,display_name) select id,'A'||id::text from auth.users where id::text like '40000000%' and id::text<>'40000000-0000-4000-8000-000000000100'");
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) select $1,id,'reception',true from auth.users where id::text like '40000000%'",[A]);
  await expect(roster()).rejects.toMatchObject({code:'PT503',message:'Team roster unavailable'});
  await expect(roster(STAFF,A,true)).rejects.toMatchObject({code:'PT503'});
  await db.query("insert into public.profiles(user_id,display_name) values('40000000-0000-4000-8000-000000000100','zzzz-last')");
  const result=await roster();expect(result.members).toHaveLength(100);expect(result.truncated).toBe(true);expect(result.members.some(member=>member.display_name==='zzzz-last')).toBe(false);
 });
 it('distinguishes100 from101 distinct people regardless of active role count',async()=>{
  for(let i=1;i<=99;i++)await add(`50000000-0000-4000-8000-${String(i).padStart(12,'0')}`,'Synthetic '+i);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'dentist',true),($1,$2,'assistant',true)",[A,STAFF]);
  let result=await roster();expect(result.members).toHaveLength(100);expect(result.truncated).toBe(false);
  await add(OTHER,'Synthetic 101');result=await roster();expect(result.members).toHaveLength(100);expect(result.truncated).toBe(true);
 });
 it('is a stable snapshot RPC with fixed search path and POST-only adapter transport',async()=>{
  const fn=(await db.query<{provolatile:string;proconfig:string[]}>('select provolatile,proconfig from pg_proc where oid=\'public.team_roster(uuid)\'::regprocedure')).rows[0]!;expect(fn.provolatile).toBe('s');expect(fn.proconfig).toContain('search_path=""');
  await expect(user(STAFF,tx=>tx.query('select public.team_roster($1)',[A]),false,'GET')).rejects.toMatchObject({code:'22023'});
  const observed=await user(STAFF,tx=>tx.query<{same:boolean}>('select (public.team_roster($1)->>\'observed_at\')::timestamptz=statement_timestamp() same',[A]));expect(observed.rows[0]?.same).toBe(true);
 });
});
