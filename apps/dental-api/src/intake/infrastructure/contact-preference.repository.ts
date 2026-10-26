import { Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { InquiryContactPreferenceStateSchema,InquiryContactPreferenceResultSchema,type SetInquiryContactPreference } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { ContactPreferenceRepository } from '../domain/contact-preference';
import { throwIntakeDatabaseError } from './intake.repository';
@Injectable()
export class SupabaseContactPreference implements ContactPreferenceRepository {
 async get(actor:Actor,id:string){const parsed=InquiryContactPreferenceStateSchema.safeParse(await this.call(actor,'get_inquiry_contact_preference',{p_inquiry_id:id}));if(!parsed.success)throw new ServiceUnavailableException('Contact preference unavailable');return parsed.data;}
 async set(actor:Actor,id:string,input:SetInquiryContactPreference,key:string,correlationId:string){const parsed=InquiryContactPreferenceResultSchema.safeParse(await this.call(actor,'set_inquiry_contact_preference',{p_inquiry_id:id,p_payload:input,p_request_key:key,p_correlation_id:correlationId}));if(!parsed.success)throw new ServiceUnavailableException('Contact preference unavailable');return parsed.data;}
 private async call(actor:Actor,procedure:string,args:Record<string,unknown>){let result;try{result=await scopedClient(actor.token).rpc(procedure,{p_clinic_id:actor.clinicId,...args},{get:false,head:false});}catch{throw new ServiceUnavailableException('Contact preference unavailable');}if(result.error?.code==='PT404')throw new NotFoundException('Inquiry not found');if(result.error){if(procedure==='get_inquiry_contact_preference'&&result.error.code==='PT503')throw new ServiceUnavailableException('Contact preference unavailable');throwIntakeDatabaseError(result.error);}return result.data as unknown;}
}
