import { ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryPlannedActionWorklistSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { PLANNED_ACTION_WORKLIST_REPOSITORY,type PlannedActionWorklistRepository } from '../domain/planned-action-worklist';
@Injectable()
export class PlannedActionWorklistService {
 constructor(@Inject(PLANNED_ACTION_WORKLIST_REPOSITORY) private readonly repository:PlannedActionWorklistRepository){}
 async list(actor:Actor){
  if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();
  let raw:unknown;try{raw=await this.repository.list(actor);}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException();}
  const parsed=InquiryPlannedActionWorklistSchema.safeParse(raw);
  if(!parsed.success||parsed.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||parsed.data.owner_user_id.toLowerCase()!==actor.userId.toLowerCase())throw new ServiceUnavailableException();
  return parsed.data;
 }
}
