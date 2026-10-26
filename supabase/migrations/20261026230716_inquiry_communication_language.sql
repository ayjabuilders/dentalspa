-- Separate private language state. No inference, consent or delivery semantics.
create table private.inquiry_communication_languages (
 clinic_id uuid not null,inquiry_id uuid not null,
 language text check(language in ('fr','ar','en','other','no_preference')),
 revision integer not null check(revision>0),updated_at timestamptz not null,
 primary key(clinic_id,inquiry_id),foreign key(clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
create table private.inquiry_communication_language_receipts (
 clinic_id uuid not null,inquiry_id uuid not null,actor_id uuid not null references auth.users(id),
 command text not null check(command='set_communication_language'),request_key uuid not null,
 normalized_payload jsonb not null,receipt jsonb not null,
 primary key(clinic_id,actor_id,inquiry_id,command,request_key),
 foreign key(clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
alter table private.inquiry_communication_languages enable row level security;
alter table private.inquiry_communication_language_receipts enable row level security;
revoke all on private.inquiry_communication_languages,private.inquiry_communication_language_receipts from public,anon,authenticated;
create function private.reject_communication_language_receipt_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='Language receipts are immutable';end $$;
revoke all on function private.reject_communication_language_receipt_mutation() from public,anon,authenticated;
create trigger communication_language_receipt_immutable before update or delete on private.inquiry_communication_language_receipts for each row execute function private.reject_communication_language_receipt_mutation();

create function public.get_inquiry_communication_language(p_clinic_id uuid,p_inquiry_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_owner uuid;v_state private.inquiry_communication_languages;
begin
 v_actor:=private.require_intake_staff(p_clinic_id);
 if p_inquiry_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid language request';end if;
 select owner_user_id into v_owner from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for share;
 if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
 perform private.require_intake_staff(p_clinic_id);
 if v_owner<>v_actor then raise exception using errcode='PT404',message='Inquiry not found';end if;
 select * into v_state from private.inquiry_communication_languages where clinic_id=p_clinic_id and inquiry_id=p_inquiry_id;
 return jsonb_build_object('schema_version',1,'inquiry_id',p_inquiry_id,'clinic_id',p_clinic_id,'owner_user_id',v_actor,'language',v_state.language,'revision',coalesce(v_state.revision,0),'updated_at',to_char(v_state.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end $$;

create function public.set_inquiry_communication_language(p_clinic_id uuid,p_inquiry_id uuid,p_request_key uuid,p_payload jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_owner uuid;v_prior private.inquiry_communication_language_receipts;v_state private.inquiry_communication_languages;v_expected numeric;v_next text;v_revision integer;v_changed boolean;v_now timestamptz;v_recorded text;v_receipt jsonb;v_normalized jsonb;
begin
 if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
 if p_inquiry_id is null or p_request_key is null or p_correlation_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid language request';end if;
 -- The inquiry lock serializes initial state insertion, CAS and receipt replay.
 select owner_user_id into v_owner from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for update;
 if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
 perform private.require_intake_staff(p_clinic_id);
 if v_owner<>v_actor then raise exception using errcode='PT404',message='Inquiry not found';end if;
 if not exists(select 1 from private.intake_command_settings where singleton and enabled) then raise exception using errcode='PT503',message='Intake commands are disabled';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Invalid language request';end if;
 if not(p_payload ?& array['expected_revision','language']) or (select count(*) from jsonb_object_keys(p_payload))<>2 or jsonb_typeof(p_payload->'expected_revision')<>'number' or jsonb_typeof(p_payload->'language') not in ('null','string') then raise exception using errcode='22023',message='Invalid language request';end if;
 v_expected:=(p_payload->>'expected_revision')::numeric;v_next:=p_payload->>'language';
 if v_expected<0 or v_expected>2147483647 or v_expected<>trunc(v_expected) or (v_next is not null and v_next not in ('fr','ar','en','other','no_preference')) then raise exception using errcode='22023',message='Invalid language request';end if;
 v_normalized:=jsonb_build_object('expected_revision',v_expected::integer,'language',v_next);
 select * into v_prior from private.inquiry_communication_language_receipts where clinic_id=p_clinic_id and actor_id=v_actor and inquiry_id=p_inquiry_id and command='set_communication_language' and request_key=p_request_key;
 if found then
  if v_prior.normalized_payload<>v_normalized then raise exception using errcode='PT409',message='Language conflict';end if;
  return jsonb_build_object('receipt',v_prior.receipt,'replayed',true);
 end if;
 select * into v_state from private.inquiry_communication_languages where clinic_id=p_clinic_id and inquiry_id=p_inquiry_id;
 v_revision:=coalesce(v_state.revision,0);
 if v_revision<>v_expected then raise exception using errcode='PT409',message='Language conflict';end if;
 v_changed:=v_state.language is distinct from v_next;
 if v_changed and v_revision=2147483647 then raise exception using errcode='PT409',message='Language conflict';end if;
 v_now:=clock_timestamp();v_recorded:=to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 v_receipt:=jsonb_build_object('inquiry_id',p_inquiry_id,'clinic_id',p_clinic_id,'owner_user_id',v_actor,'previous_language',v_state.language,'language',v_next,'previous_revision',v_revision,'revision',v_revision+case when v_changed then 1 else 0 end,'changed',v_changed,'recorded_at',v_recorded,'event_version',1);
 if v_changed then
  insert into private.inquiry_communication_languages(clinic_id,inquiry_id,language,revision,updated_at) values(p_clinic_id,p_inquiry_id,v_next,v_revision+1,v_now)
  on conflict(clinic_id,inquiry_id) do update set language=excluded.language,revision=excluded.revision,updated_at=excluded.updated_at;
 end if;
 insert into private.inquiry_communication_language_receipts values(p_clinic_id,p_inquiry_id,v_actor,'set_communication_language',p_request_key,v_normalized,v_receipt);
 if v_changed then
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at) values(p_clinic_id,v_actor,'InquiryCommunicationLanguageChanged',p_inquiry_id,p_correlation_id,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload) values(p_clinic_id,'InquiryCommunicationLanguageChanged',1,'inquiry',p_inquiry_id,p_correlation_id,v_actor,v_now,jsonb_build_object('previous_language',v_state.language,'language',v_next,'previous_revision',v_revision,'revision',v_revision+1,'recorded_at',v_recorded));
 end if;
 return jsonb_build_object('receipt',v_receipt,'replayed',false);
end $$;
revoke all on function public.get_inquiry_communication_language(uuid,uuid),public.set_inquiry_communication_language(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.get_inquiry_communication_language(uuid,uuid),public.set_inquiry_communication_language(uuid,uuid,uuid,jsonb,uuid) to authenticated;
