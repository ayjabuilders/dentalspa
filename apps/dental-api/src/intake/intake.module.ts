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
@Module({controllers:[InquiryScheduleController,IntakeController,FollowUpController,OwnerWorklistController],providers:[InquiryScheduleService,{provide:INQUIRY_SCHEDULE_REPOSITORY,useClass:SupabaseInquirySchedule},IntakeService,{provide:INTAKE_REPOSITORY,useClass:SupabaseIntake},FollowUpService,{provide:FOLLOW_UP_REPOSITORY,useClass:SupabaseFollowUp},OwnerWorklistService,{provide:OWNER_WORKLIST_REPOSITORY,useClass:SupabaseOwnerWorklist}]})
export class IntakeModule {}
