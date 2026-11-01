import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdminKey } from '../../identity/infrastructure/supabase-admin-key';
import type { LocalTeamAuthAdmin, LocalTeamAuthUser } from '../domain/local-auth-admin';

@Injectable()
export class SupabaseLocalTeamAuthAdmin implements LocalTeamAuthAdmin {
  private client() {
    const url = process.env.SUPABASE_URL, key = supabaseAdminKey();
    if (!url || !key) throw new ServiceUnavailableException('Local Auth Admin unavailable');
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  async listUsers(page: number, perPage: number) {
    const { data, error } = await this.client().auth.admin.listUsers({ page, perPage });
    return { users: (data?.users ?? []) as LocalTeamAuthUser[], error: Boolean(error) };
  }
  async createUser(input: { email: string; password: string; email_confirm: true; app_metadata: Record<string, string> }) {
    const { data, error } = await this.client().auth.admin.createUser(input);
    return { user: (data?.user ?? null) as LocalTeamAuthUser | null, ...(error ? { error: { message: error.message, ...(error.status === undefined ? {} : { status: error.status }) } } : {}) };
  }
}
