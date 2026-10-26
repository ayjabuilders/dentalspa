-- M02.1 manual intake only. No registration, merge, appointment or external send.
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  owner_user_id uuid not null references auth.users(id),
  display_name text not null check (char_length(display_name) between 1 and 120),
  contact_email text check (char_length(contact_email) <= 254),
  contact_phone text check (char_length(contact_phone) between 3 and 40),
  source text not null check (source in ('phone','website','whatsapp','instagram','email','google_business','walk_in','other')),
  follow_up_at timestamptz,
  status text not null default 'new' check (status='new'),
  created_at timestamptz not null default now(),
  unique (clinic_id,id)
);
create index inquiry_clinic_recent on public.inquiries(clinic_id,created_at desc,id desc);
alter table public.inquiries enable row level security;
revoke all on public.inquiries from public,anon,authenticated;
grant select on public.inquiries to authenticated;
create policy inquiry_authorized_staff on public.inquiries for select to authenticated using (
  exists (select 1 from public.clinic_memberships m where m.clinic_id=inquiries.clinic_id
    and m.user_id=(select auth.uid()) and m.active and m.role in ('reception','manager','dentist'))
);

create table private.intake_command_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into private.intake_command_settings(singleton,enabled) values(true,false);
alter table private.intake_command_settings enable row level security;
revoke all on private.intake_command_settings from public,anon,authenticated;

create table private.intake_idempotency (
  clinic_id uuid not null references public.clinics(id),
  actor_id uuid not null references auth.users(id),
  request_key uuid not null,
  normalized_payload jsonb not null,
  inquiry_id uuid,
  created_at timestamptz not null default now(),
  primary key(clinic_id,actor_id,request_key),
  foreign key(clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
alter table private.intake_idempotency enable row level security;
revoke all on private.intake_idempotency from public,anon,authenticated;

create function private.require_intake_staff(p_clinic_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_clinic_id is null or not exists(select 1 from public.clinic_memberships m
    where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.active and m.role in ('reception','manager','dentist'))
  then raise exception using errcode='42501',message='Intake scope denied'; end if;
  return v_actor;
end $$;
revoke all on function private.require_intake_staff(uuid) from public,anon,authenticated;

-- JSON input is revalidated here because authenticated callers can invoke RPC directly.
create function public.create_inquiry(p_clinic_id uuid,p_request_key uuid,p_payload jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  v_actor uuid;
  v_name text;
  v_email text;
  v_phone text;
  v_source text;
  v_follow_up timestamptz;
  v_payload jsonb;
  v_existing private.intake_idempotency%rowtype;
  v_item public.inquiries%rowtype;
begin
  v_actor := private.require_intake_staff(p_clinic_id);
  if not exists(select 1 from private.intake_command_settings where singleton and enabled) then
    raise exception using errcode='PT503',message='Intake commands are disabled';
  end if;
  if p_request_key is null or p_correlation_id is null or p_payload is null
    or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode='22023',message='Invalid inquiry input';
  end if;
  if not (p_payload ?& array['display_name','contact_email','contact_phone','source','follow_up_at'])
    or (select count(*) from jsonb_object_keys(p_payload)) <> 5
    or jsonb_typeof(p_payload->'display_name') <> 'string'
    or jsonb_typeof(p_payload->'source') <> 'string'
    or jsonb_typeof(p_payload->'contact_email') not in ('string','null')
    or jsonb_typeof(p_payload->'contact_phone') not in ('string','null')
    or jsonb_typeof(p_payload->'follow_up_at') not in ('string','null') then
    raise exception using errcode='22023',message='Invalid inquiry input';
  end if;
  -- JS trim whitespace set, shared with CreateInquirySchema's trim normalization.
  v_name := btrim(p_payload->>'display_name', E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279));
  v_phone := btrim(p_payload->>'contact_phone', E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279));
  v_email := p_payload->>'contact_email'; v_source := p_payload->>'source';
  if char_length(v_name) not between 1 and 120 or v_source not in ('phone','website','whatsapp','instagram','email','google_business','walk_in','other')
    or (v_phone is not null and (char_length(v_phone) not between 3 and 40 or v_phone !~ '^[+0-9() .-]+$'))
    or (v_email is not null and (char_length(v_email)>254 or v_email !~ '^([A-Za-z0-9_+''-]+\.)*[A-Za-z0-9_+''-]*[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$')) then
    raise exception using errcode='22023',message='Invalid inquiry input';
  end if;
  -- Locked Zod 4.6.7 max_length counts Unicode codepoints, as char_length does.
  if p_payload->>'follow_up_at' is not null then
    if p_payload->>'follow_up_at' !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$' then
      raise exception using errcode='22023',message='Invalid inquiry input';
    end if;
    begin v_follow_up := (p_payload->>'follow_up_at')::timestamptz;
    exception when others then raise exception using errcode='22023',message='Invalid inquiry input'; end;
    -- The frozen response is four-digit ISO, so reject instants whose UTC
    -- normalization would produce BC or five-digit years before any write.
    if extract(year from v_follow_up) not between 1 and 9999 then
      raise exception using errcode='22023',message='Invalid inquiry input';
    end if;
  end if;
  v_payload := jsonb_build_object('display_name',v_name,'contact_email',v_email,'contact_phone',v_phone,'source',v_source,'follow_up_at',v_follow_up);
  -- Unique scope serializes concurrent retries. The losing insert waits for the
  -- creator transaction; the following statement reads its committed result.
  insert into private.intake_idempotency(clinic_id,actor_id,request_key,normalized_payload)
    values(p_clinic_id,v_actor,p_request_key,v_payload) on conflict do nothing;
  select * into strict v_existing from private.intake_idempotency
    where clinic_id=p_clinic_id and actor_id=v_actor and request_key=p_request_key for update;
  if v_existing.normalized_payload <> v_payload then
    raise exception using errcode='PT409',message='Idempotency key conflicts with another inquiry';
  end if;
  if v_existing.inquiry_id is not null then
    select * into strict v_item from public.inquiries where clinic_id=p_clinic_id and id=v_existing.inquiry_id;
    return jsonb_build_object('item',to_jsonb(v_item),'replayed',true);
  end if;
  insert into public.inquiries(clinic_id,owner_user_id,display_name,contact_email,contact_phone,source,follow_up_at)
    values(p_clinic_id,v_actor,v_name,v_email,v_phone,v_source,v_follow_up) returning * into v_item;
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id)
    values(p_clinic_id,v_actor,'InquiryCreated',v_item.id,p_correlation_id);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref)
    values(p_clinic_id,'InquiryCreated',1,v_item.id,p_correlation_id,v_actor);
  update private.intake_idempotency set inquiry_id=v_item.id where clinic_id=p_clinic_id and actor_id=v_actor and request_key=p_request_key;
  return jsonb_build_object('item',to_jsonb(v_item),'replayed',false);
end $$;
revoke all on function public.create_inquiry(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_inquiry(uuid,uuid,jsonb,uuid) to authenticated;

create function public.list_inquiries(p_clinic_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_items jsonb; v_count integer;
begin
  perform private.require_intake_staff(p_clinic_id);
  with recent as (select * from public.inquiries where clinic_id=p_clinic_id order by created_at desc,id desc limit 101),
    numbered as (select recent.*,row_number() over(order by created_at desc,id desc) as row_number from recent)
  select coalesce(jsonb_agg(to_jsonb(numbered)-'row_number' order by created_at desc,id desc) filter(where row_number<=100),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>100);
end $$;
revoke all on function public.list_inquiries(uuid) from public,anon,authenticated;
grant execute on function public.list_inquiries(uuid) to authenticated;
