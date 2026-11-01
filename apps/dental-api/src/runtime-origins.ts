import { isIP } from 'node:net';

export function resolveAllowedOrigins(env: { VERCEL?: string; ALLOWED_ORIGINS?: string }): string[] {
  const hosted = env.VERCEL === '1';
  const origins = (env.ALLOWED_ORIGINS ?? (hosted ? '' : 'http://localhost:4202,http://localhost:4204,http://localhost:4205'))
    .split(',').map(value => value.trim()).filter(Boolean);
  if (hosted) {
    if (!origins.length) throw new Error('ALLOWED_ORIGINS must contain the deployed frontend HTTPS origins.');
    for (const origin of origins) {
      let url: URL;
      try { url = new URL(origin); } catch { throw new Error('ALLOWED_ORIGINS contains an invalid HTTPS origin.'); }
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password
        || !host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local')
        || isIP(host.replace(/^\[|\]$/g, ''))) {
        throw new Error('ALLOWED_ORIGINS must use exact public HTTPS origins without paths, credentials or wildcards.');
      }
      if (host.includes('*')) throw new Error('ALLOWED_ORIGINS cannot contain wildcards.');
    }
  }
  return [...new Set(origins)];
}
