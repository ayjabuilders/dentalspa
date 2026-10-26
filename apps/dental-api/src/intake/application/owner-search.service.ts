import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryOwnerSearchRequestSchema,InquiryOwnerSearchResultSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { OWNER_SEARCH_REPOSITORY,type OwnerSearchRepository } from '../domain/owner-search';
@Injectable()
export class OwnerSearchService {
 constructor(@Inject(OWNER_SEARCH_REPOSITORY) private readonly repository:OwnerSearchRepository){}
 async search(actor:Actor,body:unknown){
  if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();
  const input=InquiryOwnerSearchRequestSchema.safeParse(body);if(!input.success)throw new BadRequestException();
  let raw:unknown;try{raw=await this.repository.search(actor,input.data);}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException();}
  const result=InquiryOwnerSearchResultSchema.safeParse(raw);
  if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.owner_user_id.toLowerCase()!==actor.userId.toLowerCase())throw new ServiceUnavailableException();
  return result.data;
 }
}
