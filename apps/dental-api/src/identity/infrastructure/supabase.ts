import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ClinicWorkspaceChoicesSchema } from '@dental/contracts';
import { z } from 'zod';
import type { ClinicWorkspaceReader, IdentityPort, Membership, PatientLink } from '../domain/access.js';

const activeWorkspaceMemberships = z.array(z.object({
  clinic_id: z.uuid(), user_id: z.uuid(), role: z.enum(['dentist','reception','assistant','manager']), active: z.literal(true),
}).strict()).max(401);
const workspaceClinics = z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(120) }).strict()).max(101);

export function scopedClient(token?: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new ServiceUnavailableException('Identity provider is not configured');
  // User token preserves RLS; service-role clients are deliberately not used.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: token ? { Authorization: `Bearer ${token}` } : {} } });
}
@Injectable()
export class SupabaseIdentity implements IdentityPort, ClinicWorkspaceReader {
  async verify(token: string) {
    const { data, error } = await scopedClient().auth.getUser(token);
    if (error || !data.user?.id) return null;
    const session = await scopedClient(token).rpc('is_current_session_active', {}, { get: false, head: false })
      .then(result => result, () => { throw new ServiceUnavailableException('Session verification unavailable'); });
    if (session.error) {
      if (['28000', '42501', 'PGRST301', 'PGRST303'].includes(session.error.code)) return null;
      throw new ServiceUnavailableException('Session verification unavailable');
    }
    if (typeof session.data !== 'boolean') throw new ServiceUnavailableException('Session verification unavailable');
    return session.data ? data.user.id : null;
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

  async workspaces(token: string, userId: string) {
    const { data: memberships, error: membershipError } = await scopedClient(token)
      .from('clinic_memberships').select('clinic_id,user_id,role,active')
      .eq('user_id', userId).eq('active', true).limit(401);
    if (membershipError) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
    const parsedMemberships = activeWorkspaceMemberships.safeParse(memberships ?? []);
    if (!parsedMemberships.success || parsedMemberships.data.length > 400) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
    if (parsedMemberships.data.some(row => row.user_id.toLowerCase() !== userId.toLowerCase())) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
    if (!parsedMemberships.data.length) return { items: [] };

    const rolesByClinic = new Map<string, Set<Membership['role']>>();
    for (const membership of parsedMemberships.data) {
      const clinicId = membership.clinic_id.toLowerCase();
      const roles = rolesByClinic.get(clinicId) ?? new Set<Membership['role']>();
      roles.add(membership.role);
      rolesByClinic.set(clinicId, roles);
    }
    if (rolesByClinic.size > 100) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
    const clinicIds = [...rolesByClinic.keys()];
    const { data: clinics, error: clinicsError } = await scopedClient(token)
      .from('clinics').select('id,name').in('id', clinicIds).limit(101);
    if (clinicsError) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
    const parsedClinics = workspaceClinics.safeParse(clinics ?? []);
    if (!parsedClinics.success || parsedClinics.data.length !== clinicIds.length) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');

    const clinicById = new Map(parsedClinics.data.map(clinic => [clinic.id.toLowerCase(), clinic]));
    const roleOrder: Membership['role'][] = ['assistant','dentist','manager','reception'];
    const result = ClinicWorkspaceChoicesSchema.safeParse({
      items: clinicIds.map(clinicId => {
        const clinic = clinicById.get(clinicId);
        if (!clinic) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
        return { clinic_id: clinic.id, clinic_name: clinic.name, roles: roleOrder.filter(role => rolesByClinic.get(clinicId)?.has(role)) };
      }).sort((a, b) => a.clinic_name.localeCompare(b.clinic_name, 'fr') || a.clinic_id.localeCompare(b.clinic_id)),
    });
    if (!result.success) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
    return result.data;
  }
}
