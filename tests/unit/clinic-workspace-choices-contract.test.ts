import { describe, expect, it } from 'vitest';
import { ClinicWorkspaceChoicesSchema } from '../../packages/contracts/src';
import { A, B } from '../fixtures';

describe('clinic workspace choices contract', () => {
  it('accepts only minimal clinic identifiers, names and unique active roles', () => {
    expect(ClinicWorkspaceChoicesSchema.safeParse({ items: [{ clinic_id: A, clinic_name: 'Cabinet A', roles: ['manager', 'reception'] }] }).success).toBe(true);
    expect(ClinicWorkspaceChoicesSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it('rejects empty roles, duplicate clinics/roles, invalid names and extra fields', () => {
    const choice = { clinic_id: A, clinic_name: 'Cabinet A', roles: ['reception'] };
    for (const value of [
      { items: [{ ...choice, roles: [] }] },
      { items: [{ ...choice, roles: ['reception', 'reception'] }] },
      { items: [{ ...choice, roles: ['manager', 'dentist'] }] },
      { items: [choice, { ...choice, clinic_name: 'Second copy' }] },
      { items: [{ ...choice, clinic_name: '' }] },
      { items: [{ ...choice, patient_count: 1 }] },
      { items: [{ ...choice, clinic_id: B, roles: ['owner'] }] },
      { items: [], user_id: A },
    ]) expect(ClinicWorkspaceChoicesSchema.safeParse(value).success).toBe(false);
  });
});
