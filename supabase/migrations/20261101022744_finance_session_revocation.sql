begin;
-- Shared by Finance RPCs: reject revoked/expired sessions before any data access.
create or replace function private.authorize_local_quote_draft(p_clinic_id uuid,p_gate text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from auth.sessions s where s.user_id=v_actor
      and s.id::text=auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after>clock_timestamp())
  ) then raise exception using errcode='28000',message='unauthenticated'; end if;
  perform 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor and active and role='manager' for share;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  perform 1 from private.finance_draft_gates where clinic_id=p_clinic_id and enabled and synthetic_only and api_gate_key<>'' and api_gate_key=p_gate for share;
  if not found then raise exception using errcode='PT503',message='local_finance_disabled'; end if;
  return v_actor;
end $$;
revoke all on function private.authorize_local_quote_draft(uuid,text) from public,anon,authenticated,service_role;
commit;
