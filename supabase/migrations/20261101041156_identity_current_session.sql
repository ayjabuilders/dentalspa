-- A boolean for the caller's own signed session; never expose auth.sessions.
create function public.is_current_session_active()
returns boolean language sql security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.sessions s
    where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after>clock_timestamp())
  );
$$;
revoke all on function public.is_current_session_active() from public,anon,authenticated;
grant execute on function public.is_current_session_active() to authenticated;
