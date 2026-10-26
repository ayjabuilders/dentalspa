create table private.inquiry_schedule_receipts (
 clinic_id uuid not null,actor_id uuid not null references auth.users(id),inquiry_id uuid not null,
 command text not null check(command='set_follow_up_schedule'),request_key uuid not null,
 normalized_payload jsonb not null,receipt jsonb not null,
 primary key(clinic_id,actor_id,inquiry_id,command,request_key),
 foreign key(clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
alter table private.inquiry_schedule_receipts enable row level security;
revoke all on private.inquiry_schedule_receipts from public,anon,authenticated;
create function private.reject_inquiry_schedule_receipt_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='Schedule receipts are immutable';end $$;
create trigger inquiry_schedule_receipt_immutable before update or delete on private.inquiry_schedule_receipts for each row execute function private.reject_inquiry_schedule_receipt_mutation();
revoke all on function private.reject_inquiry_schedule_receipt_mutation() from public,anon,authenticated;
-- Parse ISO offsets explicitly: PostgreSQL's native offset parser has a narrower
-- offset range than the frozen ISO contract. Reject rounding, year zero and UTC overflow.
create function private.inquiry_schedule_instant(value jsonb) returns timestamptz language plpgsql immutable set search_path='' set timezone='UTC' as $$
declare s text;local_time timestamp;utc_time timestamp;offset_minutes integer:=0;zone text;
begin
 if value='null'::jsonb then return null;end if;
 if value is null or jsonb_typeof(value)<>'string' then raise exception using errcode='22023',message='Invalid schedule instant';end if;
 s:=value#>>'{}';
 if s!~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' or left(s,4)='0000' then raise exception using errcode='22023',message='Invalid schedule instant';end if;
 zone:=substring(s from '(Z|[+-][0-9]{2}:[0-9]{2})$');
 local_time:=left(s,length(s)-length(zone))::timestamp;
 if zone<>'Z' then offset_minutes:=(substring(zone,2,2)::integer*60+substring(zone,5,2)::integer)*case when left(zone,1)='-' then -1 else 1 end;end if;
 utc_time:=local_time-make_interval(mins=>offset_minutes);
 if utc_time<timestamp '0001-01-01' or utc_time>=timestamp '10000-01-01' then raise exception using errcode='22023',message='Invalid schedule instant';end if;
 return utc_time at time zone 'UTC';
exception when datetime_field_overflow or invalid_datetime_format then raise exception using errcode='22023',message='Invalid schedule instant';
end $$;
revoke all on function private.inquiry_schedule_instant(jsonb) from public,anon,authenticated;
create function public.set_inquiry_follow_up_schedule(p_clinic_id uuid,p_inquiry_id uuid,p_request_key uuid,p_payload jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_row public.inquiries;v_prior private.inquiry_schedule_receipts;v_expected timestamptz;v_requested timestamptz;v_normalized jsonb;v_receipt jsonb;v_now text;v_previous text;v_next text;v_changed boolean;
begin
 if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
 if p_inquiry_id is null or p_request_key is null or p_correlation_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid schedule request';end if;
 select * into v_row from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for update;
 if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
 perform private.require_intake_staff(p_clinic_id);
 if v_row.owner_user_id<>v_actor then raise exception using errcode='PT404',message='Inquiry not found';end if;
 if not exists(select 1 from private.intake_command_settings where singleton and enabled) then raise exception using errcode='PT503',message='Intake commands are disabled';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Invalid schedule request';end if;
 if not(p_payload ?& array['expected_follow_up_at','follow_up_at']) or (select count(*) from jsonb_object_keys(p_payload))<>2 then raise exception using errcode='22023',message='Invalid schedule request';end if;
 v_expected:=private.inquiry_schedule_instant(p_payload->'expected_follow_up_at');v_requested:=private.inquiry_schedule_instant(p_payload->'follow_up_at');
 v_normalized:=jsonb_build_object('expected_follow_up_at',to_char(v_expected,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'follow_up_at',to_char(v_requested,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 select * into v_prior from private.inquiry_schedule_receipts where clinic_id=p_clinic_id and actor_id=v_actor and inquiry_id=p_inquiry_id and command='set_follow_up_schedule' and request_key=p_request_key;
 if found then
  if v_prior.normalized_payload<>v_normalized then raise exception using errcode='PT409',message='Schedule conflict';end if;
  return jsonb_build_object('receipt',v_prior.receipt,'replayed',true);
 end if;
 if v_row.follow_up_at is distinct from v_expected then raise exception using errcode='PT409',message='Schedule conflict';end if;
 v_changed:=v_expected is distinct from v_requested;v_now:=to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');v_previous:=to_char(v_expected,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');v_next:=to_char(v_requested,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 v_receipt:=jsonb_build_object('inquiry_id',p_inquiry_id,'clinic_id',p_clinic_id,'owner_user_id',v_actor,'previous_follow_up_at',v_previous,'follow_up_at',v_next,'changed',v_changed,'recorded_at',v_now,'event_version',1);
 if v_changed then update public.inquiries set follow_up_at=v_requested where clinic_id=p_clinic_id and id=p_inquiry_id;end if;
 insert into private.inquiry_schedule_receipts values(p_clinic_id,v_actor,p_inquiry_id,'set_follow_up_schedule',p_request_key,v_normalized,v_receipt);
 if v_changed then
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at) values(p_clinic_id,v_actor,'InquiryFollowUpScheduleChanged',p_inquiry_id,p_correlation_id,v_now::timestamptz);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload) values(p_clinic_id,'InquiryFollowUpScheduleChanged',1,'inquiry',p_inquiry_id,p_correlation_id,v_actor,v_now::timestamptz,jsonb_build_object('previous_follow_up_at',v_previous,'follow_up_at',v_next,'recorded_at',v_now));
 end if;
 return jsonb_build_object('receipt',v_receipt,'replayed',false);
end $$;
revoke all on function public.set_inquiry_follow_up_schedule(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.set_inquiry_follow_up_schedule(uuid,uuid,uuid,jsonb,uuid) to authenticated;
