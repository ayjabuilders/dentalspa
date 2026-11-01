import { describe, expect, it } from 'vitest';
import { verifyRevokedAccess } from '../../apps/dental-api/scripts/verify-revoked-access.mjs';

const patientId = '20000000-0000-4000-8000-000000000001';
const clinicId = '10000000-0000-4000-8000-000000000001';
function fixture(overrides = {}) {
  return {
    patientId, clinicId,
    requestApi: async () => new globalThis.Response(null, { status: 401 }),
    requestData: async path => path.startsWith('patients?') ? globalThis.Response.json([])
      : path.endsWith('list_inquiries') ? globalThis.Response.json({ code: '28000' }, { status: 401 })
        : globalThis.Response.json(false),
    ...overrides,
  };
}
describe('hosted revoked access acceptance', () => {
  it('checks both API reads, direct table access and guarded RPCs', async () => {
    const paths = [];
    const f = fixture();
    const requestData = f.requestData;
    f.requestData = async (path, body) => { paths.push({ path, body }); return requestData(path); };
    const results = await verifyRevokedAccess(f);
    expect(results).toHaveLength(5);
    expect(results.every(r => r.passed)).toBe(true);
    expect(paths).toContainEqual({ path: 'rpc/list_inquiries', body: { p_clinic_id: clinicId } });
    expect(paths).toContainEqual({ path: `patients?select=id&id=eq.${patientId}`, body: undefined });
  });
  it('rejects stale-token access that still succeeds', async () => {
    const results = await verifyRevokedAccess(fixture({
      requestApi: async () => globalThis.Response.json({ patientId }),
      requestData: async () => globalThis.Response.json([{ id: patientId }]),
    }));
    expect(results.every(r => !r.passed)).toBe(true);
  });
  it.each([403, 404, 429, 500])('does not mistake API HTTP %i for session revocation', async status => {
    const results = await verifyRevokedAccess(fixture({ requestApi: async () => new globalThis.Response(null, { status }) }));
    expect(results.slice(0, 2).every(r => !r.passed)).toBe(true);
  });
  it('rejects malformed provider bodies without leaking them', async () => {
    const results = await verifyRevokedAccess(fixture({ requestData: async () => new globalThis.Response('private provider contents') }));
    expect(results.slice(2).every(r => !r.passed)).toBe(true);
    expect(JSON.stringify(results)).not.toContain('private provider');
  });
  it('records transport failures without disclosing credentials', async () => {
    const results = await verifyRevokedAccess(fixture({ requestApi: async () => { throw new Error('Bearer private-token'); } }));
    expect(results.slice(0, 2).every(r => !r.passed && r.status === null)).toBe(true);
    expect(JSON.stringify(results)).not.toContain('private-token');
  });
  it('rejects a permission error unrelated to session revocation', async () => {
    const results = await verifyRevokedAccess(fixture({ requestData: async () => globalThis.Response.json({ code: '42501' }, { status: 403 }) }));
    expect(results[4].passed).toBe(false);
  });
});
