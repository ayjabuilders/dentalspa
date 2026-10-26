import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { FollowUpListSchema, FollowUpRecordedSchema, type RecordFollowUp } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { FollowUpRepository } from '../domain/follow-up';
import { throwIntakeDatabaseError } from './intake.repository';
@Injectable()
export class SupabaseFollowUp implements FollowUpRepository {
  async list(actor:Actor,inquiryId:string) {
    const data=await this.call(actor,'list_inquiry_follow_ups',{p_inquiry_id:inquiryId});
    const parsed=FollowUpListSchema.safeParse(data);if(!parsed.success) throw new ServiceUnavailableException('Follow-up history unavailable');return parsed.data;
  }
  async record(actor:Actor,inquiryId:string,input:RecordFollowUp,key:string,correlationId:string) {
    const data=await this.call(actor,'record_inquiry_follow_up',{p_inquiry_id:inquiryId,p_payload:input,p_request_key:key,p_correlation_id:correlationId});
    const parsed=FollowUpRecordedSchema.safeParse(data);if(!parsed.success) throw new ServiceUnavailableException('Follow-up result unavailable');return parsed.data;
  }
  private async call(actor:Actor,procedure:string,args:Record<string,unknown>) {
    let result;
    try {result=await scopedClient(actor.token).rpc(procedure,{...args,p_clinic_id:actor.clinicId},{get:false,head:false});}
    catch {throw new ServiceUnavailableException('Follow-up unavailable');}
    if(result.error?.code==='PT404') throw new NotFoundException('Inquiry not found');
    if(result.error) throwIntakeDatabaseError(result.error);
    return result.data as unknown;
  }
}
