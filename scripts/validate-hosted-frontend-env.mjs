/** Fail before publishing a frontend whose API fallback would target the visitor's PC. */
export function validateHostedFrontendEnv(env = process.env) {
  if (env.VERCEL !== '1') return;
  const fail = () => { throw new Error('Vercel requires NEXT_PUBLIC_API_URL to be a public HTTPS origin without a path, credentials, query or fragment.'); };
  let url;
  try { url = new URL(env.NEXT_PUBLIC_API_URL || ''); } catch { fail(); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local')
    || /^[\d.]+$/.test(host) || host.includes(':')) fail();
}

/** Reject broken sign-in and privileged browser credentials before a hosted build. */
export function validateHostedAuthEnv(env = process.env, { allowPublishableAlias = false } = {}) {
  if (env.VERCEL !== '1') return;
  const fail = () => { throw new Error('Vercel authentication requires a public HTTPS Supabase origin and a public publishable or legacy anon key.'); };
  // Reuse the exact-origin policy without exposing supplied values in errors.
  try { validateHostedFrontendEnv({ VERCEL: '1', NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_SUPABASE_URL }); }
  catch { fail(); }
  const key = allowPublishableAlias
    ? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof key !== 'string' || !key) fail();
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) fail();
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role !== 'anon') fail();
  } catch { fail(); }
  // This checks credential kind only; hosted HTTP tests verify actual validity.
}
