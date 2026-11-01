export type RuntimeHostEnvironment = {
  VERCEL?: string;
  ENABLE_LAN_DEMO_API?: string;
  NODE_ENV?: string;
};

/**
 * Keep local API access loopback-only unless a developer explicitly enables
 * the LAN demo. Vercel keeps its platform-managed host binding.
 */
export function resolveListenHost(env: RuntimeHostEnvironment): string | undefined {
  if (env.VERCEL === '1') return undefined;
  if (env.NODE_ENV !== 'production' && env.ENABLE_LAN_DEMO_API === 'true') return '0.0.0.0';
  return '127.0.0.1';
}
