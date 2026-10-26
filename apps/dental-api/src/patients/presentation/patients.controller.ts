import { Controller, Get, Inject, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { PatientDto } from './patient.dto';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { PatientsService } from '../application/patients.service';
@ApiTags('patients')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Clinic-Id', required: true })
@Controller('patients')
export class PatientsController {
  constructor(@Inject(PatientsService) private readonly patients: PatientsService) {}
  @Get() @Access('staff') @ApiOkResponse({type:PatientDto,isArray:true}) list(@Req() request: AuthorizedRequest) { return this.patients.list(request.actor); }
  @Get(':id') @Access('staff') @ApiOkResponse({type:PatientDto}) find(@Req() request: AuthorizedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.patients.find(request.actor, id); }
}
