import { Module } from '@nestjs/common';
import { IntakeController } from './presentation/intake.controller';
import { IntakeService } from './application/intake.service';
import { INTAKE_REPOSITORY } from './domain/intake';
import { SupabaseIntake } from './infrastructure/intake.repository';
import { FollowUpController } from './presentation/follow-up.controller';
import { FollowUpService } from './application/follow-up.service';
import { FOLLOW_UP_REPOSITORY } from './domain/follow-up';
import { SupabaseFollowUp } from './infrastructure/follow-up.repository';
@Module({controllers:[IntakeController,FollowUpController],providers:[IntakeService,{provide:INTAKE_REPOSITORY,useClass:SupabaseIntake},FollowUpService,{provide:FOLLOW_UP_REPOSITORY,useClass:SupabaseFollowUp}]})
export class IntakeModule {}
