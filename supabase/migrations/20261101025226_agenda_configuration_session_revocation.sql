begin;
create or replace function private.authorize_agenda_configuration(p_clinic_id uuid, p_gate_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists(select 1 from auth.sessions s where s.user_id=v_actor and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000', message='unauthenticated'; end if;
  perform 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id
    and m.user_id=v_actor and m.active and m.role='manager' for share;
  if not found then raise exception using errcode='42501', message='forbidden'; end if;
  if not exists(select 1 from private.agenda_configuration_gates g where g.clinic_id=p_clinic_id
    and g.enabled and g.synthetic_only and g.api_gate_key<>'' and g.api_gate_key=p_gate_key) then
    raise exception using errcode='PT503', message='local_configuration_disabled';
  end if;
  return v_actor;
end $$;
revoke all on function private.authorize_agenda_configuration(uuid,text) from public, anon, authenticated, service_role;


commit;