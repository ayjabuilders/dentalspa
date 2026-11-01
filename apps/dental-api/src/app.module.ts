import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CLINIC_WORKSPACE_READER, IDENTITY } from './identity/domain/access.js';
import { SupabaseIdentity } from './identity/infrastructure/supabase.js';
import { PolicyGuard } from './identity/presentation/policy.guard.js';
import { MeController } from './identity/presentation/me.controller.js';
import { PATIENT_REPOSITORY } from './patients/domain/patient.js';
import { PATIENT_ADMIN_CHECKLIST_REPOSITORY } from './patients/domain/patient-admin-checklist.js';
import { SupabasePatients } from './patients/infrastructure/patient.repository.js';
import { PatientsService } from './patients/application/patients.service.js';
import { PatientHubService } from './patients/application/patient-hub.service.js';
import { PatientsController } from './patients/presentation/patients.controller.js';
import { PatientAdminChecklistController } from './patients/presentation/patient-admin-checklist.controller.js';
import { HealthController } from './health.controller.js';
import { ClinicsModule } from './clinics/clinics.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { ClinicalModule } from './clinical/clinical.module.js';
import { TreatmentCasesModule } from './treatment-cases/treatment-cases.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { CommunicationsModule } from './communications/communications.module.js';
import { AuditModule } from './audit/audit.module.js';
import { IntakeModule } from './intake/intake.module.js';
import { TeamModule } from './team/team.module.js';
import { BookingRequestsModule } from './booking-requests/booking-requests.module.js';
import { FinanceModule } from './finance/finance.module.js';

@Module({ providers: [
  { provide: IDENTITY, useClass: SupabaseIdentity },
  { provide: CLINIC_WORKSPACE_READER, useExisting: IDENTITY },
], exports: [IDENTITY, CLINIC_WORKSPACE_READER] })
export class IdentityModule {}
@Module({ controllers: [PatientsController, PatientAdminChecklistController], providers: [PatientsService, PatientHubService, { provide: PATIENT_REPOSITORY, useClass: SupabasePatients }, { provide: PATIENT_ADMIN_CHECKLIST_REPOSITORY, useExisting: PATIENT_REPOSITORY }], exports: [PatientsService] })
export class PatientsModule {}
@Module({ imports: [IdentityModule, PatientsModule, ClinicsModule, SchedulingModule, WorkflowsModule, ClinicalModule, TreatmentCasesModule, DocumentsModule, CommunicationsModule, AuditModule, IntakeModule, TeamModule, BookingRequestsModule, FinanceModule], controllers: [MeController, HealthController], providers: [{ provide: APP_GUARD, useClass: PolicyGuard }] })
export class AppModule {}
