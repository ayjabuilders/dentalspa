import { describe, expect, it, vi } from 'vitest';
import { AssociationError, associationRequestKey, savePatientAssociation } from '../../apps/clinic-os/components/scheduling/patient-association-transport';
import { A, P1, P2, STAFF } from '../fixtures';
const receipt = { appointment_id: P1, patient_id: P2, version: 2, association_status: 'possible_match', identity_verified: false, replayed: false };
const options = { api: 'https://api.example.com', token: 'test-token', clinicId: A, id: P1, version: 1, patientId: P2, key: STAFF, signal: new AbortController().signal };
describe('appointment patient association transport', () => {
  it('sends a scoped POST without caching or credentials in the URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(receipt)));
    expect(await savePatientAssociation({ ...options, fetcher })).toEqual(receipt);
    expect(fetcher).toHaveBeenCalledWith(`https://api.example.com/api/v1/appointments/${P1}/patient-association`, expect.objectContaining({ method: 'POST', cache: 'no-store', credentials: 'omit', headers: expect.objectContaining({ 'X-Clinic-Id': A, 'Idempotency-Key': STAFF }), body: JSON.stringify({ patient_id: P2, expected_version: 1 }) }));
  });
  it.each([{ patient_id: P1 }, { appointment_id: P2 }, { version: 9 }, { identity_verified: true }, { association_status: 'unlinked' }])('rejects a mismatched receipt %j', async change => {
    await expect(savePatientAssociation({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...receipt, ...change }))) })).rejects.toThrow();
  });
  it('keeps permission/conflict responses distinguishable from uncertain network failures', async () => {
    for (const status of [401, 403, 404, 409, 503]) await expect(savePatientAssociation({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })) })).rejects.toEqual(new AssociationError(status));
  });
  it('supports explicit unlink and a retry receipt', async () => {
    const result = { ...receipt, patient_id: null, association_status: 'unlinked', replayed: true };
    expect(await savePatientAssociation({ ...options, patientId: null, fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result))) })).toEqual(result);
    expect(associationRequestKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
