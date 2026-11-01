-- Existing synthetic LOCAL seed only. All changes, including the test session,
-- are rolled back. Run with psql ON_ERROR_STOP; never target a live clinic.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
do $$begin
  if not exists(select 1 from public.clinics where id='10000000-0000-4000-8000-000000000001'
    and name='Cabinet Dentaire Atlas - Casablanca (FICTIF)') then raise exception 'Synthetic clinic required'; end if;
end$$;
create temporary table association_context as
select a.clinic_id,a.id appointment_id,a.version initial_version,m.user_id,
  p.id patient_id,other.id foreign_patient_id,g.api_gate_key,
  gen_random_uuid() session_id,gen_random_uuid() request_key,gen_random_uuid() unlink_key,
  (select count(*) from private.audit_events where aggregate_id=a.id) audit_count,
  (select count(*) from private.outbox_events where aggregate_id=a.id) event_count,
  (select count(*) from public.patient_account_links) link_count
from private.configured_appointments a
join public.clinic_memberships m on m.clinic_id=a.clinic_id and m.active and m.role='manager'
join private.agenda_configuration_gates g on g.clinic_id=a.clinic_id and g.enabled and g.synthetic_only and g.confirmations_enabled
join public.patients p on p.clinic_id=a.clinic_id and p.id is distinct from a.patient_id
join public.patients other on other.clinic_id<>a.clinic_id
where a.clinic_id='10000000-0000-4000-8000-000000000001' order by a.id,p.id limit 1;
do $$begin if (select count(*) from association_context)<>1 then raise exception 'Configured synthetic fixture required'; end if; end$$;
insert into auth.sessions(id,user_id,not_after) select session_id,user_id,now()+interval '10 minutes' from association_context;
do $$declare c association_context;begin
  select * into c from association_context;
  perform set_config('request.jwt.claim.sub',c.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.user_id,'session_id',c.session_id)::text,true);
end$$;
grant select on association_context to authenticated;
create function pg_temp.associate_fixture(kind text default 'link') returns jsonb language sql as $$
  select public.associate_local_configured_appointment_patient(clinic_id,appointment_id,
    case when kind='unlink' then null when kind='foreign' then foreign_patient_id else patient_id end,
    case when kind='stale' then initial_version+9 when kind in ('unlink','foreign') then initial_version+1 else initial_version end,
    case when kind in ('stale','foreign','unlink') then unlink_key else request_key end,api_gate_key)
  from association_context
$$;
grant execute on function pg_temp.associate_fixture(text) to authenticated;
select plan(10);
set local role authenticated;
select is(pg_temp.associate_fixture()->>'association_status','possible_match','records possible match');
select is(pg_temp.associate_fixture()->>'replayed','true','same command replays');
select is(pg_temp.associate_fixture()->>'identity_verified','false','does not verify identity');
select throws_ok($$select pg_temp.associate_fixture('stale')$$,'SH409',null,'stale version rejected');
select throws_ok($$select pg_temp.associate_fixture('foreign')$$,'SH404',null,'foreign patient rejected');
reset role;
select is((select count(*) from private.audit_events where aggregate_id=(select appointment_id from association_context)),
  (select audit_count+1 from association_context),'exactly one audit after replays and rejected commands');
select is((select count(*) from private.outbox_events where aggregate_id=(select appointment_id from association_context)),
  (select event_count+1 from association_context),'exactly one outbox event');
select is((select count(*) from public.patient_account_links),(select link_count from association_context),'no patient account link created');
set local role authenticated;
select is(pg_temp.associate_fixture('unlink')->>'association_status','unlinked','explicit unlink works');
reset role;
delete from auth.sessions where id=(select session_id from association_context);
set local role authenticated;
select throws_ok($$select pg_temp.associate_fixture()$$,'28000',null,'revoked session cannot replay');
reset role;
select * from finish();
rollback;
