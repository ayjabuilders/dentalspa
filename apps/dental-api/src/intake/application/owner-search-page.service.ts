import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryOwnerSearchPageRequestSchema,InquiryOwnerSearchPageResultSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { OWNER_SEARCH_PAGE_REPOSITORY,type OwnerSearchPageRepository } from '../domain/owner-search-page';
@Injectable()
export class OwnerSearchPageService {
 constructor(@Inject(OWNER_SEARCH_PAGE_REPOSITORY) private readonly repository:OwnerSearchPageRepository){}
 async search(actor:Actor,body:unknown){
  if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();
  const input=InquiryOwnerSearchPageRequestSchema.safeParse(body);if(!input.success)throw new BadRequestException();
  let raw:unknown;try{raw=await this.repository.search(actor,input.data);}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException();}
  const result=InquiryOwnerSearchPageResultSchema.safeParse(raw);
  if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.owner_user_id.toLowerCase()!==actor.userId.toLowerCase()||result.data.name!==input.data.name||JSON.stringify(result.data.before)!==JSON.stringify(input.data.before))throw new ServiceUnavailableException();
  return result.data;
 }
}
