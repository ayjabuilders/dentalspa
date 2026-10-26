import { Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { InquiryCommunicationLanguageStateSchema,InquiryCommunicationLanguageResultSchema,type SetInquiryCommunicationLanguage } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { CommunicationLanguageRepository } from '../domain/communication-language';
import { throwIntakeDatabaseError } from './intake.repository';
@Injectable()
export class SupabaseCommunicationLanguage implements CommunicationLanguageRepository {
 async get(actor:Actor,id:string){const parsed=InquiryCommunicationLanguageStateSchema.safeParse(await this.call(actor,'get_inquiry_communication_language',{p_inquiry_id:id}));if(!parsed.success)throw new ServiceUnavailableException('Communication language unavailable');return parsed.data;}
 async set(actor:Actor,id:string,input:SetInquiryCommunicationLanguage,key:string,correlationId:string){const parsed=InquiryCommunicationLanguageResultSchema.safeParse(await this.call(actor,'set_inquiry_communication_language',{p_inquiry_id:id,p_payload:input,p_request_key:key,p_correlation_id:correlationId}));if(!parsed.success)throw new ServiceUnavailableException('Communication language unavailable');return parsed.data;}
 private async call(actor:Actor,procedure:string,args:Record<string,unknown>){let result;try{result=await scopedClient(actor.token).rpc(procedure,{p_clinic_id:actor.clinicId,...args},{get:false,head:false});}catch{throw new ServiceUnavailableException('Communication language unavailable');}if(result.error?.code==='PT404')throw new NotFoundException('Inquiry not found');if(result.error){if(procedure==='get_inquiry_communication_language'&&result.error.code==='PT503')throw new ServiceUnavailableException('Communication language unavailable');throwIntakeDatabaseError(result.error);}return result.data as unknown;}
}
