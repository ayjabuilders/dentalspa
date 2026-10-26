import { Module } from '@nestjs/common';
import { TeamRosterController } from './presentation/roster.controller';
import { TeamRosterService } from './application/roster.service';
import { TEAM_ROSTER_REPOSITORY } from './domain/roster';
import { SupabaseTeamRoster } from './infrastructure/roster.repository';
import { TeamActivityController } from './presentation/activity.controller';
import { TeamActivityService } from './application/activity.service';
import { TEAM_ACTIVITY_REPOSITORY } from './domain/activity';
import { SupabaseTeamActivity } from './infrastructure/activity.repository';
@Module({controllers:[TeamRosterController,TeamActivityController],providers:[TeamRosterService,{provide:TEAM_ROSTER_REPOSITORY,useClass:SupabaseTeamRoster},TeamActivityService,{provide:TEAM_ACTIVITY_REPOSITORY,useClass:SupabaseTeamActivity}]})
export class TeamModule {}
