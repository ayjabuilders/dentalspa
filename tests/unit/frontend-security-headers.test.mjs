import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('application response privacy', () => {
  it.each(['clinic-os', 'patient-pass', 'public-booking'])('%s config prevents URL referrer leakage and external framing', app => {
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', `const {default:c}=await import('./apps/${app}/next.config.mjs');process.stdout.write(JSON.stringify(await c.headers()))`], {
      env: { ...process.env, VERCEL: '1', NEXT_PUBLIC_API_URL: 'https://api.example.com', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' }, encoding: 'utf8',
    });
    const [rule] = JSON.parse(raw);
    expect(rule.source).toBe('/:path*');
    const headers = Object.fromEntries(rule.headers.map(header => [header.key, header.value]));
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    // This restriction governs who embeds the app, not its private PDF previews.
    expect(headers['Content-Security-Policy']).not.toContain('frame-src');
  });
});
