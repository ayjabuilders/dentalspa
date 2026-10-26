import { BadRequestException,ForbiddenException,Injectable,ServiceUnavailableException,UnauthorizedException } from '@nestjs/common';
import { TeamRosterSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { TeamRosterRepository } from '../domain/roster';
@Injectable()
export class SupabaseTeamRoster implements TeamRosterRepository {
  async list(actor:Actor) {
    let result;
    try {result=await scopedClient(actor.token).rpc('team_roster',{p_clinic_id:actor.clinicId},{get:false,head:false});}
    catch {throw new ServiceUnavailableException('Team roster unavailable');}
    if(result.error) {
      if(['28000','PGRST301','PGRST302'].includes(result.error.code)) throw new UnauthorizedException('Authentication required');
      if(result.error.code==='42501') throw new ForbiddenException('Team roster scope denied');
      if(['22023','22P02'].includes(result.error.code)) throw new BadRequestException('Invalid roster request');
      // PT503 means incomplete profiles, never a disabled write command.
      throw new ServiceUnavailableException('Team roster unavailable');
    }
    const parsed=TeamRosterSchema.safeParse(result.data);if(!parsed.success) throw new ServiceUnavailableException('Team roster unavailable');return parsed.data;
  }
}
