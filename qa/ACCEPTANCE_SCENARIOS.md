# Acceptance Scenarios in Given–When–Then form

## S01 Multi-clinic isolation
Given receptionist A in Clinic A and patient B in Clinic B, when A requests B's record by ID, then server responds with a safe denial; no patient metadata leaks; audit appropriate.

## S02 Patient account authorization
Given Patient A authenticated, when A requests Patient B's invoice, then access is denied even if the URL ID is known. Public booking must never link record automatically on a name match.

## S03 Double booking
Given one clinician/chair constrained slot, when two users confirm simultaneously, exactly one booking succeeds; the other receives current availability; no duplicate outbox events.

## S04 Team working alone
Given practitioner alone and approved visit template, when patient is called, only tasks the clinician may legally perform are assigned; mandatory readiness gates still block until completed.

## S05 Team handoff
Given assistant originally assigned escort task who goes offline mid-visit, when authorized staff reassign to a qualified replacement, old assignment history remains and completed tasks don't reset.

## S06 Source-derived lab loop
Given lab order manufactured but delivery QC not yet verified, when workflow tries to unlock veneer try-in, then next stage remains blocked; `Manufactured != ReadyForFitting`.

## S07 Service interest not treatment order
Given patient books 'Hollywood Smile' as interest, when appointment is confirmed, no clinical veneer procedure automatically scheduled or diagnosed. Dentist must validate real plan and template.

## S08 Signed draft protection
Given AI-generated draft clinical notes and patient instructions, when practitioner signs clinical note but not patient instructions, then clinical note is retained but Patient Pass displays no unapproved instructions.

## S09 No raw audio storage
Given Smart Notes streaming simulated with fixture and interrupted by network loss, when worker/errors/logging run, no original audio/raw transcript is present in DB, object storage, persistent filesystem, analytics or log sinks. Vendor due diligence remains a separate legal gate.

## S10 Patient timeline projection
Given phase `Lab manufacture` is internally blocked for rework, when patient requests their timeline, API returns only explicitly released patient-safe information and no internal staff comments or defect data.
