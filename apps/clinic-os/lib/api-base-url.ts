export function resolveApiBaseUrl(configured: string | undefined, hostname: string): string {
  const explicit = configured?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return `http://${hostname || 'localhost'}:4300`;
}
