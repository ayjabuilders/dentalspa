-- AND these checks with existing tenant/role policies; no new read authority.
create policy current_session_read on public.profiles as restrictive
  for select to authenticated using ((select public.is_current_session_active()));
create policy current_session_read on public.clinic_memberships as restrictive
  for select to authenticated using ((select public.is_current_session_active()));
create policy current_session_read on public.patient_account_links as restrictive
  for select to authenticated using ((select public.is_current_session_active()));
create policy current_session_read on public.clinics as restrictive
  for select to authenticated using ((select public.is_current_session_active()));
create policy current_session_read on public.patients as restrictive
  for select to authenticated using ((select public.is_current_session_active()));
create policy current_session_read on public.inquiries as restrictive
  for select to authenticated using ((select public.is_current_session_active()));
