import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CLINIC_WORKSPACE_READER, IDENTITY } from './identity/domain/access';
import { SupabaseIdentity } from './identity/infrastructure/supabase';
import { PolicyGuard } from './identity/presentation/policy.guard';
import { MeController } from './identity/presentation/me.controller';
import { PATIENT_REPOSITORY } from './patients/domain/patient';
import { PATIENT_ADMIN_CHECKLIST_REPOSITORY } from './patients/domain/patient-admin-checklist';
import { SupabasePatients } from './patients/infrastructure/patient.repository';
import { PatientsService } from './patients/application/patients.service';
import { PatientHubService } from './patients/application/patient-hub.service';
import { PatientsController } from './patients/presentation/patients.controller';
import { PatientAdminChecklistController } from './patients/presentation/patient-admin-checklist.controller';
import { HealthController } from './health.controller';
import { ClinicsModule } from './clinics/clinics.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ClinicalModule } from './clinical/clinical.module';
import { TreatmentCasesModule } from './treatment-cases/treatment-cases.module';
import { DocumentsModule } from './documents/documents.module';
import { CommunicationsModule } from './communications/communications.module';
import { AuditModule } from './audit/audit.module';
import { IntakeModule } from './intake/intake.module';
import { TeamModule } from './team/team.module';
import { BookingRequestsModule } from './booking-requests/booking-requests.module';
import { FinanceModule } from './finance/finance.module';

@Module({ providers: [
  { provide: IDENTITY, useClass: SupabaseIdentity },
  { provide: CLINIC_WORKSPACE_READER, useExisting: IDENTITY },
], exports: [IDENTITY, CLINIC_WORKSPACE_READER] })
export class IdentityModule {}
@Module({ controllers: [PatientsController, PatientAdminChecklistController], providers: [PatientsService, PatientHubService, { provide: PATIENT_REPOSITORY, useClass: SupabasePatients }, { provide: PATIENT_ADMIN_CHECKLIST_REPOSITORY, useExisting: PATIENT_REPOSITORY }], exports: [PatientsService] })
export class PatientsModule {}
@Module({ imports: [IdentityModule, PatientsModule, ClinicsModule, SchedulingModule, WorkflowsModule, ClinicalModule, TreatmentCasesModule, DocumentsModule, CommunicationsModule, AuditModule, IntakeModule, TeamModule, BookingRequestsModule, FinanceModule], controllers: [MeController, HealthController], providers: [{ provide: APP_GUARD, useClass: PolicyGuard }] })
export class AppModule {}
