import { Module } from '@nestjs/common';
import { IntakeController } from './presentation/intake.controller';
import { IntakeService } from './application/intake.service';
import { INTAKE_REPOSITORY } from './domain/intake';
import { SupabaseIntake } from './infrastructure/intake.repository';
@Module({controllers:[IntakeController],providers:[IntakeService,{provide:INTAKE_REPOSITORY,useClass:SupabaseIntake}]})
export class IntakeModule {}
