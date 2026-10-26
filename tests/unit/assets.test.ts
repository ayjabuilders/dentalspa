import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('public PWA and fixture boundaries', () => {
  for (const app of ['clinic-os','patient-pass']) it(`${app} has an installable manifest and no sensitive cache scope`, () => {
    const base = resolve('apps',app,'public');
    const manifest = JSON.parse(readFileSync(resolve(base,'manifest.webmanifest'),'utf8'));
    expect(manifest.display).toBe('standalone'); expect(manifest.lang).toBe('fr'); expect(manifest.id).toBe(`/${app}`);
    expect(manifest.icons.map((icon: {sizes:string}) => icon.sizes)).toEqual(['192x192','512x512','512x512']);
    for (const icon of manifest.icons) expect(readFileSync(resolve(base,`.${icon.src}`)).length).toBeGreaterThan(100);
    const worker = readFileSync(resolve(base,'sw.js'),'utf8');
    expect(worker).toContain("event.request.headers.has('authorization')");
    expect(worker).toContain("if (url.search || !STATIC.includes(url.pathname)) return;");
    expect(worker).not.toContain('cache.put');
    expect(worker).not.toContain('/api/');
    expect(worker).toContain('ACTIVATE_UPDATE');
  });
  it('keeps font licenses and only synthetic UI fixtures', () => {
    const files = readdirSync('apps/clinic-os/public/assets');
    expect(files).toContain('Manrope-OFL.txt'); expect(files).toContain('DMSans-OFL.txt');
    expect(readFileSync('apps/clinic-os/components/fixtures.ts','utf8')).toContain('UI-only synthetic');
  });
});
