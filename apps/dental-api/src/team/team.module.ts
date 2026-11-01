import { Module } from '@nestjs/common';
import { TeamRosterController } from './presentation/roster.controller';
import { TeamRosterService } from './application/roster.service';
import { TEAM_ROSTER_REPOSITORY } from './domain/roster';
import { SupabaseTeamRoster } from './infrastructure/roster.repository';
import { TeamActivityController } from './presentation/activity.controller';
import { TeamActivityService } from './application/activity.service';
import { TEAM_ACTIVITY_REPOSITORY } from './domain/activity';
import { SupabaseTeamActivity } from './infrastructure/activity.repository';
import { TeamAccessController } from './presentation/team-access.controller';
import { TeamAccessService } from './application/team-access.service';
import { LOCAL_TEAM_AUTH_ADMIN } from './domain/local-auth-admin';
import { SupabaseLocalTeamAuthAdmin } from './infrastructure/supabase-local-auth-admin';
@Module({controllers:[TeamRosterController,TeamActivityController,TeamAccessController],providers:[TeamRosterService,{provide:TEAM_ROSTER_REPOSITORY,useClass:SupabaseTeamRoster},TeamActivityService,{provide:TEAM_ACTIVITY_REPOSITORY,useClass:SupabaseTeamActivity},TeamAccessService,{provide:LOCAL_TEAM_AUTH_ADMIN,useClass:SupabaseLocalTeamAuthAdmin}]})
export class TeamModule {}
