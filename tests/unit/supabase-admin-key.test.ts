import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdminKey } from '../../apps/dental-api/src/identity/infrastructure/supabase-admin-key';
import { SupabasePrivateDocumentStorage } from '../../apps/dental-api/src/documents/infrastructure/supabase-private-document-storage';
import { SupabaseLocalTeamAuthAdmin } from '../../apps/dental-api/src/team/infrastructure/supabase-local-auth-admin';
import { stagingCleanupConfigured } from '../../apps/dental-api/src/documents/presentation/staging-cleanup.controller';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), upload: vi.fn(), listUsers: vi.fn() }));
vi.mock('../../apps/dental-api/node_modules/@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://giufpdppsunryyhfnzps.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  mocks.upload.mockResolvedValue({ error: null });
  mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mocks.createClient.mockReturnValue({ storage: { from: () => ({ upload: mocks.upload }) }, auth: { admin: { listUsers: mocks.listUsers } } });
});
afterEach(() => vi.unstubAllEnvs());

describe('API-only Supabase administrative credentials', () => {
  it.each(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])('wires %s into Storage and Auth Admin', async name => {
    vi.stubEnv(name, 'synthetic-server-key');
    expect(await new SupabasePrivateDocumentStorage().upload('synthetic/path', Buffer.from('fixture'), 'application/pdf')).toBe(true);
    expect(await new SupabaseLocalTeamAuthAdmin().listUsers(1, 10)).toEqual({ users: [], error: false });
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    for (const call of mocks.createClient.mock.calls) {
      expect(call[1]).toBe('synthetic-server-key');
      expect(call[2].auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    }
  });
  it('prefers the secret variable and supports empty legacy-only environments', () => {
    expect(supabaseAdminKey({ SUPABASE_SECRET_KEY: ' modern ', SUPABASE_SERVICE_ROLE_KEY: 'legacy' })).toBe('modern');
    expect(supabaseAdminKey({ SUPABASE_SECRET_KEY: ' ', SUPABASE_SERVICE_ROLE_KEY: ' legacy ' })).toBe('legacy');
    expect(supabaseAdminKey({ SUPABASE_ANON_KEY: 'public', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public' })).toBeUndefined();
  });
  it('fails without privileged configuration before contacting the provider', async () => {
    await expect(new SupabasePrivateDocumentStorage().upload('fixture', Buffer.from('fixture'), 'application/pdf')).rejects.toThrow('not configured');
    await expect(new SupabaseLocalTeamAuthAdmin().listUsers(1, 10)).rejects.toThrow('unavailable');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it('accepts the new variable without bypassing cron activation or project binding', () => {
    const env = { SUPABASE_SECRET_KEY: 'synthetic-server-key', SUPABASE_URL: 'https://giufpdppsunryyhfnzps.supabase.co', HOSTED_SUPABASE_PROJECT_REF: 'giufpdppsunryyhfnzps', ENABLE_DOCUMENT_STAGING_CLEANUP: 'true' };
    expect(stagingCleanupConfigured(env)).toBe(true);
    expect(stagingCleanupConfigured({ ...env, ENABLE_DOCUMENT_STAGING_CLEANUP: 'false' })).toBe(false);
    expect(stagingCleanupConfigured({ ...env, HOSTED_SUPABASE_PROJECT_REF: 'differentproject' })).toBe(false);
    expect(stagingCleanupConfigured({ ...env, SUPABASE_SECRET_KEY: '' })).toBe(false);
  });
});
