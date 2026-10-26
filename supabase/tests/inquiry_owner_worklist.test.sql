begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(25);
insert into public.clinics(id,name) values('91000000-0000-4000-8000-000000000001','Synthetic Worklist A'),('91000000-0000-4000-8000-000000000002','Synthetic Worklist B');
insert into auth.users(id) values('92000000-0000-4000-8000-000000000001'),('92000000-0000-4000-8000-000000000002');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','reception',true),('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','manager',true);
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select set_config('request.method','POST',true);
select is((select enabled from private.intake_command_settings),false,'read projections require no write enablement');
select ok(not has_function_privilege('anon','public.inquiry_owner_worklist(uuid)','EXECUTE'),'anonymous execution denied');
set local role authenticated;
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'overdue'->'items'),0,'explicit empty overdue');
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'upcoming'->'items'),0,'explicit empty upcoming');
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'undated'->'items'),0,'explicit empty undated');
reset role;
insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,source,follow_up_at) values
('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Synthetic Due','synthetic@example.test','phone','2000-01-01Z'),
('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Synthetic Future',null,'phone','2099-01-01Z'),
('93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Synthetic Undated',null,'phone',null),
('93000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','Synthetic Foreign',null,'phone','2000-01-01Z'),
('93000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','Synthetic Other Owner',null,'phone','2000-01-01Z');
set local role authenticated;
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'overdue'->'items'),1,'only current-owner overdue');
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'upcoming'->'items'),1,'future due included');
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'undated'->'items'),1,'null due included');
select ok(not(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'overdue'->'items'->0 ? 'contact_email'),'worklist omits contact');
select is(public.get_owned_inquiry('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')->>'contact_email','synthetic@example.test','owner detail permits existing contact schema');
select throws_ok($$select public.get_owned_inquiry('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000004')$$,'PT404','Inquiry not found','foreign detail hidden');
select throws_ok($$select public.get_owned_inquiry('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000005')$$,'PT404','Inquiry not found','other-owner detail hidden');
select throws_ok($$select public.get_owned_inquiry('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000099')$$,'PT404','Inquiry not found','absent detail identical');
reset role;
update public.clinic_memberships set role='assistant' where user_id='92000000-0000-4000-8000-000000000001';
select throws_ok($$select public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')$$,'42501',null,'privileged path still denies assistant');
update public.clinic_memberships set role='reception',active=false where user_id='92000000-0000-4000-8000-000000000001';
select throws_ok($$select public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')$$,'42501',null,'privileged path denies revoked owner');
update public.clinic_memberships set active=true where user_id='92000000-0000-4000-8000-000000000001';
update public.inquiries set owner_user_id='92000000-0000-4000-8000-000000000002' where id='93000000-0000-4000-8000-000000000001';
select throws_ok($$select public.get_owned_inquiry('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')$$,'PT404','Inquiry not found','reassigned detail hidden even privileged');
update public.inquiries set owner_user_id='92000000-0000-4000-8000-000000000001' where id='93000000-0000-4000-8000-000000000001';
create temp table worklist_boundary(result jsonb);
with changed as(update public.inquiries set follow_up_at=statement_timestamp()+case when id='93000000-0000-4000-8000-000000000002' then interval '1 microsecond' else interval '0' end where id in('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002') returning id)
insert into worklist_boundary select public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001') from(select count(*) from changed)completed;
select is((select result->'overdue'->'items'->0->>'follow_up_at' from worklist_boundary),(select result->>'observed_at' from worklist_boundary),'exact boundary classified overdue');
select is((select result->'upcoming'->'items'->0->>'id' from worklist_boundary),'93000000-0000-4000-8000-000000000002','one microsecond after observation upcoming');
insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source,follow_up_at,created_at)
select ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Synthetic Bounded','phone',case when n<=51 then '1990-01-01Z'::timestamptz when n<=102 then '2090-01-01Z'::timestamptz else null end,'2030-01-01Z' from generate_series(1,153)n;
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'overdue'->'items'),50,'bounded overdue');
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'upcoming'->'items'),50,'bounded upcoming');
select is(jsonb_array_length(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'undated'->'items'),50,'bounded undated');
select ok((public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'overdue'->>'truncated')::boolean and (public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'upcoming'->>'truncated')::boolean and (public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'undated'->>'truncated')::boolean,'all partial lists explicit');
select is(public.inquiry_owner_worklist('91000000-0000-4000-8000-000000000001')->'undated'->'items'->0->>'id','94000000-0000-4000-8000-000000000153','descending undated tie ordering');
select is(public.get_owned_inquiry('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')->>'id','93000000-0000-4000-8000-000000000001','old detail remains accessible outside newest100');
select is((select count(*)::integer from private.outbox_events where clinic_id='91000000-0000-4000-8000-000000000001'),0,'read projections emit no event');
select * from finish();
rollback;
