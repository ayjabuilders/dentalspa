begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(24);
insert into public.clinics(id,name) values('b1000000-0000-4000-8000-000000000001','Synthetic lookup A'),('b1000000-0000-4000-8000-000000000002','Synthetic lookup B');
insert into auth.users(id) values('b2000000-0000-4000-8000-000000000001'),('b2000000-0000-4000-8000-000000000002'),('b2000000-0000-4000-8000-000000000003');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','reception',true),
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','assistant',true),
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','manager',false);
insert into public.patients(id,clinic_id,reference,display_name) values
 ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','R-001','Alice'),
 ('b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','R-001','Alice Foreign');
insert into public.patients(clinic_id,reference,display_name) select 'b1000000-0000-4000-8000-000000000001','G-'||lpad(n::text,2,'0'),'Group '||n from generate_series(1,21) n;
select is((select prosecdef from pg_proc where oid='public.lookup_patients(uuid,jsonb)'::regprocedure),false,'RPC preserves caller RLS');
select is((select provolatile::text from pg_proc where oid='public.lookup_patients(uuid,jsonb)'::regprocedure),'s','RPC is stable and read-only');
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.method','POST',true);
select is(jsonb_array_length(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"reference_exact","query":"R-001"}')->'items'),1,'exact reference is clinic scoped');
select is(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"reference_exact","query":"R-001"}')->'items'->0->>'id','b3000000-0000-4000-8000-000000000001','foreign same-reference record is absent');
select is(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"reference_exact","query":" R-001 "}')->'items'->0->>'match_basis','reference_exact','surrounding trim and derived basis');
select is(jsonb_array_length(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"reference_exact","query":"r-001"}')->'items'),0,'reference remains case-sensitive');
select is(jsonb_array_length(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al"}')->'items'),1,'literal prefix returns authorized match');
select is(jsonb_array_length(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"al"}')->'items'),0,'name remains case-sensitive');
select is(jsonb_array_length(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"%_"}')->'items'),0,'wildcard characters are literal');
select is(jsonb_array_length(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Group"}')->'items'),20,'lookup bounded to20');
select is((public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Group"}')->>'truncated')::boolean,true,'21st match reports truncation');
select is(public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Group"}')->'items'->0->>'reference','G-01','deterministic reference ordering');
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"A"}')$$,'22023',null,'short prefix denied');
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al","limit":100}')$$,'22023',null,'unknown fields denied');
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000002','{"mode":"name_prefix","query":"Al"}')$$,'42501',null,'foreign clinic denied');
select set_config('request.method','GET',true);
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al"}')$$,'22023',null,'URL encoded GET denied');
select set_config('request.method','POST',true);
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al"}')$$,'42501',null,'assistant-only lookup denied');
select is((select count(*)::integer from public.patients where clinic_id='b1000000-0000-4000-8000-000000000001'),22,'foundation assistant reads unchanged');
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al"}')$$,'42501',null,'inactive manager denied');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al"}')$$,'28000',null,'missing subject denied');
set local role anon;
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al"}')$$,'42501',null,'anonymous RPC denied');
reset role;
update public.clinic_memberships set active=false where user_id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.lookup_patients('b1000000-0000-4000-8000-000000000001','{"mode":"name_prefix","query":"Al"}')$$,'42501',null,'revoked membership denied');
reset role;
select is((select count(*)::integer from public.patients where clinic_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002')),23,'lookup did not create patients');
select is((select count(*)::integer from private.outbox_events where clinic_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002')),0,'lookup emitted no outbox event');
select * from finish();
rollback;
