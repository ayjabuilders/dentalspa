-- Default-off local fake-provider inbox. Events contain fixed synthetic copy only.
create table private.demo_fake_inbox_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  api_gate_key text not null default ''
);
insert into private.demo_fake_inbox_settings(singleton,enabled) values (true,false);
alter table private.demo_fake_inbox_settings enable row level security;
revoke all on private.demo_fake_inbox_settings from public,anon,authenticated;

create table private.demo_fake_conversations (
  conversation_ref text primary key check (conversation_ref ~ '^DEMO-CHAT-[0-9]{3}$'),
  clinic_id uuid not null references public.clinics(id),
  fixture_version integer not null default 1 check (fixture_version=1),
  unique(clinic_id,conversation_ref)
);
alter table private.demo_fake_conversations enable row level security;
revoke all on private.demo_fake_conversations from public,anon,authenticated;
grant select on private.demo_fake_conversations to anon;
create policy demo_fake_conversation_anon_read on private.demo_fake_conversations
 for select to anon using (conversation_ref ~ '^DEMO-CHAT-[0-9]{3}$');

create table private.demo_fake_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  provider_event_id uuid not null,
  conversation_ref text not null,
  message_ref text not null check (message_ref ~ '^DEMO-MSG-[0-9]{3}-[0-9]{3}$'),
  sequence integer not null check (sequence between 1 and 1000000),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  text text not null check (text in (
    'Bonjour, le cabinet est-il ouvert samedi ?',
    'Bonjour, puis-je déplacer mon rendez-vous ?',
    'Bonjour, je souhaite connaître les horaires.'
  )),
  unique(provider_event_id),
  unique(message_ref),
  foreign key (clinic_id,conversation_ref) references private.demo_fake_conversations(clinic_id,conversation_ref)
);
create index demo_fake_inbound_recent on private.demo_fake_inbound_messages(clinic_id,received_at desc,id desc);
alter table private.demo_fake_inbound_messages enable row level security;
revoke all on private.demo_fake_inbound_messages from public,anon,authenticated;
grant insert (clinic_id,provider_event_id,conversation_ref,message_ref,sequence,occurred_at,text) on private.demo_fake_inbound_messages to anon;
-- INSERT ... ON CONFLICT and RETURNING require SELECT privileges. RLS has no anon SELECT policy.
grant select on private.demo_fake_inbound_messages to anon;
grant select (id,clinic_id,provider_event_id,conversation_ref,message_ref,sequence,occurred_at,received_at,text) on private.demo_fake_inbound_messages to authenticated;

create function private.demo_fake_inbox_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((select enabled from private.demo_fake_inbox_settings where singleton),false)
$$;
revoke all on function private.demo_fake_inbox_enabled() from public,anon,authenticated;
grant execute on function private.demo_fake_inbox_enabled() to anon,authenticated;

create function private.demo_fake_inbox_gate_valid(p_gate_key text) returns boolean
language sql volatile security definer set search_path = '' as $$
 select coalesce((select enabled and api_gate_key<>'' and api_gate_key=p_gate_key from private.demo_fake_inbox_settings where singleton),false)
$$;
revoke all on function private.demo_fake_inbox_gate_valid(text) from public,anon,authenticated;
grant execute on function private.demo_fake_inbox_gate_valid(text) to anon;
grant usage on schema private to anon,authenticated;

create policy demo_fake_inbound_anon_insert on private.demo_fake_inbound_messages
 for insert to anon with check (
   private.demo_fake_inbox_enabled()
   and exists(select 1 from private.demo_fake_conversations c where c.conversation_ref=demo_fake_inbound_messages.conversation_ref and c.clinic_id=demo_fake_inbound_messages.clinic_id)
   and provider_event_id is not null
   and sequence between 1 and 1000000
   and message_ref ~ '^DEMO-MSG-[0-9]{3}-[0-9]{3}$'
   and text in ('Bonjour, le cabinet est-il ouvert samedi ?','Bonjour, puis-je déplacer mon rendez-vous ?','Bonjour, je souhaite connaître les horaires.')
 );
create policy demo_fake_inbound_staff_read on private.demo_fake_inbound_messages
 for select to authenticated using (
   exists(select 1 from public.clinic_memberships m where m.clinic_id=demo_fake_inbound_messages.clinic_id and m.user_id=(select auth.uid()) and m.active and m.role in ('reception','manager'))
 );

create function private.audit_demo_fake_inbound_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
 values(new.clinic_id,'00000000-0000-0000-0000-000000000000'::uuid,'DemoInboundMessageReceived',new.id,new.provider_event_id,new.received_at);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
 values(new.clinic_id,'DemoInboundMessageReceived',1,'demo_fake_inbound_message',new.id,new.provider_event_id,'00000000-0000-0000-0000-000000000000'::uuid,new.received_at,
   jsonb_build_object('conversation_ref',new.conversation_ref,'message_ref',new.message_ref,'status','received'));
 return new;
