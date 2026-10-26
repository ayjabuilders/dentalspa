begin;
create extension if not exists pgtap with schema extensions;
-- Resolve pgTAP explicitly on fresh local databases, including after SET ROLE.
set local search_path = public, extensions;
select plan(34);

insert into auth.users(id) values
('20000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000002'),
('20000000-0000-4000-8000-000000000003'),
('20000000-0000-4000-8000-000000000004'),
('20000000-0000-4000-8000-000000000005'),
('20000000-0000-4000-8000-000000000006');
insert into public.profiles(user_id,display_name) values
('20000000-0000-4000-8000-000000000001','Synthetic staff A'),
('20000000-0000-4000-8000-000000000002','Synthetic staff B');
insert into public.clinics(id,name) values
('10000000-0000-4000-8000-000000000001','Test A'),
('10000000-0000-4000-8000-000000000002','Test B') on conflict do nothing;
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','reception',true),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','dentist',true),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','manager',false);
insert into public.patients(id,clinic_id,reference,display_name) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TEST-A','Patient fictif A'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','TEST-B','Patient fictif B'),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','TEST-C','Patient fictif C');
insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by) values
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now(),'20000000-0000-4000-8000-000000000001');
insert into public.patient_account_links(user_id,clinic_id,patient_id) values
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003');
select is((select public from storage.buckets where id='patient-documents'),false,'documents bucket is private');
-- These are DB policy checks; Storage HTTP/signed-URL denial is a separate gate.
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects'),0,'no storage object access policies');
select ok((select relrowsecurity from pg_class where oid='storage.objects'::regclass),'storage objects enforce RLS');
select ok(not has_schema_privilege('authenticated','private','USAGE'),'private audit/outbox schema denied');
select ok(not has_schema_privilege('anon','private','USAGE'),'private schema denied to anonymous clients');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.clinics'::regclass,'public.profiles'::regclass,'public.clinic_memberships'::regclass,'public.patients'::regclass,'public.patient_account_links'::regclass)),'all public foundation tables enforce RLS');
select throws_ok($$update public.patient_account_links set patient_id='30000000-0000-4000-8000-000000000002' where user_id='20000000-0000-4000-8000-000000000003'$$,'23503',null,'privileged SQL cannot link a patient from another clinic');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.patients),2,'staff A sees only A patients');
select is((select count(*)::integer from public.patients where id='30000000-0000-4000-8000-000000000002'),0,'foreign patient ID denied');
select is((select count(*)::integer from public.clinics),1,'clinic list scoped');
select is((select count(*)::integer from public.clinic_memberships),1,'membership list scoped');
select is((select count(*)::integer from public.profiles),1,'staff sees only own profile');
select is((select count(*)::integer from public.patient_account_links),0,'staff cannot enumerate patient account links');
-- Assert SQLSTATE rather than locale-dependent PostgreSQL error messages.
select throws_ok($$insert into public.clinic_memberships(clinic_id,user_id,role,active) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','dentist',true)$$,'42501',null,'cannot self-escalate');
select throws_ok($$update public.patients set clinic_id='10000000-0000-4000-8000-000000000002'$$,'42501',null,'cannot move patients across clinics');
select throws_ok($$insert into public.patients(clinic_id,reference,display_name) values ('10000000-0000-4000-8000-000000000001','UNAUTHORIZED','Synthetic unauthorized')$$,'42501',null,'staff cannot insert patient records directly');
select throws_ok($$delete from public.patients where id='30000000-0000-4000-8000-000000000001'$$,'42501',null,'staff cannot delete even an authorized patient');
select throws_ok($$select * from private.outbox_events$$,'42501',null,'staff cannot read private outbox');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.patients),1,'linked patient sees exactly own record');
select is((select count(*)::integer from public.patients where id='30000000-0000-4000-8000-000000000003'),0,'same-clinic other patient denied');
select is((select count(*)::integer from public.patient_account_links),1,'patient sees exactly own verified link');
select throws_ok($$insert into public.patient_account_links(user_id,clinic_id,patient_id) values ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002')$$,'42501',null,'cannot self-link');
select throws_ok($$update public.patient_account_links set patient_id='30000000-0000-4000-8000-000000000003'$$,'42501',null,'patient cannot replace a verified account link');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select is((select count(*)::integer from public.patients),0,'inactive member denied');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000005',true);
select is((select count(*)::integer from public.patients),0,'unverified link grants no patient access');
select is((select count(*)::integer from public.clinics),0,'unverified link grants no clinic access');
select is((select count(*)::integer from public.patient_account_links),0,'unverified account link is not exposed');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000006',true);
select is((select count(*)::integer from public.patients),0,'valid subject without membership or link is denied');

-- Revoke previously effective rights with trusted SQL, then re-evaluate RLS
-- using the same authenticated subject (no token refresh is required).
reset role;
update public.clinic_memberships set active=false where user_id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.patients),0,'revoked membership immediately loses patient reads');
select is((select count(*)::integer from public.clinic_memberships),0,'revoked membership is not exposed');
reset role;
update public.patient_account_links set verified_at=null,verified_by=null where user_id='20000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.patients),0,'revoked verification immediately loses own-patient access');
select set_config('request.jwt.claim.sub','',true);
select is((select count(*)::integer from public.patients),0,'no authenticated subject denied');
set local role anon;
select throws_ok($$select * from public.patients$$,'42501',null,'anonymous patient enumeration denied');
select throws_ok($$select * from public.profiles$$,'42501',null,'anonymous profile enumeration denied');
reset role;
select * from finish();
rollback;
