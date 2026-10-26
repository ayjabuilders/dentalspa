import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PatientLookupRequestSchema, PatientLookupResponseSchema } from '../../packages/contracts/src/patient-lookup';
import { A,B,STAFF,PATIENT,P1,P2,P3 } from '../fixtures';
const MANAGER='20000000-0000-4000-8000-000000000011',DENTIST='20000000-0000-4000-8000-000000000012',ASSISTANT='20000000-0000-4000-8000-000000000013',INACTIVE='20000000-0000-4000-8000-000000000014';
describe('patient lookup RPC and RLS on embedded PostgreSQL',()=>{
  let db:PGlite;
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(readFileSync('supabase/migrations/20261026131434_foundation.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20261026151845_patient_lookup.sql','utf8'));
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users(id) values('${STAFF}'),('${PATIENT}'),('${MANAGER}'),('${DENTIST}'),('${ASSISTANT}'),('${INACTIVE}');
      insert into public.clinic_memberships(clinic_id,user_id,role,active) values
      ('${A}','${STAFF}','reception',true),('${A}','${MANAGER}','manager',true),('${A}','${DENTIST}','dentist',true),('${A}','${ASSISTANT}','assistant',true),('${A}','${INACTIVE}','reception',false);`);
  },30000);
  afterAll(async()=>{await db?.close();});
  beforeEach(async()=>{
    await db.exec(`delete from public.patient_account_links;delete from public.patients;
      update public.clinic_memberships set active=true where user_id='${STAFF}';
      insert into public.patients(id,clinic_id,reference,display_name) values('${P1}','${A}','R-001','Alice Alpha'),('${P2}','${B}','R-001','Alice Foreign'),('${P3}','${A}','R-002','Élodie');
      insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by) values('${PATIENT}','${A}','${P1}',now(),'${STAFF}');`);
  });
  async function asUser<T>(user:string,work:(tx:PGlite)=>Promise<T>,method='POST',role='authenticated'){
    return db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[user,method]);
      return work(tx as unknown as PGlite);
    });
  }
  async function lookup(payload:unknown,user=STAFF,clinic=A,method='POST'){
    return asUser(user,async tx=>PatientLookupResponseSchema.parse((await tx.query<{result:unknown}>('select public.lookup_patients($1,$2::jsonb) result',[clinic,JSON.stringify(payload)])).rows[0]?.result),method);
  }
  it('allows active reception/manager/dentist, with only minimal server-derived fields',async()=>{
    for(const user of [STAFF,MANAGER,DENTIST]) expect(await lookup({mode:'reference_exact',query:'R-001'},user)).toEqual({items:[{id:P1,clinic_id:A,reference:'R-001',display_name:'Alice Alpha',match_basis:'reference_exact'}],truncated:false});
  });
  it('denies patient-only, assistant-only, inactive, unknown and missing subjects',async()=>{
    for(const user of [PATIENT,ASSISTANT,INACTIVE,'20000000-0000-4000-8000-000000000099']) await expect(lookup({mode:'name_prefix',query:'Al'},user)).rejects.toMatchObject({code:'42501'});
    await expect(lookup({mode:'name_prefix',query:'Al'},'')).rejects.toMatchObject({code:'28000'});
    await expect(asUser('',tx=>tx.query('select public.lookup_patients($1,$2::jsonb)',[A,'{"mode":"name_prefix","query":"Al"}']),'POST','anon')).rejects.toMatchObject({code:'42501'});
  });
  it('does not remove existing assistant patient reads or verified own-patient reads',async()=>{
    expect((await asUser(ASSISTANT,tx=>tx.query('select * from public.patients'))).rows).toHaveLength(2);
    expect((await asUser(PATIENT,tx=>tx.query('select * from public.patients'))).rows).toHaveLength(1);
  });
  it('denies foreign clinic and revoked membership, with RLS still applied',async()=>{
    await expect(lookup({mode:'reference_exact',query:'R-001'},STAFF,B)).rejects.toMatchObject({code:'42501'});
    await db.exec(`update public.clinic_memberships set active=false where user_id='${STAFF}'`);
    await expect(lookup({mode:'name_prefix',query:'Al'})).rejects.toMatchObject({code:'42501'});
    const fn=(await db.query<{prosecdef:boolean;provolatile:string;proconfig:string[]}>('select prosecdef,provolatile,proconfig from pg_proc where oid=\'public.lookup_patients(uuid,jsonb)\'::regprocedure')).rows[0]!;
    expect(fn.prosecdef).toBe(false);expect(fn.provolatile).toBe('s');expect(fn.proconfig).toContain('search_path=""');
  });
  it('requires JSON POST even when called directly through RPC',async()=>{
    for(const method of ['GET','HEAD','']) await expect(lookup({mode:'name_prefix',query:'Al'},STAFF,A,method)).rejects.toMatchObject({code:'22023'});
  });
  it('independently rejects malformed inputs and does not echo their values',async()=>{
    const invalid=[null,[],{},'private-name',{mode:'name_prefix',query:1},{mode:'name_prefix',query:'A'},{mode:'name_prefix',query:' '.repeat(5)},{mode:'name_prefix',query:'a'.repeat(121)},{mode:'reference_exact',query:'a'.repeat(257)},{mode:'reference_exact',query:''},{mode:'regex',query:'Al'},{mode:'name_prefix',query:'Al',clinic_id:B},{mode:'name_prefix',query:'Al',limit:100}];
    for(const payload of invalid){
      expect(PatientLookupRequestSchema.safeParse(payload).success).toBe(false);
      await expect(lookup(payload)).rejects.toMatchObject({code:'22023',message:'Invalid patient lookup input'});
    }
  });
  it('trims JS whitespace only and preserves literal case, accent and prefix semantics',async()=>{
    expect((await lookup({mode:'reference_exact',query:'\v\u00a0R-001\uFEFF'})).items).toHaveLength(1);
    for(const query of ['r-001','R-00','R-001 ']){
      const result=await lookup({mode:'reference_exact',query});expect(result.items).toHaveLength(query==='R-001 '?1:0);
    }
    expect((await lookup({mode:'name_prefix',query:'Al'})).items).toHaveLength(1);
    for(const query of ['al','Alpha','El','él']) expect((await lookup({mode:'name_prefix',query})).items).toHaveLength(0);
    expect((await lookup({mode:'name_prefix',query:'Él'})).items).toHaveLength(1);
  });
  it('treats SQL wildcard, quote, escape and regex-looking characters literally',async()=>{
    for(const name of ['%_ person',"O'Neil",'\\path','.*regex','أمينة']){
      await db.query('insert into public.patients(clinic_id,reference,display_name) values($1,$2,$3)',[A,name,name]);
      const query=[...name].slice(0,2).join('');
      const result=await lookup({mode:'name_prefix',query});expect(result.items.map(item=>item.display_name)).toEqual([name]);
      expect((await lookup({mode:'reference_exact',query:name})).items).toHaveLength(1);
    }
    expect((await lookup({mode:'name_prefix',query:"' OR 1=1 --"})).items).toHaveLength(0);
  });
  it('matches codepoint bounds and preserves unconstrained existing references in responses',async()=>{
    const name='😀'.repeat(120),reference='r'.repeat(300);
    await db.query('insert into public.patients(clinic_id,reference,display_name) values($1,$2,$3)',[A,reference,name]);
    const payload={mode:'name_prefix',query:name};expect(PatientLookupRequestSchema.safeParse(payload).success).toBe(true);
    expect((await lookup(payload)).items[0]?.reference).toBe(reference);
    await expect(lookup({...payload,query:name+'😀'})).rejects.toMatchObject({code:'22023'});
  });
  it('orders by C reference and returns correct 20/21 boundary without a total count',async()=>{
    await db.query(`insert into public.patients(clinic_id,reference,display_name) select $1,'G-'||lpad(n::text,2,'0'),'Group '||n from generate_series(1,20) n`,[A]);
    const exact=await lookup({mode:'name_prefix',query:'Group'});expect(exact.items).toHaveLength(20);expect(exact.truncated).toBe(false);
    await db.query("insert into public.patients(clinic_id,reference,display_name) values($1,'G-21','Group 21')",[A]);
    const overflow=await lookup({mode:'name_prefix',query:'Group'});expect(overflow.items).toEqual(exact.items);expect(overflow.truncated).toBe(true);
    for(const reference of ['a','Z','é','A'])await db.query("insert into public.patients(clinic_id,reference,display_name) values($1,$2,'Order fixture')",[A,reference]);
    expect((await lookup({mode:'name_prefix',query:'Order'})).items.map(item=>item.reference)).toEqual(['A','Z','a','é']);
  });
  it('searches the full clinic register, not the old first100 list',async()=>{
    await db.query(`insert into public.patients(clinic_id,reference,display_name) select $1,'A-'||n,'Fixture '||n from generate_series(1,110) n`,[A]);
    await db.query("insert into public.patients(clinic_id,reference,display_name) values($1,'ZZ-last','Needle fixture')",[A]);
    expect((await lookup({mode:'name_prefix',query:'Needle'})).items[0]?.reference).toBe('ZZ-last');
  });
  it('returns truthful empty results and performs no state mutations',async()=>{
    const counts=async()=>Promise.all(['public.patients','public.patient_account_links','private.audit_events','private.outbox_events'].map(async table=>(await db.query<{count:number}>(`select count(*)::integer count from ${table}`)).rows[0]!.count));
    const before=await counts();expect(await lookup({mode:'name_prefix',query:'Absent'})).toEqual({items:[],truncated:false});
    await lookup({mode:'name_prefix',query:'Al'});expect(await counts()).toEqual(before);
    await expect(asUser(STAFF,tx=>tx.exec("update public.patients set display_name='changed'"))).rejects.toMatchObject({code:'42501'});
  });
});
