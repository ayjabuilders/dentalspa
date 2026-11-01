import { describe, expect, it, vi } from 'vitest';
import { loadOwnPatientProfile, PatientProfileError } from '../../apps/patient-pass/app/patient-profile';

const userId = '10000000-0000-4000-8000-000000000001';
const clinicId = '10000000-0000-4000-8000-000000000002';
const patientId = '10000000-0000-4000-8000-000000000003';
const profile = { id: patientId, clinic_id: clinicId, display_name: 'Salma Alaoui', reference: 'DS-0001' };
const link = { user_id: userId, clinic_id: clinicId, patient_id: patientId, verified_at: '2026-10-26T12:00:00Z' };

describe('patient pass profile lookup', () => {
  it('loads only the linked profile with a no-store, bodyless request', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe('https://api.example.test/api/v1/me/patient');
      expect(init?.method).toBe('GET');
      expect(init?.cache).toBe('no-store');
      expect(init?.credentials).toBe('omit');
      expect(init?.body).toBeUndefined();
      expect(init?.headers).toEqual({ Authorization: 'Bearer access-token', 'X-Clinic-Id': clinicId });
      return Response.json(profile);
    });

    await expect(loadOwnPatientProfile({
      api: 'https://api.example.test/', token: 'access-token', userId,
      readOwnVerifiedLinks: async () => [link], fetcher,
    })).resolves.toEqual(profile);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the account has no verified patient link', async () => {
    await expect(loadOwnPatientProfile({
      api: 'https://api.example.test', token: 'access-token', userId,
      readOwnVerifiedLinks: async () => [], fetcher: vi.fn(),
    })).rejects.toMatchObject({ kind: 'unlinked' });
  });

  it('fails closed when the account has ambiguous verified links', async () => {
    await expect(loadOwnPatientProfile({
      api: 'https://api.example.test', token: 'access-token', userId,
      readOwnVerifiedLinks: async () => [link, { ...link, clinic_id: '10000000-0000-4000-8000-000000000004' }], fetcher: vi.fn(),
    })).rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it('rejects link rows for another user and mismatched API profiles', async () => {
    await expect(loadOwnPatientProfile({
      api: 'https://api.example.test', token: 'access-token', userId,
      readOwnVerifiedLinks: async () => [{ ...link, user_id: '10000000-0000-4000-8000-000000000009' }], fetcher: vi.fn(),
    })).rejects.toMatchObject({ kind: 'denied' });
    await expect(loadOwnPatientProfile({
      api: 'https://api.example.test', token: 'access-token', userId,
      readOwnVerifiedLinks: async () => [link], fetcher: async () => Response.json({ ...profile, id: '10000000-0000-4000-8000-000000000009' }),
    })).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps authentication, authorization and service failures to safe errors', async () => {
    for (const [status, kind] of [[401, 'expired'], [403, 'denied'], [503, 'unavailable']] as const) {
      const fetcher = async () => new Response(null, { status });
      await expect(loadOwnPatientProfile({
        api: 'https://api.example.test', token: 'access-token', userId,
        readOwnVerifiedLinks: async () => [link], fetcher,
      })).rejects.toEqual(expect.objectContaining<Partial<PatientProfileError>>({ kind }));
    }
  });
});
