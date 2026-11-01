import { describe, expect, it, vi } from 'vitest';
import { verifyHostedPrerequisites } from '../../apps/dental-api/scripts/verify-hosted-prerequisites.mjs';

const clinicA = '10000000-0000-4000-8000-000000000001';
const clinicB = '10000000-0000-4000-8000-000000000002';
const fixtureClinics = [{ id: clinicA, name: 'Cabinet Dentaire Atlas - Casablanca (FICTIF)' }, { id: clinicB, name: 'Cabinet Sourire de Sale (FICTIF)' }];
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('hosted verifier preflight', () => {
  it('refuses reused clinic IDs that no longer refer to the labelled synthetic clinics', async () => {
    const adminRequest = vi.fn().mockResolvedValue(response([
      { id: clinicA, name: 'Dental Spa' }, fixtureClinics[1],
    ]));
    await expect(verifyHostedPrerequisites({ adminRequest, clinicA, clinicB }))
      .rejects.toThrow('Clinic IDs no longer identify the expected synthetic fixtures');
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });
  it('checks both synthetic clinics and the private bucket before any fixture setup', async () => {
    const adminRequest = vi.fn()
      .mockResolvedValueOnce(response(fixtureClinics))
      .mockResolvedValueOnce(response({ id: 'patient-documents', public: false }));

    await expect(verifyHostedPrerequisites({ adminRequest, clinicA, clinicB })).resolves.toBeUndefined();
    expect(adminRequest).toHaveBeenCalledTimes(2);
    expect(adminRequest.mock.calls[0][0]).toContain('/rest/v1/clinics?');
    expect(adminRequest).toHaveBeenLastCalledWith('/storage/v1/bucket/patient-documents');
  });

  it('stops after a missing clinic fixture before checking the bucket', async () => {
    const adminRequest = vi.fn().mockResolvedValue(response([{ id: clinicA }]));

    await expect(verifyHostedPrerequisites({ adminRequest, clinicA, clinicB }))
      .rejects.toThrow('Expected Casablanca and Salé synthetic clinic fixtures are missing');
    expect(adminRequest).toHaveBeenCalledTimes(1);
  });

  it('refuses a public document bucket', async () => {
    const adminRequest = vi.fn()
      .mockResolvedValueOnce(response(fixtureClinics))
      .mockResolvedValueOnce(response({ id: 'patient-documents', public: true }));

    await expect(verifyHostedPrerequisites({ adminRequest, clinicA, clinicB }))
      .rejects.toThrow('The patient-documents bucket is not private');
    expect(adminRequest).toHaveBeenCalledTimes(2);
  });

  it('fails closed when bucket metadata cannot be read', async () => {
    const adminRequest = vi.fn()
      .mockResolvedValueOnce(response(fixtureClinics))
      .mockResolvedValueOnce(response({ message: 'unavailable' }, 503));

    await expect(verifyHostedPrerequisites({ adminRequest, clinicA, clinicB }))
      .rejects.toThrow('Could not verify private document bucket (HTTP 503)');
  });
});
