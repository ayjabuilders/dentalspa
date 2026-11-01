import { describe, expect, it } from 'vitest';
import {
  PatientAdminChecklistListSchema,
  PatientAdminChecklistResultSchema,
  SetPatientAdminChecklistSchema,
} from '../../packages/contracts/src/patient-admin-checklist';

const clinic = '10000000-0000-4000-8000-000000000001';
const patient = '30000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const item = { clinic_id: clinic, patient_id: patient, kind: 'cnss', status: 'received', revision: 1, updated_at: '2026-10-30T00:00:00.000Z', updated_by: actor };

describe('patient admin checklist contracts', () => {
  it('accepts only the exact PRD manual status and category vocabularies', () => {
    expect(SetPatientAdminChecklistSchema.safeParse({ expected_revision: 0, kind: 'cnops', status: 'not_applicable' }).success).toBe(true);
    for (const status of ['not_applicable', 'missing', 'received', 'needs_correction', 'completed_manually']) {
      expect(SetPatientAdminChecklistSchema.safeParse({ expected_revision: 0, kind: 'cnss', status }).success).toBe(true);
    }
    for (const extra of [
      { note: 'private text' }, { claim_status: 'approved' }, { eligibility: true },
      { kind: 'identity' }, { status: 'reimbursed' }, { uploaded_file: 'x.pdf' },
    ]) expect(SetPatientAdminChecklistSchema.safeParse({ expected_revision: 0, kind: 'cnss', status: 'received', ...extra }).success).toBe(false);
  });

  it('requires bounded non-negative revisions and rejects unknown fields', () => {
    for (const expected_revision of [-1, 1.5, 2_147_483_647]) {
      expect(SetPatientAdminChecklistSchema.safeParse({ expected_revision, kind: 'cnss', status: 'received' }).success).toBe(false);
    }
    expect(SetPatientAdminChecklistSchema.safeParse({ expected_revision: 0, kind: 'cnss', status: 'received', clinic_id: clinic }).success).toBe(false);
  });

  it('accepts an empty new checklist and validates the bounded item shape', () => {
    expect(PatientAdminChecklistListSchema.safeParse({ schema_version: 1, clinic_id: clinic, patient_id: patient, items: [] }).success).toBe(true);
    // The application service enforces unique checklist kinds and envelope/item scope consistency.
    expect(PatientAdminChecklistListSchema.safeParse({ schema_version: 1, clinic_id: clinic, patient_id: patient, items: [item, item] }).success).toBe(true);
    expect(PatientAdminChecklistListSchema.safeParse({ schema_version: 1, clinic_id: clinic, patient_id: patient, items: [{ ...item, clinic_id: '10000000-0000-4000-8000-000000000002' }] }).success).toBe(true);
  });

  it('requires the responsible active staff identity and server timestamp in persisted state', () => {
    expect(PatientAdminChecklistResultSchema.safeParse({ item, replayed: false }).success).toBe(true);
    expect(PatientAdminChecklistResultSchema.safeParse({ item: { ...item, updated_by: undefined }, replayed: false }).success).toBe(false);
    expect(PatientAdminChecklistResultSchema.safeParse({ item: { ...item, updated_at: 'yesterday' }, replayed: false }).success).toBe(false);
  });
});
