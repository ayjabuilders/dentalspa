# Versioned Domain Events — Envelope V1

## Envelope
```json
{
  "event_id": "uuid",
  "event_type": "AppointmentConfirmed",
  "event_version": 1,
  "clinic_id": "uuid",
  "aggregate_type": "appointment",
  "aggregate_id": "uuid",
  "occurred_at": "2026-10-26T10:00:00Z",
  "correlation_id": "uuid",
  "actor_ref": "pseudonymous reference",
  "payload": {"patient_id": "uuid", "resource_id": "uuid"}
}
```

## Delivery contract
Producer inserts domain write + outbox row atomically. Worker claims with lease, retries/backoff and dead-letter after policy-based threshold. Consumer stores processed `(consumer_id,event_id)` unique pair. Event schema evolution explicit; no breaking changes to v1 silently. Payload minimize PHI; never include voice transcript, clinical note content, sensitive credentials, access tokens or signed URLs.

## Proposed event ownership
`AppointmentConfirmed` scheduling; `PatientCheckedIn` reception/scheduling; `PatientCalled` clinic visit; `PatientRoomed` visit; `ConsultationStarted` clinical; `EncounterSigned` clinical; `TreatmentPlanApproved` treatment case; `TaskAssigned/Completed` workflow; `LabWorkReceived` lab; `PatientInstructionsPublished` clinical documents.

## Side-effect note
Appointment confirmation event may create eligible prep tasks and schedule notification **but confirmation event is not proof of message delivery**; notification delivery has its own state.
