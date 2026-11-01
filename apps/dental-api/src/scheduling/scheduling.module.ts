import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';
import { PatientAppointmentsController } from './patient-appointments.controller';
import { PatientAppointmentsService } from './patient-appointments.service';
import { SchedulingService } from './scheduling.service';
import { SCHEDULING_REPOSITORY, SupabaseScheduling } from './scheduling.repository';
@Module({controllers:[SchedulingController,PatientAppointmentsController],providers:[SchedulingService,PatientAppointmentsService,{provide:SCHEDULING_REPOSITORY,useClass:SupabaseScheduling}]})
export class SchedulingModule {}

