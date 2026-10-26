# 09 — Security, Clinical Safety, Data Governance

## Non-negotiable policy
Deny by default. Multi-tenant boundaries at API, DB queries, files, realtime subscriptions, events, exports, and agent calls. Do not infer clinical privilege from managerial status.

## Access
Supabase Auth handles identity. Server NestJS verifies session/JWT and resolves clinic membership, patient linkage, role and resource scope. Explicit policy decisions for `read`, `create`, `edit`, `approve`, `publish`, `export`, `assign` and `sign` actions. Require MFA for sensitive roles when feasible. Test privileged service-role DB path separately from RLS.

## Patient Pass
Account must be verified and linked through secure enrollment/recovery; name or phone alone is insufficient. Patient sees only own documents marked patient-released, and only approved care summary. Signed URLs short-lived. Downloads/notifications need careful consent and no PHI on lock screen.

## Clinical integrity
Clinician approves diagnosis, treatment plan, progress gates, notes, prescriptions and advice; operational staff can perform only delegated tasks within competence. Preserve signed-note revision/amendment history. Do not hide missed clinical checks to simplify staffing. Keep audit for high-risk reads/exports and all writes.

## Privacy & hosting
Before real patient use: qualified review of Morocco Law 09-08 / CNDP, legal basis, consent/information, sensitive health data classification, retention schedules, cross-border transfers, Vercel/Supabase/AI vendor contracts and regional hosting. This package does **not** claim legal approval or verified residency. Keep all early demo data synthetic. Include backup and actual restore exercises.

## Smart Notes special rules
Consultation start ≠ audio capture start. Obtain suitable consent and visibly mark active microphone, pause/stop. No recording or raw transcript stored in database, file storage, service-worker cache, application logs, third-party observability, analytics or temp disk. Ephemeral processing only; vendor non-retention and applicable legal permissions must be verified. Store approved final note and patient instructions with source/version/auditor metadata, not raw transcript. The requirement to keep no raw recordings does not eliminate legal retention requirements for finalized clinical records.

## Incident posture
Manual fallback when offline, recovery runbook, access revocation, secret rotation, audit/alerting, backup restoration, event DLQ, AI kill switch. Produce operational audit reports without exposing more health data than required.
