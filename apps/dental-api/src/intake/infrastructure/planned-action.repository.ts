import { Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { InquiryPlannedActionStateSchema,InquiryPlannedActionResultSchema,type SetInquiryPlannedAction } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { PlannedActionRepository } from '../domain/planned-action';
import { throwIntakeDatabaseError } from './intake.repository';
@Injectable()
export class SupabasePlannedAction implements PlannedActionRepository {
 async get(actor:Actor,id:string){const parsed=InquiryPlannedActionStateSchema.safeParse(await this.call(actor,'get_inquiry_planned_action',{p_inquiry_id:id}));if(!parsed.success)throw new ServiceUnavailableException('Planned action unavailable');return parsed.data;}
 async set(actor:Actor,id:string,input:SetInquiryPlannedAction,key:string,correlationId:string){const parsed=InquiryPlannedActionResultSchema.safeParse(await this.call(actor,'set_inquiry_planned_action',{p_inquiry_id:id,p_payload:input,p_request_key:key,p_correlation_id:correlationId}));if(!parsed.success)throw new ServiceUnavailableException('Planned action unavailable');return parsed.data;}
 private async call(actor:Actor,procedure:string,args:Record<string,unknown>){let result;try{result=await scopedClient(actor.token).rpc(procedure,{p_clinic_id:actor.clinicId,...args},{get:false,head:false});}catch{throw new ServiceUnavailableException('Planned action unavailable');}if(result.error?.code==='PT404')throw new NotFoundException('Inquiry not found');if(result.error){if(procedure==='get_inquiry_planned_action'&&result.error.code==='PT503')throw new ServiceUnavailableException('Planned action unavailable');throwIntakeDatabaseError(result.error);}return result.data as unknown;}
}
