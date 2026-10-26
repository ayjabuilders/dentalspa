import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IDENTITY } from './identity/domain/access';
import { SupabaseIdentity } from './identity/infrastructure/supabase';
import { PolicyGuard } from './identity/presentation/policy.guard';
import { MeController } from './identity/presentation/me.controller';
import { PATIENT_REPOSITORY } from './patients/domain/patient';
import { SupabasePatients } from './patients/infrastructure/patient.repository';
import { PatientsService } from './patients/application/patients.service';
import { PatientsController } from './patients/presentation/patients.controller';
import { HealthController } from './health.controller';
import { ClinicsModule } from './clinics/clinics.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ClinicalModule } from './clinical/clinical.module';
import { TreatmentCasesModule } from './treatment-cases/treatment-cases.module';
import { DocumentsModule } from './documents/documents.module';
import { CommunicationsModule } from './communications/communications.module';
import { AuditModule } from './audit/audit.module';

@Module({ providers: [{ provide: IDENTITY, useClass: SupabaseIdentity }], exports: [IDENTITY] })
export class IdentityModule {}
@Module({ controllers: [PatientsController], providers: [PatientsService, { provide: PATIENT_REPOSITORY, useClass: SupabasePatients }], exports: [PatientsService] })
export class PatientsModule {}
@Module({ imports: [IdentityModule, PatientsModule, ClinicsModule, SchedulingModule, WorkflowsModule, ClinicalModule, TreatmentCasesModule, DocumentsModule, CommunicationsModule, AuditModule], controllers: [MeController, HealthController], providers: [{ provide: APP_GUARD, useClass: PolicyGuard }] })
export class AppModule {}
