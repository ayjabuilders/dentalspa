import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { SCHEDULING_REPOSITORY, SupabaseScheduling } from './scheduling.repository';
@Module({controllers:[SchedulingController],providers:[SchedulingService,{provide:SCHEDULING_REPOSITORY,useClass:SupabaseScheduling}]})
export class SchedulingModule {}

