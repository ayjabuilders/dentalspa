import { BadRequestException,ForbiddenException,Injectable,NotFoundException,ServiceUnavailableException,UnauthorizedException } from '@nestjs/common';
import { InquiryScheduleHistorySchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { ScheduleHistoryRepository } from '../domain/schedule-history';
@Injectable()
export class SupabaseScheduleHistory implements ScheduleHistoryRepository {
 async list(actor:Actor,id:string){
  let result;try{result=await scopedClient(actor.token).rpc('inquiry_schedule_history',{p_clinic_id:actor.clinicId,p_inquiry_id:id},{get:false,head:false});}catch{throw new ServiceUnavailableException('Schedule history unavailable');}
  if(result.error){const code=result.error.code;if(['28000','PGRST301','PGRST302'].includes(code))throw new UnauthorizedException();if(code==='42501')throw new ForbiddenException();if(code==='PT404')throw new NotFoundException();if(['22023','22P02'].includes(code))throw new BadRequestException();throw new ServiceUnavailableException('Schedule history unavailable');}
  const parsed=InquiryScheduleHistorySchema.safeParse(result.data);if(!parsed.success)throw new ServiceUnavailableException('Schedule history unavailable');return parsed.data;
 }
}
