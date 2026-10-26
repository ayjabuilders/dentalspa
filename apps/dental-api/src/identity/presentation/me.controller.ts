import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { WorkspaceDto } from './workspace.dto';
import { PatientDto } from '../../patients/presentation/patient.dto';
import { PatientsService } from '../../patients/application/patients.service';
import { Access, type AuthorizedRequest } from './policy.guard';
@ApiTags('identity') @ApiBearerAuth() @ApiHeader({ name: 'X-Clinic-Id', required: true })
@Controller('me')
export class MeController {
  constructor(@Inject(PatientsService) private readonly patients: PatientsService) {}
  @Get('workspace') @Access('staff') @ApiOkResponse({type:WorkspaceDto}) workspace(@Req() request: AuthorizedRequest) {
    const { userId, clinicId, roles } = request.actor;
    return { user_id: userId, clinic_id: clinicId, roles, mode: 'connected' };
  }
  @Get('next-actions') @Access('staff') actions() { return { items: [], availability: 'not_implemented', milestone: 'M03' }; }
  @Get('patient') @Access('patient') @ApiOkResponse({type:PatientDto}) patient(@Req() request: AuthorizedRequest) { return this.patients.find({ ...request.actor, roles: [] }, request.actor.patientId!); }
  @Get('documents') @Access('patient') documents() { return { items: [], availability: 'not_implemented', milestone: 'M05' }; }
}
