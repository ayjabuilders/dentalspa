import { BadRequestException,ForbiddenException,Injectable,ServiceUnavailableException,UnauthorizedException } from '@nestjs/common';
import { InquiryOwnerOverduePageResultSchema,type InquiryOwnerOverduePageRequest } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { OwnerOverduePageRepository } from '../domain/owner-overdue-page';
@Injectable()
export class SupabaseOwnerOverduePage implements OwnerOverduePageRepository {
 async page(actor:Actor,input:InquiryOwnerOverduePageRequest){
  let result;try{result=await scopedClient(actor.token).rpc('inquiry_owner_overdue_page',{p_clinic_id:actor.clinicId,p_payload:input},{get:false,head:false});}catch{throw new ServiceUnavailableException('Overdue page unavailable');}
  if(result.error){const code=result.error.code;if(['28000','PGRST301','PGRST302'].includes(code))throw new UnauthorizedException();if(code==='42501')throw new ForbiddenException();if(['22023','22P02','22P05'].includes(code))throw new BadRequestException();throw new ServiceUnavailableException('Overdue page unavailable');}
  const parsed=InquiryOwnerOverduePageResultSchema.safeParse(result.data);if(!parsed.success)throw new ServiceUnavailableException('Overdue page unavailable');return parsed.data;
 }
}
