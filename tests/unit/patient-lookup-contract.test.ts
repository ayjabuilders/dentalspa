import { describe, expect, it } from 'vitest';
import {
  PatientLookupRequestSchema,
  PatientLookupResponseSchema,
} from '../../packages/contracts/src/patient-lookup';

const clinicId = '00000000-0000-4000-8000-000000000001';
const patientId = '00000000-0000-4000-8000-000000000002';

describe('patient lookup frozen contract', () => {
  it('accepts bounded literal modes and trims only surrounding input whitespace', () => {
    expect(PatientLookupRequestSchema.parse({ mode: 'reference_exact', query: '  Réf-01  ' }).query).toBe('Réf-01');
    expect(PatientLookupRequestSchema.parse({ mode: 'name_prefix', query: '  أمينة  ' }).query).toBe('أمينة');
  });

  it('rejects unknown authority, paging and unsupported matching fields', () => {
    for (const extra of [{ clinic_id: clinicId }, { limit: 100 }, { fuzzy: true }]) {
      expect(() => PatientLookupRequestSchema.parse({ mode: 'reference_exact', query: 'A', ...extra })).toThrow();
    }
  });

  it('enforces mode-specific query bounds in Unicode code points', () => {
    expect(() => PatientLookupRequestSchema.parse({ mode: 'name_prefix', query: 'A' })).toThrow();
    expect(PatientLookupRequestSchema.parse({ mode: 'name_prefix', query: '😀'.repeat(120) })).toBeTruthy();
    expect(() => PatientLookupRequestSchema.parse({ mode: 'name_prefix', query: '😀'.repeat(121) })).toThrow();
    expect(PatientLookupRequestSchema.parse({ mode: 'reference_exact', query: 'R'.repeat(256) })).toBeTruthy();
    expect(() => PatientLookupRequestSchema.parse({ mode: 'reference_exact', query: 'R'.repeat(257) })).toThrow();
  });

  it('accepts only the minimal strict response and at most twenty items', () => {
    const item = {
      id: patientId,
      clinic_id: clinicId,
      reference: 'LEGACY-REFERENCE',
      display_name: 'Patient synthétique',
      match_basis: 'reference_exact' as const,
    };
    expect(PatientLookupResponseSchema.parse({ items: [item], truncated: false })).toEqual({ items: [item], truncated: false });
    expect(() => PatientLookupResponseSchema.parse({ items: [{ ...item, contact_phone: '+000' }], truncated: false })).toThrow();
    expect(() => PatientLookupResponseSchema.parse({ items: Array.from({ length: 21 }, () => item), truncated: true })).toThrow();
  });
});
