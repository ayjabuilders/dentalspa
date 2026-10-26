import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { Patient, PatientRepository } from '../domain/patient';
@Injectable()
export class SupabasePatients implements PatientRepository {
  async list(actor: Actor): Promise<Patient[]> {
    const { data, error } = await scopedClient(actor.token).from('patients').select('id,clinic_id,display_name,reference').eq('clinic_id', actor.clinicId).order('reference').limit(100);
    if (error) throw new ServiceUnavailableException('Patient records unavailable');
    return data ?? [];
  }
  async find(actor: Actor, id: string): Promise<Patient | null> {
    const { data, error } = await scopedClient(actor.token).from('patients').select('id,clinic_id,display_name,reference').eq('clinic_id', actor.clinicId).eq('id', id).maybeSingle();
    if (error) throw new ServiceUnavailableException('Patient record unavailable');
    return data;
  }
}
