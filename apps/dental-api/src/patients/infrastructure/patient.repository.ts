import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PatientLookupResponseSchema, type PatientLookupRequest } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { Patient, PatientRepository } from '../domain/patient';
@Injectable()
export class SupabasePatients implements PatientRepository {
  async lookup(actor: Actor, request: PatientLookupRequest) {
    let result;
    try {
      // Explicit POST; filters/query parameters would expose identifiers in URLs.
      result=await scopedClient(actor.token).rpc('lookup_patients',{p_clinic_id:actor.clinicId,p_request:request},{get:false,head:false});
    } catch { throw new ServiceUnavailableException('Patient lookup unavailable'); }
    if(result.error) throwPatientLookupError(result.error);
    const parsed=PatientLookupResponseSchema.safeParse(result.data);
    if(!parsed.success) throw new ServiceUnavailableException('Patient lookup unavailable');
    return parsed.data;
  }
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
export function throwPatientLookupError(error: {code?:string}):never {
  if(['28000','PGRST301','PGRST302'].includes(error.code ?? '')) throw new UnauthorizedException('Authentication required');
  if(error.code==='42501') throw new ForbiddenException('Patient lookup scope denied');
  if(['22023','22P02','22P05'].includes(error.code ?? '')) throw new BadRequestException('Invalid patient lookup input');
  throw new ServiceUnavailableException('Patient lookup unavailable');
}
