import { ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { TeamRosterSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { TEAM_ROSTER_REPOSITORY,type TeamRosterRepository } from '../domain/roster';
@Injectable()
export class TeamRosterService {
  constructor(@Inject(TEAM_ROSTER_REPOSITORY) private readonly repository:TeamRosterRepository) {}
  async list(actor:Actor) {
    if(!actor.roles.some(role=>role==='manager'||role==='dentist')) throw new ForbiddenException('Team roster scope denied');
    let raw:unknown;
    try {raw=await this.repository.list(actor);}catch(error){if(error instanceof HttpException) throw error;throw new ServiceUnavailableException('Team roster unavailable');}
    const parsed=TeamRosterSchema.safeParse(raw);
    if(!parsed.success) throw new ServiceUnavailableException('Team roster unavailable');
    const result=parsed.data,ids=new Set(result.members.map(member=>member.user_id.toLowerCase()));
    if(ids.size!==result.members.length||result.members.some(member=>member.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase())||(result.truncated&&result.members.length!==100)) throw new ServiceUnavailableException('Team roster unavailable');
    // Preserve the database's prescribed C-collation ordering without JS locale sorting.
    return result;
  }
}
