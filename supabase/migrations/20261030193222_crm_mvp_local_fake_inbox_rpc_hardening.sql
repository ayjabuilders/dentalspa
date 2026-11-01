-- Keep anonymous table privileges closed; the only write path is a narrow,
-- local-keyed private definer reached through the bounded public RPC.
revoke all on private.demo_fake_inbound_messages from public,anon,authenticated;
grant select (id,clinic_id,provider_event_id,conversation_ref,message_ref,sequence,occurred_at,received_at,text) on private.demo_fake_inbound_messages to authenticated;
revoke select on private.demo_fake_conversations from anon;
drop policy demo_fake_conversation_anon_read on private.demo_fake_conversations;
drop policy demo_fake_inbound_anon_insert on private.demo_fake_inbound_messages;

create function private.record_demo_fake_inbound_message(
 p_gate_key text,p_provider_event_id uuid,p_conversation_ref text,p_message_ref text,p_sequence integer,p_occurred_at timestamptz,p_text text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_clinic_id uuid;v_id uuid;v_prior private.demo_fake_inbound_messages;
begin
 if not private.demo_fake_inbox_gate_valid(p_gate_key) then raise exception using errcode='42501',message='local fake inbox is disabled';end if;
 if p_provider_event_id is null or p_conversation_ref is null or p_conversation_ref !~ '^DEMO-CHAT-[0-9]{3}$'
    or p_message_ref is null or p_message_ref !~ '^DEMO-MSG-[0-9]{3}-[0-9]{3}$'
    or p_sequence is null or p_sequence not between 1 and 1000000 or p_occurred_at is null
    or p_text is null or p_text not in ('Bonjour, le cabinet est-il ouvert samedi ?','Bonjour, puis-je déplacer mon rendez-vous ?','Bonjour, je souhaite connaître les horaires.')
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
revoke all on function private.record_demo_fake_inbound_message(text,uuid,text,text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function private.record_demo_fake_inbound_message(text,uuid,text,text,integer,timestamptz,text) to anon;

create or replace function public.accept_demo_fake_inbound_message(
 p_gate_key text,p_provider_event_id uuid,p_conversation_ref text,p_message_ref text,p_sequence integer,p_occurred_at timestamptz,p_text text
) returns jsonb
language sql security invoker set search_path = '' as $$
 select private.record_demo_fake_inbound_message(p_gate_key,p_provider_event_id,p_conversation_ref,p_message_ref,p_sequence,p_occurred_at,p_text)
$$;
revoke all on function public.accept_demo_fake_inbound_message(text,uuid,text,text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.accept_demo_fake_inbound_message(text,uuid,text,text,integer,timestamptz,text) to anon;
