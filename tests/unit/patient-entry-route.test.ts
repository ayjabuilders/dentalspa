import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../apps/clinic-os/components/workspace', () => ({ ClinicWorkspace: () => null }));
vi.mock('../../apps/clinic-os/components/fixtures', () => ({ patientDirectory: [{ id: 'DEMO-001' }] }));
import PatientPage, { generateStaticParams } from '../../apps/clinic-os/app/patients/[patientId]/page';

afterEach(() => vi.unstubAllEnvs());
describe('patient route server boundary', () => {
  it('redirects a UUID to the connected cabinet using Next redirect', async () => {
    vi.stubEnv('VERCEL', '1');
    await expect(PatientPage({ params: Promise.resolve({ patientId: '20000000-0000-4000-8000-000000000001' }) }))
      .rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/connection?view=patients&patient=20000000-0000-4000-8000-000000000001;307;' });
  });
  it('does not publish fictional patient pages on hosted builds', async () => {
    vi.stubEnv('VERCEL', '1');
    expect(generateStaticParams()).toEqual([]);
    await expect(PatientPage({ params: Promise.resolve({ patientId: 'DEMO-001' }) })).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  });
  it('keeps the explicit fictional local patient route', async () => {
    vi.stubEnv('VERCEL', '');
    expect(generateStaticParams()).toEqual([{ patientId: 'DEMO-001' }]);
    await expect(PatientPage({ params: Promise.resolve({ patientId: 'DEMO-001' }) })).resolves.toBeDefined();
  });
});
