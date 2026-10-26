import { Module } from '@nestjs/common';
import { TeamRosterController } from './presentation/roster.controller';
import { TeamRosterService } from './application/roster.service';
import { TEAM_ROSTER_REPOSITORY } from './domain/roster';
import { SupabaseTeamRoster } from './infrastructure/roster.repository';
@Module({controllers:[TeamRosterController],providers:[TeamRosterService,{provide:TEAM_ROSTER_REPOSITORY,useClass:SupabaseTeamRoster}]})
export class TeamModule {}
