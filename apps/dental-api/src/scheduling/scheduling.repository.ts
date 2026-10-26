import { Injectable } from '@nestjs/common';
import type { Actor } from '../identity/domain/access';
import { scopedClient } from '../identity/infrastructure/supabase';
import { databaseError, SchedulingError } from './errors';
export const SCHEDULING_REPOSITORY=Symbol('SCHEDULING_REPOSITORY');
export interface SchedulingRepository { call(actor:Actor,procedure:string,args:Record<string,unknown>):Promise<unknown> }
@Injectable()
export class SupabaseScheduling implements SchedulingRepository {
  async call(actor:Actor,procedure:string,args:Record<string,unknown>) {
    let result;
    try { result=await scopedClient(actor.token).rpc(procedure,{...args,p_clinic_id:actor.clinicId},{get:false,head:false}); }
    catch { throw new SchedulingError('internal_error'); }
    if(result.error) databaseError(result.error);
    return result.data as unknown;
  }
}
