import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Inject, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags, ApiOkResponse, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClinicWorkspaceChoicesSchema, PatientCommunicationPreferencesResultSchema, PatientCommunicationPreferencesStateSchema, SetPatientCommunicationPreferencesSchema } from '@dental/contracts';
import { z } from 'zod';
import { CLINIC_WORKSPACE_READER, type ClinicWorkspaceReader } from '../domain/access.js';
import { WorkspaceDto } from './workspace.dto.js';
import { PatientDto } from '../../patients/presentation/patient.dto.js';
import { PatientsService } from '../../patients/application/patients.service.js';
import { Access, type AuthorizedRequest, type IdentityRequest } from './policy.guard.js';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@ApiTags('identity') @ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(@Inject(PatientsService) private readonly patients: PatientsService, @Inject(CLINIC_WORKSPACE_READER) private readonly workspaces: ClinicWorkspaceReader) {}
  @Get('workspaces') @Header('Cache-Control','no-store') @Access('workspace-list') @ApiOperation({summary:'List active clinic workspaces authorized for the verified account; no clinic selection required'})
  @ApiOkResponse({schema:z.toJSONSchema(ClinicWorkspaceChoicesSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:401,description:'Unauthenticated'}) @ApiResponse({status:503,description:'Authorized workspace lookup unavailable'})
  async workspacesList(@Req() request: IdentityRequest) {
    if(Object.keys(request.query).length) throw new BadRequestException();
    const parsed=ClinicWorkspaceChoicesSchema.safeParse(await this.workspaces.workspaces(request.verifiedIdentity.token,request.verifiedIdentity.userId));
    if(!parsed.success) throw new ServiceUnavailableException('Clinic workspace lookup unavailable');
    return parsed.data;
  }
  @Get('workspace') @Access('staff') @ApiHeader({ name: 'X-Clinic-Id', required: true }) @ApiOkResponse({type:WorkspaceDto}) workspace(@Req() request: AuthorizedRequest) {
    const { userId, clinicId, roles } = request.actor;
    return { user_id: userId, clinic_id: clinicId, roles, mode: 'connected' };
  }
  @Get('next-actions') @Access('staff') @ApiHeader({ name: 'X-Clinic-Id', required: true }) actions() { return { items: [], availability: 'not_implemented', milestone: 'M03' }; }
  @Get('patient') @Header('Cache-Control','no-store') @Access('patient') @ApiHeader({ name: 'X-Clinic-Id', required: true }) @ApiOkResponse({type:PatientDto}) patient(@Req() request: AuthorizedRequest) { return this.patients.findOwnProfile(request.actor,request.correlationId); }
  @Get('preferences') @Header('Cache-Control','no-store') @Access('patient') @ApiHeader({ name: 'X-Clinic-Id', required: true }) @ApiOperation({summary:'Read this verified patient account’s stated communication preferences'})
  @ApiOkResponse({schema:z.toJSONSchema(PatientCommunicationPreferencesStateSchema,{target:'openapi-3.0'}) as ApiSchema})
  preferences(@Req() request:AuthorizedRequest){if(Object.keys(request.query).length)throw new BadRequestException();return this.patients.getOwnCommunicationPreferences(request.actor,request.correlationId);}
  @Post('preferences') @HttpCode(200) @Header('Cache-Control','no-store') @Access('patient') @ApiHeader({ name: 'X-Clinic-Id', required: true }) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOperation({summary:'Save this patient’s stated preferences only; no consent or messaging effect'})
  @ApiBody({schema:z.toJSONSchema(SetPatientCommunicationPreferencesSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiOkResponse({schema:z.toJSONSchema(PatientCommunicationPreferencesResultSchema,{target:'openapi-3.0'}) as ApiSchema}) @ApiResponse({status:409,description:'Stale revision or conflicting idempotency key'})
  setPreferences(@Req() request:AuthorizedRequest,@Body() body:unknown,@Headers('idempotency-key') key:unknown){if(Object.keys(request.query).length)throw new BadRequestException();return this.patients.setOwnCommunicationPreferences(request.actor,body,key,request.correlationId);}
  @Get('documents') @Access('patient') @ApiHeader({ name: 'X-Clinic-Id', required: true }) documents() { return { items: [], availability: 'not_implemented', milestone: 'M05' }; }
}
