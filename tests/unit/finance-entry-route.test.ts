import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../apps/clinic-os/components/workspace', () => ({ ClinicWorkspace: () => null }));
import FinancePage from '../../apps/clinic-os/app/finance/page';
import ModulePage from '../../apps/clinic-os/app/[module]/page';

afterEach(() => vi.unstubAllEnvs());
describe('connected finance entry', () => {
  const redirect = { digest: 'NEXT_REDIRECT;replace;/connection?view=finance;307;' };
  it('routes /finance into the authenticated workspace', () => {
    try { FinancePage(); throw new Error('Expected redirect'); } catch (error) { expect(error).toMatchObject(redirect); }
  });
  it('routes the old /business URL to connected finance', async () => {
    await expect(ModulePage({ params: Promise.resolve({ module: 'business' }), searchParams: Promise.resolve({}) })).rejects.toMatchObject(redirect);
  });
  it('does not allow the preview query to select demo finance on Vercel', async () => {
    vi.stubEnv('VERCEL', '1');
    await expect(ModulePage({ params: Promise.resolve({ module: 'business' }), searchParams: Promise.resolve({ preview: '1' }) })).rejects.toMatchObject(redirect);
  });
  it('retains explicitly requested local finance demonstrations', async () => {
    vi.stubEnv('VERCEL', '');
    await expect(ModulePage({ params: Promise.resolve({ module: 'business' }), searchParams: Promise.resolve({ preview: '1' }) })).resolves.toBeDefined();
  });
});
