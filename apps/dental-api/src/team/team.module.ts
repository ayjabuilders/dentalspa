import { Module } from '@nestjs/common';
import { TeamRosterController } from './presentation/roster.controller.js';
import { TeamRosterService } from './application/roster.service.js';
import { TEAM_ROSTER_REPOSITORY } from './domain/roster.js';
import { SupabaseTeamRoster } from './infrastructure/roster.repository.js';
import { TeamActivityController } from './presentation/activity.controller.js';
import { TeamActivityService } from './application/activity.service.js';
import { TEAM_ACTIVITY_REPOSITORY } from './domain/activity.js';
import { SupabaseTeamActivity } from './infrastructure/activity.repository.js';
import { TeamAccessController } from './presentation/team-access.controller.js';
import { TeamAccessService } from './application/team-access.service.js';
import { LOCAL_TEAM_AUTH_ADMIN } from './domain/local-auth-admin.js';
import { SupabaseLocalTeamAuthAdmin } from './infrastructure/supabase-local-auth-admin.js';
@Module({controllers:[TeamRosterController,TeamActivityController,TeamAccessController],providers:[TeamRosterService,{provide:TEAM_ROSTER_REPOSITORY,useClass:SupabaseTeamRoster},TeamActivityService,{provide:TEAM_ACTIVITY_REPOSITORY,useClass:SupabaseTeamActivity},TeamAccessService,{provide:LOCAL_TEAM_AUTH_ADMIN,useClass:SupabaseLocalTeamAuthAdmin}]})
export class TeamModule {}
