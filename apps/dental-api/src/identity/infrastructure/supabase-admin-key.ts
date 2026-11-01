// API-only credential selection. Ordinary data access must keep using scopedClient.
export function supabaseAdminKey(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}
