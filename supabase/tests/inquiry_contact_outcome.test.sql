begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(29);

insert into public.clinics(id,name) values
  ('81000000-0000-4000-8000-000000000001','Synthetic outcome A'),
  ('81000000-0000-4000-8000-000000000002','Synthetic outcome B');
insert into auth.users(id) values
  ('82000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000002');
-- Authenticated fixtures include a live session; all rows roll back with this test.
insert into auth.sessions(id,user_id,not_after) values('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002',now()+interval '1 hour');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
  ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','reception',true),
  ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','manager',true);
insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,source,follow_up_at) values
  ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Synthetic Owner','synthetic@example.test','phone','2030-01-01T00:00:00Z'),
  ('83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','Synthetic Other',null,'phone',null),
  ('83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','Synthetic Foreign',null,'phone',null);

select is((select enabled from private.inquiry_contact_outcome_settings where singleton),false,'contact outcome setting defaults off');
select ok(not has_table_privilege('authenticated','private.inquiry_contact_outcomes','SELECT'),'clients cannot read private outcomes directly');
select ok(not has_table_privilege('authenticated','private.inquiry_contact_outcomes','INSERT'),'clients cannot write private outcomes directly');
select ok(not has_function_privilege('anon','public.record_inquiry_contact_outcome(uuid,uuid,uuid,jsonb,uuid)','EXECUTE'),'anonymous cannot execute record RPC');
select ok(not has_function_privilege('anon','public.list_inquiry_contact_outcomes(uuid,uuid)','EXECUTE'),'anonymous cannot execute read RPC');

select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
set local role authenticated;
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','{"outcome":"reached"}','85000000-0000-4000-8000-000000000001')$$,'PT503',null,'record is disabled pending privacy review');
select throws_ok($$select public.list_inquiry_contact_outcomes('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')$$,'PT503',null,'read projection is also disabled pending privacy review');
reset role;
update private.inquiry_contact_outcome_settings set enabled=true where singleton;
set local role authenticated;
select is(public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','{"outcome":"reached"}','85000000-0000-4000-8000-000000000001')->>'replayed','false','authorized owner records one factual event');
reset role;
select is((select outcome from private.inquiry_contact_outcomes where inquiry_id='83000000-0000-4000-8000-000000000001'),'reached','server stores the selected factual label');
set local role authenticated;
select is((public.list_inquiry_contact_outcomes('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')->'items'->0->>'outcome'),'reached','current owner can read the factual history');
select is((select status from public.inquiries where id='83000000-0000-4000-8000-000000000001'),'new','inquiry status remains unchanged');
select is((select follow_up_at from public.inquiries where id='83000000-0000-4000-8000-000000000001'),'2030-01-01T00:00:00Z'::timestamptz,'inquiry follow-up date remains unchanged');
reset role;
select is((select count(*)::integer from private.audit_events where action='InquiryContactOutcomeRecorded' and aggregate_id='83000000-0000-4000-8000-000000000001'),1,'write emits one audit row for the fixture inquiry');
select is((select payload-'contact_outcome_id'-'outcome'-'recorded_at' from private.outbox_events where event_type='InquiryContactOutcomeRecorded' and aggregate_id='83000000-0000-4000-8000-000000000001'),'{}'::jsonb,'outbox has only approved minimal fields');
set local role authenticated;
select is(public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','{"outcome":"reached"}','85000000-0000-4000-8000-000000000001')->>'replayed','true','exact command replay does not append');
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','{"outcome":"declined"}','85000000-0000-4000-8000-000000000001')$$,'PT409',null,'same key changed payload conflicts');
select is(public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002','{"outcome":"reached"}','85000000-0000-4000-8000-000000000001')->>'replayed','false','same outcome may be recorded as a separate later event');
reset role;
select is((select count(*)::integer from private.inquiry_contact_outcomes where inquiry_id='83000000-0000-4000-8000-000000000001'),2,'two independent events remain in history');
set local role authenticated;
select throws_ok($$select public.list_inquiry_contact_outcomes('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000003')$$,'PT404',null,'foreign-tenant inquiry is concealed');
select throws_ok($$select public.list_inquiry_contact_outcomes('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002')$$,'42501',null,'another owner cannot read outcomes');
reset role;
select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','{"outcome":"reached"}','85000000-0000-4000-8000-000000000001')$$,'42501',null,'non-owner cannot record outcome');
reset role;
update public.clinic_memberships set role='assistant' where clinic_id='81000000-0000-4000-8000-000000000001' and user_id='82000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','{"outcome":"reached"}','85000000-0000-4000-8000-000000000001')$$,'42501',null,'assistant role cannot record outcome');
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','{"outcome":"no_attempt"}','85000000-0000-4000-8000-000000000001')$$,'42501',null,'unauthorized role is denied before payload');
reset role;
update public.clinic_memberships set role='reception' where clinic_id='81000000-0000-4000-8000-000000000001' and user_id='82000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','{"outcome":"no_attempt"}','85000000-0000-4000-8000-000000000001')$$,'22023',null,'no-attempt baseline is not persisted as an event');
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','{"outcome":"reached","note":"secret"}','85000000-0000-4000-8000-000000000001')$$,'22023',null,'free-text and extra fields are rejected');
reset role;
select throws_ok($$update private.inquiry_contact_outcomes set outcome='declined'$$,'55000',null,'events cannot be changed');
select throws_ok($$delete from private.inquiry_contact_outcomes$$,'55000',null,'events cannot be deleted');
create function private.fail_contact_outcome_test() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;
create trigger fail_contact_outcome_test before insert on private.outbox_events for each row execute function private.fail_contact_outcome_test();
set local role authenticated;
select throws_ok($$select public.record_inquiry_contact_outcome('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000004','{"outcome":"declined"}','85000000-0000-4000-8000-000000000001')$$,'P0001','synthetic failure','outbox failure aborts the whole command');
reset role;
select is((select count(*)::integer from private.inquiry_contact_outcomes where inquiry_id='83000000-0000-4000-8000-000000000001'),2,'failed command leaves no partial event');
drop trigger fail_contact_outcome_test on private.outbox_events;
drop function private.fail_contact_outcome_test();
select * from finish();
rollback;
