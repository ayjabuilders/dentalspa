import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { validateHostedFrontendEnv, validateHostedAuthEnv } from '../../scripts/validate-hosted-frontend-env.mjs';

const publicAuth = { NEXT_PUBLIC_SUPABASE_URL: 'https://ci-fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_ci_placeholder', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' };

describe('hosted frontend API configuration', () => {
  it('disables Patient Pass scenarios on hosted builds even when a caller enables the public flag', () => {
    for (const [vercel, expected] of [['1', 'false'], ['', 'true']]) {
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', "const {default:config}=await import('./apps/patient-pass/next.config.mjs'); process.stdout.write(config.env.NEXT_PUBLIC_PATIENT_DEMOS)"], {
        env: { ...process.env, ...publicAuth, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicAuth.NEXT_PUBLIC_SUPABASE_ANON_KEY, VERCEL: vercel, NEXT_PUBLIC_API_URL: 'https://api.example.com', NEXT_PUBLIC_PATIENT_DEMOS: 'true' }, encoding: 'utf8',
      });
      expect(output).toBe(expected);
    }
  });
  it.each(['', 'not-a-url', 'http://api.example.com', 'https://localhost', 'https://127.0.0.1', 'https://192.168.11.102', 'https://[::1]', 'https://api.local', 'https://app.localhost', 'https://api.example.com/api/v1', 'https://user:secret@api.example.com', 'https://api.example.com?key=secret', 'https://api.example.com#x'])('rejects invalid hosted origin %s', value => {
    expect(() => validateHostedFrontendEnv({ VERCEL: '1', NEXT_PUBLIC_API_URL: value })).toThrow('Vercel requires');
  });
  it('allows a hosted HTTPS origin and local development without configuration', () => {
    expect(() => validateHostedFrontendEnv({ VERCEL: '1', NEXT_PUBLIC_API_URL: 'https://dental-api.vercel.app' })).not.toThrow();
    expect(() => validateHostedFrontendEnv({})).not.toThrow();
  });
  it.each(['clinic-os', 'public-booking', 'patient-pass'])('enforces the guard in the actual %s Next config', app => {
    const run = value => execFileSync(process.execPath, ['--input-type=module', '-e', `await import('./apps/${app}/next.config.mjs')`], {
      env: { ...process.env, ...publicAuth, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicAuth.NEXT_PUBLIC_SUPABASE_ANON_KEY, VERCEL: '1', NEXT_PUBLIC_API_URL: value }, stdio: 'pipe',
    });
    expect(() => run('')).toThrow();
    expect(() => run('https://dental-api.vercel.app')).not.toThrow();
  });
});

describe('hosted authentication configuration', () => {
  const valid = { VERCEL: '1', ...publicAuth };
  const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  it.each(['', 'sb_secret_do_not_publish', 'malformed', jwt('service_role'), jwt('authenticated')])('rejects absent or non-public credentials without echoing them', key => {
    expect(() => validateHostedAuthEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: key })).toThrow('Vercel authentication requires');
  });
  it.each(['', 'http://localhost:54321', 'https://user:password@project.supabase.co', 'https://project.supabase.co/rest/v1'])('rejects invalid provider origin', url => {
    expect(() => validateHostedAuthEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow('Vercel authentication requires');
  });
  it('supports public key formats and leaves local development unchanged', () => {
    expect(() => validateHostedAuthEnv(valid)).not.toThrow();
    expect(() => validateHostedAuthEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') })).not.toThrow();
    expect(() => validateHostedAuthEnv({})).not.toThrow();
  });
  it('matches Patient Pass alias precedence, including rejecting an empty or secret override', () => {
    expect(() => validateHostedAuthEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' }, { allowPublishableAlias: true })).not.toThrow();
    for (const key of ['', 'sb_secret_do_not_publish']) {
      expect(() => validateHostedAuthEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, { allowPublishableAlias: true })).toThrow();
    }
  });
  it.each(['clinic-os', 'patient-pass'])('rejects missing Auth configuration in the actual %s config', app => {
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', `await import('./apps/${app}/next.config.mjs')`], {
      env: { ...process.env, VERCEL: '1', NEXT_PUBLIC_API_URL: 'https://api.example.com', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }, stdio: 'pipe',
    })).toThrow();
  });
});
