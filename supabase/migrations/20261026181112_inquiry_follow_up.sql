-- Synthetic manual attestations only. No inquiry mutation, contact content or delivery.
create table private.inquiry_follow_ups (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  inquiry_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  kind text not null check(kind in ('contact_attempt','two_way_exchange')),
  channel text not null check(channel in ('phone','email','in_person','other_manual')),
  recorded_at timestamptz not null,
  event_version integer not null default 1 check(event_version=1),
  foreign key(clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
create index inquiry_follow_up_recent on private.inquiry_follow_ups(clinic_id,inquiry_id,recorded_at desc,id desc);
create table private.inquiry_follow_up_idempotency (
  clinic_id uuid not null references public.clinics(id),
  actor_id uuid not null references auth.users(id),
  inquiry_id uuid not null,
  command text not null check(command='record_follow_up'),
  request_key uuid not null,
  normalized_payload jsonb not null,
  receipt jsonb not null,
  primary key(clinic_id,actor_id,inquiry_id,command,request_key),
  foreign key(clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
alter table private.inquiry_follow_ups enable row level security;
alter table private.inquiry_follow_up_idempotency enable row level security;
revoke all on private.inquiry_follow_ups,private.inquiry_follow_up_idempotency from public,anon,authenticated;

create function private.reject_follow_up_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='Follow-up history is append-only';end $$;
revoke all on function private.reject_follow_up_mutation() from public,anon,authenticated;
create trigger inquiry_follow_up_append_only before update or delete on private.inquiry_follow_ups
for each row execute function private.reject_follow_up_mutation();

create function public.list_inquiry_follow_ups(p_clinic_id uuid,p_inquiry_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_owner uuid;v_items jsonb;v_count integer;
begin
  v_actor:=private.require_intake_staff(p_clinic_id);
  if p_inquiry_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid follow-up request';end if;
  -- Lock against concurrent ownership updates until the authorized projection completes.
  select owner_user_id into v_owner from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for share;
  if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
  perform private.require_intake_staff(p_clinic_id);
  if v_owner<>v_actor then raise exception using errcode='42501',message='Follow-up scope denied';end if;
  with recent as(select * from private.inquiry_follow_ups where clinic_id=p_clinic_id and inquiry_id=p_inquiry_id order by recorded_at desc,id desc limit 51),
    numbered as(select *,row_number()over(order by recorded_at desc,id desc) n from recent)
  select coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by recorded_at desc,id desc) filter(where n<=50),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>50);
end $$;

create function public.record_inquiry_follow_up(p_clinic_id uuid,p_inquiry_id uuid,p_request_key uuid,p_payload jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_owner uuid;v_prior private.inquiry_follow_up_idempotency;v_item private.inquiry_follow_ups;v_now timestamptz;v_receipt jsonb;
begin
  v_actor:=private.require_intake_staff(p_clinic_id);
  if p_inquiry_id is null or p_request_key is null or p_correlation_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid follow-up request';end if;
  -- One inquiry lock serializes retry insertion and protects current ownership.
  select owner_user_id into v_owner from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for update;
  if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
  perform private.require_intake_staff(p_clinic_id);
  if v_owner<>v_actor then raise exception using errcode='42501',message='Follow-up scope denied';end if;
  if not exists(select 1 from private.intake_command_settings where singleton and enabled) then raise exception using errcode='PT503',message='Intake commands are disabled';end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Invalid follow-up request';end if;
  if not(p_payload ?& array['kind','channel']) or (select count(*) from jsonb_object_keys(p_payload))<>2
    or jsonb_typeof(p_payload->'kind')<>'string' or jsonb_typeof(p_payload->'channel')<>'string'
    or p_payload->>'kind' not in ('contact_attempt','two_way_exchange') or p_payload->>'channel' not in ('phone','email','in_person','other_manual')
  then raise exception using errcode='22023',message='Invalid follow-up request';end if;
  select * into v_prior from private.inquiry_follow_up_idempotency where clinic_id=p_clinic_id and actor_id=v_actor and inquiry_id=p_inquiry_id and command='record_follow_up' and request_key=p_request_key;
  if found then
    if v_prior.normalized_payload<>p_payload then raise exception using errcode='PT409',message='Follow-up idempotency conflict';end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  v_now:=date_trunc('milliseconds',clock_timestamp());
  insert into private.inquiry_follow_ups(clinic_id,inquiry_id,actor_user_id,kind,channel,recorded_at)
    values(p_clinic_id,p_inquiry_id,v_actor,p_payload->>'kind',p_payload->>'channel',v_now) returning * into v_item;
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'InquiryFollowUpRecorded',p_inquiry_id,p_correlation_id,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'InquiryFollowUpRecorded',1,'inquiry',p_inquiry_id,p_correlation_id,v_actor,v_now,
      jsonb_build_object('follow_up_id',v_item.id,'inquiry_id',p_inquiry_id,'kind',v_item.kind,'channel',v_item.channel,'recorded_at',v_now));
  v_receipt:=jsonb_build_object('item',to_jsonb(v_item),'replayed',false);
  insert into private.inquiry_follow_up_idempotency values(p_clinic_id,v_actor,p_inquiry_id,'record_follow_up',p_request_key,p_payload,v_receipt);
  return v_receipt;
end $$;
revoke all on function public.list_inquiry_follow_ups(uuid,uuid),public.record_inquiry_follow_up(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.list_inquiry_follow_ups(uuid,uuid),public.record_inquiry_follow_up(uuid,uuid,uuid,jsonb,uuid) to authenticated;
