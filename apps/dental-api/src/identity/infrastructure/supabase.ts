import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import type { IdentityPort, Membership, PatientLink } from '../domain/access';

export function scopedClient(token?: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new ServiceUnavailableException('Identity provider is not configured');
  // User token preserves RLS; service-role clients are deliberately not used.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: token ? { Authorization: `Bearer ${token}` } : {} } });
}
@Injectable()
export class SupabaseIdentity implements IdentityPort {
  async verify(token: string) {
    const { data, error } = await scopedClient().auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  }
  async memberships(token: string, userId: string): Promise<Membership[]> {
    const { data, error } = await scopedClient(token).from('clinic_memberships').select('clinic_id,user_id,role,active').eq('user_id', userId).eq('active', true);
    if (error) throw new ServiceUnavailableException('Membership lookup unavailable');
    return data ?? [];
  }
  async patientLinks(token: string, userId: string): Promise<PatientLink[]> {
    const { data, error } = await scopedClient(token).from('patient_account_links').select('clinic_id,user_id,patient_id,verified_at').eq('user_id', userId).not('verified_at', 'is', null);
    if (error) throw new ServiceUnavailableException('Account verification unavailable');
    return data ?? [];
  }
}
