import { describe, expect, it, vi } from 'vitest';
import { createPatientDirectoryTransport, PatientDirectoryError } from '../../apps/clinic-os/components/patient-directory/transport';

const clinic = '10000000-0000-4000-8000-000000000001';
const otherClinic = '20000000-0000-4000-8000-000000000001';
const patient = { id: '30000000-0000-4000-8000-000000000001', clinic_id: clinic, display_name: 'Salma Alaoui', reference: 'CAB-001' };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
function makeFetcher(implementation: FetchImplementation = async () => response([patient])) { return vi.fn(implementation); }
function transport(fetcher: ReturnType<typeof makeFetcher> = makeFetcher()) {
  return createPatientDirectoryTransport({ api: 'https://api.example.invalid/', token: 'synthetic-token', clinicId: clinic, fetcher });
}

describe('connected patient-directory transport', () => {
  it('uses an authenticated same-clinic no-store request and returns only strict minimal records', async () => {
    const fetcher = makeFetcher(async () => response([patient]));
    const client = transport(fetcher);

    await expect(client.list()).resolves.toEqual([patient]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.example.invalid/api/v1/patients');
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit' });
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-token');
    expect(new Headers(init?.headers).get('x-clinic-id')).toBe(clinic);
    client.dispose();
  });

  it('rejects foreign-clinic, duplicate, and extra-field responses without exposing them', async () => {
    const foreign = { ...patient, id: '30000000-0000-4000-8000-000000000002', clinic_id: otherClinic };
    const client = transport(makeFetcher(async () => response([patient, foreign])));
    await expect(client.list()).rejects.toMatchObject({ kind: 'unavailable' });
    client.dispose();

    const duplicate = transport(makeFetcher(async () => response([patient, patient])));
    await expect(duplicate.list()).rejects.toMatchObject({ kind: 'unavailable' });
    duplicate.dispose();

    const extra = transport(makeFetcher(async () => response([{ ...patient, phone: '+212600000000' }])));
    await expect(extra.list()).rejects.toMatchObject({ kind: 'unavailable' });
    extra.dispose();
  });

  it('validates the object ID and rechecks the requested tenant and object on direct reads', async () => {
    const fetcher = makeFetcher(async () => response(patient));
    const client = transport(fetcher);
    await expect(client.find(patient.id)).resolves.toEqual(patient);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`https://api.example.invalid/api/v1/patients/${patient.id}`);
    await expect(client.find('not-a-uuid')).rejects.toBeInstanceOf(PatientDirectoryError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    client.dispose();

    const mismatched = transport(makeFetcher(async () => response({ ...patient, id: '30000000-0000-4000-8000-000000000002' })));
    await expect(mismatched.find(patient.id)).rejects.toMatchObject({ kind: 'unavailable' });
    mismatched.dispose();
  });

  it('maps auth, role denial, and concealed foreign-object results to safe states', async () => {
    for (const [status, kind] of [[401, 'expired'], [403, 'denied'], [404, 'not_found']] as const) {
      const client = transport(makeFetcher(async () => response({ message: 'private detail' }, status)));
      await expect(client.find(patient.id)).rejects.toMatchObject({ kind });
      client.dispose();
    }
  });

  it('clears the token and blocks future reads on disposal', async () => {
    const fetcher = makeFetcher(async () => response([patient]));
    const client = transport(fetcher);
    client.dispose();
    await expect(client.list()).rejects.toMatchObject({ kind: 'expired' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
