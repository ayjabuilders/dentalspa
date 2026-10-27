import { BadRequestException,ForbiddenException,Injectable,ServiceUnavailableException,UnauthorizedException } from '@nestjs/common';
import { InquiryPlannedActionWorklistSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { PlannedActionWorklistRepository } from '../domain/planned-action-worklist';
@Injectable()
export class SupabasePlannedActionWorklist implements PlannedActionWorklistRepository {
 async list(actor:Actor){
  let result;try{result=await scopedClient(actor.token).rpc('inquiry_owner_planned_actions',{p_clinic_id:actor.clinicId},{get:false,head:false});}catch{throw new ServiceUnavailableException('Planned-action worklist unavailable');}
  if(result.error){const code=result.error.code;if(['28000','PGRST301','PGRST302'].includes(code))throw new UnauthorizedException();if(code==='42501')throw new ForbiddenException();if(['22023','22P02','22P05'].includes(code))throw new BadRequestException();throw new ServiceUnavailableException('Planned-action worklist unavailable');}
  const parsed=InquiryPlannedActionWorklistSchema.safeParse(result.data);if(!parsed.success)throw new ServiceUnavailableException('Planned-action worklist unavailable');return parsed.data;
 }
}
