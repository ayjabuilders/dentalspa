import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, PATIENT, P1, P2, STAFF } from '../fixtures';

const FOREIGN='20000000-0000-4000-8000-000000000098';
const KEY='50000000-0000-4000-8000-000000000001';
const CORRELATION='50000000-0000-4000-8000-000000000002';
const changed={expected_revision:0,contact_preference:'phone',language:'fr',time_zone:'Africa/Casablanca'};

describe('own-patient communication preferences RPC on embedded PostgreSQL',()=>{
  let db:PGlite;
  beforeAll(async()=>{
    db=new PGlite({extensions:{btree_gist}});
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for(const migration of ['20261026131434_foundation.sql','20261026155853_scheduling_hold.sql','20261028130608_api_default_privilege_hardening.sql','20261028164500_patient_profile_read_audit.sql','20261028221719_patient_communication_preferences.sql']){
      await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
    }
    await db.exec(`insert into public.clinics(id,name) values('${A}','Synthetic A'),('${B}','Synthetic B');
      insert into auth.users(id) values('${PATIENT}'),('${STAFF}'),('${FOREIGN}');`);
  },30000);
  afterAll(async()=>{await db?.close();});
  beforeEach(async()=>{
    await db.exec(`delete from private.patient_communication_preference_receipts;delete from private.patient_communication_preferences;
      delete from private.outbox_events;delete from private.audit_events;delete from public.patient_account_links;delete from public.patients;
      update private.patient_communication_settings set enabled=false where singleton;
      insert into public.patients(id,clinic_id,reference,display_name) values('${P1}','${A}','R-001','Synthetic Alice'),('${P2}','${B}','R-002','Foreign Patient');
      insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by) values('${PATIENT}','${A}','${P1}',now(),'${STAFF}');`);
  });
  async function asUser<T>(subject:string,work:(tx:PGlite)=>Promise<T>,method='POST',role='authenticated'){
    return db.transaction(async tx=>{await tx.exec(`set local role ${role}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[subject,method]);return work(tx as unknown as PGlite);});
  }
  async function get(subject=PATIENT,clinic=A,method='POST'){
    return asUser(subject,async tx=>(await tx.query<{result:unknown}>('select public.get_my_patient_communication_preferences($1,$2) as result',[clinic,CORRELATION])).rows[0]?.result,method);
  }
  async function set(input:unknown=changed,key=KEY,subject=PATIENT,clinic=A,method='POST'){
    return asUser(subject,async tx=>(await tx.query<{result:unknown}>('select public.set_my_patient_communication_preferences($1,$2,$3,$4) as result',[clinic,input,key,CORRELATION])).rows[0]?.result,method);
  }

  it('returns an empty own-account state and audits reads without contact values',async()=>{
    expect(await get()).toEqual({schema_version:1,clinic_id:A,patient_id:P1,contact_preference:null,language:null,time_zone:null,revision:0,updated_at:null});
    const audit=(await db.query<{action:string;aggregate_id:string}>("select action,aggregate_id from private.audit_events where action='PatientCommunicationPreferencesViewed'")).rows;
    const outbox=(await db.query<{event_type:string;payload:Record<string,unknown>}>("select event_type,payload from private.outbox_events where event_type='PatientCommunicationPreferencesViewed'")).rows;
    expect(audit).toEqual([{action:'PatientCommunicationPreferencesViewed',aggregate_id:P1}]);
    expect(outbox).toEqual([{event_type:'PatientCommunicationPreferencesViewed',payload:{access_scope:'own_preferences'}}]);
  });

  it('denies foreign, unverified, unauthenticated and GET access without leaking data',async()=>{
    await expect(get(PATIENT,B)).rejects.toMatchObject({code:'42501'});
    await expect(get(FOREIGN)).rejects.toMatchObject({code:'42501'});
    await db.exec(`update public.patient_account_links set verified_at=null,verified_by=null where user_id='${PATIENT}'`);
    await expect(get()).rejects.toMatchObject({code:'42501'});
    await expect(get('',A,'POST')).rejects.toMatchObject({code:'28000'});
    await expect(get(PATIENT,A,'GET')).rejects.toMatchObject({code:'22023'});
    expect((await db.query('select * from private.audit_events')).rows).toEqual([]);
    expect((await db.query('select * from private.outbox_events')).rows).toEqual([]);
  });

  it('keeps writes disabled by default and validates the whole bounded payload',async()=>{
    await expect(set()).rejects.toMatchObject({code:'PT503'});
    await db.exec('update private.patient_communication_settings set enabled=true where singleton');
    await expect(set({...changed,unexpected:'value'})).rejects.toMatchObject({code:'22023'});
    await expect(set({...changed,time_zone:'Europe/Madrid'},'50000000-0000-4000-8000-000000000003')).rejects.toMatchObject({code:'22023'});
    expect((await db.query('select * from private.patient_communication_preferences')).rows).toEqual([]);
  });

  it('writes a CAS update once, replays the exact receipt and rejects stale or changed-key requests',async()=>{
    await db.exec('update private.patient_communication_settings set enabled=true where singleton');
    const first=await set() as Record<string,unknown> & {replayed:boolean};
    expect(first).toMatchObject({replayed:false,receipt:{clinic_id:A,patient_id:P1,previous_revision:0,revision:1,changed:true,contact_preference:'phone',language:'fr',time_zone:'Africa/Casablanca',catalogue_version:1,event_version:1}});
    expect(await set()).toEqual({...first,replayed:true});
    await expect(set({...changed,contact_preference:'email'},'50000000-0000-4000-8000-000000000003')).rejects.toMatchObject({code:'PT409'});
    await expect(set({...changed,language:'ar'})).rejects.toMatchObject({code:'PT409'});
    const state=await get();
    expect(state).toMatchObject({patient_id:P1,revision:1,contact_preference:'phone',language:'fr',time_zone:'Africa/Casablanca'});
    expect((await db.query<{count:number}>("select count(*)::int as count from private.audit_events where action='PatientCommunicationPreferencesChanged'")).rows[0]?.count).toBe(1);
    const event=(await db.query<{payload:Record<string,unknown>}>("select payload from private.outbox_events where event_type='PatientCommunicationPreferencesChanged'")).rows[0]?.payload;
    expect(event).toEqual({revision:1,changed_field_count:3});
    expect(JSON.stringify(event)).not.toMatch(/phone|fr|Casablanca|Synthetic Alice|R-001/i);
  });

  it('allows a no-op receipt without duplicate change events and rolls back state when outbox fails',async()=>{
    await db.exec('update private.patient_communication_settings set enabled=true where singleton');
    await set();
    const noop=await set({...changed,expected_revision:1},'50000000-0000-4000-8000-000000000004');
    expect(noop).toMatchObject({replayed:false,receipt:{changed:false,previous_revision:1,revision:1}});
    expect((await db.query<{count:number}>("select count(*)::int as count from private.audit_events where action='PatientCommunicationPreferencesChanged'")).rows[0]?.count).toBe(1);
    await db.exec(`create function private.fail_patient_preferences_outbox() returns trigger language plpgsql as $$begin raise exception using errcode='P0001',message='synthetic sink failure';end$$;
      create trigger fail_patient_preferences_outbox before insert on private.outbox_events for each row when (new.event_type='PatientCommunicationPreferencesChanged') execute function private.fail_patient_preferences_outbox();`);
    const next={expected_revision:1,contact_preference:'email',language:'fr',time_zone:'Africa/Casablanca'};
    try{await expect(set(next,'50000000-0000-4000-8000-000000000005')).rejects.toMatchObject({code:'P0001'});}
    finally{await db.exec('drop trigger fail_patient_preferences_outbox on private.outbox_events;drop function private.fail_patient_preferences_outbox()');}
    expect((await db.query('select contact_preference,revision from private.patient_communication_preferences')).rows).toEqual([{contact_preference:'phone',revision:1}]);
    expect((await db.query('select * from private.patient_communication_preference_receipts where request_key=$1',['50000000-0000-4000-8000-000000000005'])).rows).toEqual([]);
  });

  it('exposes only authenticated execution and keeps private tables inaccessible',async()=>{
    for(const role of ['anon','service_role']){
      await expect(asUser(PATIENT,tx=>tx.query('select public.get_my_patient_communication_preferences($1,$2)',[A,CORRELATION]),'POST',role)).rejects.toMatchObject({code:'42501'});
      await expect(asUser(PATIENT,tx=>tx.query('select * from private.patient_communication_preferences'),'POST',role)).rejects.toMatchObject({code:'42501'});
    }
    const routine=(await db.query<{definer:boolean;config:string[]}>(`select p.prosecdef definer,p.proconfig config from pg_proc p where p.oid='public.set_my_patient_communication_preferences(uuid,jsonb,uuid,uuid)'::regprocedure`)).rows[0]!;
    expect(routine.definer).toBe(true);expect(routine.config).toContain('search_path=""');
    for(const signature of ['public.get_my_patient_communication_preferences(uuid,uuid)','public.set_my_patient_communication_preferences(uuid,jsonb,uuid,uuid)']){
      expect((await db.query<{allowed:boolean}>('select has_function_privilege($1,$2,$3) allowed',['authenticated',signature,'execute'])).rows[0]?.allowed).toBe(true);
      for(const role of ['anon','service_role'])expect((await db.query<{allowed:boolean}>('select has_function_privilege($1,$2,$3) allowed',[role,signature,'execute'])).rows[0]?.allowed).toBe(false);
    }
  });
});