end
$$;
revoke all on function private.audit_demo_fake_inbound_message() from public,anon,authenticated;
create trigger demo_fake_inbound_audit_outbox after insert on private.demo_fake_inbound_messages
 for each row execute function private.audit_demo_fake_inbound_message();

create function private.reject_demo_fake_inbound_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception using errcode='55000',message='Synthetic inbound history is append-only'; end $$;
revoke all on function private.reject_demo_fake_inbound_mutation() from public,anon,authenticated;
create trigger demo_fake_inbound_append_only before update or delete on private.demo_fake_inbound_messages
 for each row execute function private.reject_demo_fake_inbound_mutation();

-- The Data API can invoke this narrow function, but the local API additionally verifies exact-body HMAC.
create function public.accept_demo_fake_inbound_message(
 p_gate_key text,p_provider_event_id uuid,p_conversation_ref text,p_message_ref text,p_sequence integer,p_occurred_at timestamptz,p_text text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_clinic_id uuid;v_id uuid;v_prior private.demo_fake_inbound_messages;
begin
 if not private.demo_fake_inbox_gate_valid(p_gate_key) then raise exception using errcode='42501',message='local fake inbox is disabled';end if;
 if p_provider_event_id is null or p_conversation_ref !~ '^DEMO-CHAT-[0-9]{3}$' or p_message_ref !~ '^DEMO-MSG-[0-9]{3}-[0-9]{3}$'
    or p_sequence not between 1 and 1000000 or p_occurred_at is null or p_text not in ('Bonjour, le cabinet est-il ouvert samedi ?','Bonjour, puis-je déplacer mon rendez-vous ?','Bonjour, je souhaite connaître les horaires.')
    or coalesce(current_setting('request.method',true),'')<>'POST' then
   raise exception using errcode='22023',message='Invalid synthetic inbound event';
 end if;
 select clinic_id into v_clinic_id from private.demo_fake_conversations where conversation_ref=p_conversation_ref;
 if not found then raise exception using errcode='42501',message='Synthetic conversation scope denied';end if;
 insert into private.demo_fake_inbound_messages(clinic_id,provider_event_id,conversation_ref,message_ref,sequence,occurred_at,text)
 values(v_clinic_id,p_provider_event_id,p_conversation_ref,p_message_ref,p_sequence,p_occurred_at,p_text)
 on conflict do nothing returning id into v_id;
 if v_id is not null then return jsonb_build_object('accepted',true,'disposition','recorded-inbound');end if;
 select * into v_prior from private.demo_fake_inbound_messages where provider_event_id=p_provider_event_id;
 if found then
   if (v_prior.conversation_ref,v_prior.message_ref,v_prior.sequence,v_prior.occurred_at,v_prior.text) is distinct from (p_conversation_ref,p_message_ref,p_sequence,p_occurred_at,p_text) then
     raise exception using errcode='PT409',message='Synthetic event identifier conflict';
   end if;
   return jsonb_build_object('accepted',true,'disposition','duplicate-event');
 end if;
 select * into v_prior from private.demo_fake_inbound_messages where message_ref=p_message_ref;
 if found then
   if (v_prior.conversation_ref,v_prior.sequence,v_prior.occurred_at,v_prior.text) is distinct from (p_conversation_ref,p_sequence,p_occurred_at,p_text) then
     raise exception using errcode='PT409',message='Synthetic message identifier conflict';
   end if;
   return jsonb_build_object('accepted',true,'disposition','duplicate-message');
 end if;
 raise exception using errcode='PT409',message='Synthetic event conflict';
end
$$;
revoke all on function public.accept_demo_fake_inbound_message(text,uuid,text,text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.accept_demo_fake_inbound_message(text,uuid,text,text,integer,timestamptz,text) to anon;

create function public.list_demo_fake_inbound_messages(p_clinic_id uuid)
returns table(id uuid,conversation_ref text,message_ref text,sequence integer,text text,occurred_at timestamptz,received_at timestamptz)
language sql stable security invoker set search_path = '' as $$
 select m.id,m.conversation_ref,m.message_ref,m.sequence,m.text,m.occurred_at,m.received_at
 from private.demo_fake_inbound_messages m where m.clinic_id=p_clinic_id order by m.received_at desc,m.id desc limit 100
$$;
revoke all on function public.list_demo_fake_inbound_messages(uuid) from public,anon,authenticated;
grant execute on function public.list_demo_fake_inbound_messages(uuid) to authenticated;
