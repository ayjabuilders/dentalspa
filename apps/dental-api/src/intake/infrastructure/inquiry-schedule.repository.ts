import { Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { InquiryScheduleResultSchema,type SetInquirySchedule } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { InquiryScheduleRepository } from '../domain/inquiry-schedule';
import { throwIntakeDatabaseError } from './intake.repository';
@Injectable()
export class SupabaseInquirySchedule implements InquiryScheduleRepository {
 async set(actor:Actor,id:string,input:SetInquirySchedule,key:string,correlationId:string){
  let result;try{result=await scopedClient(actor.token).rpc('set_inquiry_follow_up_schedule',{p_clinic_id:actor.clinicId,p_inquiry_id:id,p_request_key:key,p_payload:input,p_correlation_id:correlationId},{get:false,head:false});}catch{throw new ServiceUnavailableException('Schedule unavailable');}
  if(result.error?.code==='PT404')throw new NotFoundException('Inquiry not found');if(result.error)throwIntakeDatabaseError(result.error);
  const parsed=InquiryScheduleResultSchema.safeParse(result.data);if(!parsed.success)throw new ServiceUnavailableException('Schedule unavailable');return parsed.data;
 }
}
