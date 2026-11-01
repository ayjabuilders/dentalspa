-- Public booking contacts are not patient identities. Existing appointments stay
-- unlinked; a later authorized, audited association command must set this field.
-- In particular, never backfill by name, email, phone or synthetic scenario.
alter table private.configured_appointments add column patient_id uuid;
alter table private.configured_appointments
  add constraint configured_appointment_patient_tenant_fk
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id);
create index configured_appointments_patient_calendar
  on private.configured_appointments(clinic_id, patient_id, starts_at, id)
  where patient_id is not null;
comment on column private.configured_appointments.patient_id is
  'Explicit patient dossier association. NULL for unreviewed public contacts; never inferred from contact fields. Does not grant Patient Pass release or verify identity.';
-- No grants or patient-facing projection: tenant/role policies remain unchanged.
