import { Module } from '@nestjs/common';
import { IntakeController } from './presentation/intake.controller';
import { IntakeService } from './application/intake.service';
import { INTAKE_REPOSITORY } from './domain/intake';
import { SupabaseIntake } from './infrastructure/intake.repository';
import { FollowUpController } from './presentation/follow-up.controller';
import { FollowUpService } from './application/follow-up.service';
import { FOLLOW_UP_REPOSITORY } from './domain/follow-up';
import { SupabaseFollowUp } from './infrastructure/follow-up.repository';
import { OwnerWorklistController } from './presentation/owner-worklist.controller';
import { OwnerWorklistService } from './application/owner-worklist.service';
import { OWNER_WORKLIST_REPOSITORY } from './domain/owner-worklist';
import { SupabaseOwnerWorklist } from './infrastructure/owner-worklist.repository';
import { InquiryScheduleController } from './presentation/inquiry-schedule.controller';
import { InquiryScheduleService } from './application/inquiry-schedule.service';
import { INQUIRY_SCHEDULE_REPOSITORY } from './domain/inquiry-schedule';
import { SupabaseInquirySchedule } from './infrastructure/inquiry-schedule.repository';
import { ScheduleHistoryController } from './presentation/schedule-history.controller';
import { ScheduleHistoryService } from './application/schedule-history.service';
import { SCHEDULE_HISTORY_REPOSITORY } from './domain/schedule-history';
import { SupabaseScheduleHistory } from './infrastructure/schedule-history.repository';
import { OwnerSearchController } from './presentation/owner-search.controller';
import { OwnerSearchService } from './application/owner-search.service';
import { OWNER_SEARCH_REPOSITORY } from './domain/owner-search';
import { SupabaseOwnerSearch } from './infrastructure/owner-search.repository';
@Module({controllers:[OwnerSearchController,ScheduleHistoryController,InquiryScheduleController,IntakeController,FollowUpController,OwnerWorklistController],providers:[OwnerSearchService,{provide:OWNER_SEARCH_REPOSITORY,useClass:SupabaseOwnerSearch},ScheduleHistoryService,{provide:SCHEDULE_HISTORY_REPOSITORY,useClass:SupabaseScheduleHistory},InquiryScheduleService,{provide:INQUIRY_SCHEDULE_REPOSITORY,useClass:SupabaseInquirySchedule},IntakeService,{provide:INTAKE_REPOSITORY,useClass:SupabaseIntake},FollowUpService,{provide:FOLLOW_UP_REPOSITORY,useClass:SupabaseFollowUp},OwnerWorklistService,{provide:OWNER_WORKLIST_REPOSITORY,useClass:SupabaseOwnerWorklist}]})
export class IntakeModule {}
