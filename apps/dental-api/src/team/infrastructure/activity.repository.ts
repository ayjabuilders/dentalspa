import { BadRequestException,ForbiddenException,Injectable,ServiceUnavailableException,UnauthorizedException } from '@nestjs/common';
import { TeamActivitySchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { TeamActivityRepository } from '../domain/activity';
@Injectable()
export class SupabaseTeamActivity implements TeamActivityRepository {
  async list(actor:Actor) {
    let result;
    try {result=await scopedClient(actor.token).rpc('team_activity',{p_clinic_id:actor.clinicId},{get:false,head:false});}
    catch {throw new ServiceUnavailableException('Team activity unavailable');}
    if(result.error) {
      if(['28000','PGRST301','PGRST302'].includes(result.error.code)) throw new UnauthorizedException('Authentication required');
      if(result.error.code==='42501') throw new ForbiddenException('Team activity scope denied');
      if(['22023','22P02'].includes(result.error.code)) throw new BadRequestException('Invalid activity request');
      // Provider failures never imply a disabled write command.
      throw new ServiceUnavailableException('Team activity unavailable');
    }
    const parsed=TeamActivitySchema.safeParse(result.data);if(!parsed.success) throw new ServiceUnavailableException('Team activity unavailable');return parsed.data;
  }
}
