import { Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { InquirySchema,InquiryOwnerWorklistSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { OwnerWorklistRepository } from '../domain/owner-worklist';
import { throwIntakeDatabaseError } from './intake.repository';
@Injectable()
export class SupabaseOwnerWorklist implements OwnerWorklistRepository {
  async list(actor:Actor) {
    const result=InquiryOwnerWorklistSchema.safeParse(await this.call(actor,'inquiry_owner_worklist',{}));
    if(!result.success) throw new ServiceUnavailableException('Inquiry worklist unavailable');return result.data;
  }
  async find(actor:Actor,id:string) {
    const result=InquirySchema.safeParse(await this.call(actor,'get_owned_inquiry',{p_inquiry_id:id}));
    if(!result.success) throw new ServiceUnavailableException('Inquiry detail unavailable');return result.data;
  }
  private async call(actor:Actor,procedure:string,args:Record<string,unknown>) {
    let result;
    try {result=await scopedClient(actor.token).rpc(procedure,{...args,p_clinic_id:actor.clinicId},{get:false,head:false});}
    catch {throw new ServiceUnavailableException('Inquiry unavailable');}
    if(result.error?.code==='PT404') throw new NotFoundException('Inquiry not found');
    if(result.error) throwIntakeDatabaseError(result.error);
    return result.data as unknown;
  }
}
