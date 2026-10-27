import { BadRequestException,ForbiddenException,Injectable,ServiceUnavailableException,UnauthorizedException } from '@nestjs/common';
import { InquiryOwnerSearchPageResultSchema,type InquiryOwnerSearchPageRequest } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { OwnerSearchPageRepository } from '../domain/owner-search-page';
@Injectable()
export class SupabaseOwnerSearchPage implements OwnerSearchPageRepository {
 async search(actor:Actor,input:InquiryOwnerSearchPageRequest){
  let result;try{result=await scopedClient(actor.token).rpc('inquiry_owner_search_page',{p_clinic_id:actor.clinicId,p_payload:input},{get:false,head:false});}catch{throw new ServiceUnavailableException('Owner search unavailable');}
  if(result.error){const code=result.error.code;if(['28000','PGRST301','PGRST302'].includes(code))throw new UnauthorizedException();if(code==='42501')throw new ForbiddenException();if(['22023','22P02','22P05'].includes(code))throw new BadRequestException();throw new ServiceUnavailableException('Owner search unavailable');}
  const parsed=InquiryOwnerSearchPageResultSchema.safeParse(result.data);if(!parsed.success)throw new ServiceUnavailableException('Owner search unavailable');return parsed.data;
 }
}
