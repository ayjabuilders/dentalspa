import { ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { TeamActivitySchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { TEAM_ACTIVITY_REPOSITORY,type TeamActivityRepository } from '../domain/activity';
@Injectable()
export class TeamActivityService {
 constructor(@Inject(TEAM_ACTIVITY_REPOSITORY) private readonly repository:TeamActivityRepository) {}
 async list(actor:Actor) {
  if(!actor.roles.includes('manager')) throw new ForbiddenException('Team activity scope denied');
  let raw:unknown;
  try {raw=await this.repository.list(actor);}catch(error){if(error instanceof HttpException) throw error;throw new ServiceUnavailableException('Team activity unavailable');}
  const parsed=TeamActivitySchema.safeParse(raw);
  if(!parsed.success) throw new ServiceUnavailableException('Team activity unavailable');
  return parsed.data;
 }
}
