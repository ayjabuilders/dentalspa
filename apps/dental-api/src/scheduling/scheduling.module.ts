import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller.js';
import { PatientAppointmentsController } from './patient-appointments.controller.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';
import { SchedulingService } from './scheduling.service.js';
import { SCHEDULING_REPOSITORY, SupabaseScheduling } from './scheduling.repository.js';
@Module({controllers:[SchedulingController,PatientAppointmentsController],providers:[SchedulingService,PatientAppointmentsService,{provide:SCHEDULING_REPOSITORY,useClass:SupabaseScheduling}]})
export class SchedulingModule {}

