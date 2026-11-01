import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveAllowedOrigins } from '../../apps/dental-api/src/runtime-origins';

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as { scripts?: { start?: string; dev?: string } };
}

describe('local runtime origins', () => {
  it('keeps Supabase redirects and API CORS aligned with the current app ports', () => {
    const clinic = readJson('apps/clinic-os/package.json');
    const patientPass = readJson('apps/patient-pass/package.json');
    const publicBooking = readJson('apps/public-booking/package.json');
    const ports = [
      Number(clinic.scripts?.start?.match(/-p (\d+)/)?.[1]),
      Number(patientPass.scripts?.start?.match(/-p (\d+)/)?.[1]),
      Number(publicBooking.scripts?.start?.match(/-p (\d+)/)?.[1]),
    ];
    expect(ports).toEqual([4204, 4205, 4202]);

    const envExample = readFileSync('.env.example', 'utf8');
    const allowedOrigins = envExample.match(/^ALLOWED_ORIGINS=(.+)$/m)?.[1]?.split(',') ?? [];
    expect(new Set(allowedOrigins)).toEqual(new Set(ports.map(port => `http://localhost:${port}`)));

    const corsFallback = resolveAllowedOrigins({});
    expect(new Set(corsFallback)).toEqual(new Set(allowedOrigins));

    const authConfig = readFileSync('supabase/config.toml', 'utf8');
    expect(authConfig).toContain('site_url = "http://localhost:4204"');
    expect(authConfig).toContain('additional_redirect_urls = ["http://localhost:4204/connection", "http://localhost:4205/"]');
  });
});
