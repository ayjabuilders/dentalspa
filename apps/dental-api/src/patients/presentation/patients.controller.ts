import { BadRequestException, Body, Controller, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags, ApiOkResponse, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { PatientLookupRequestSchema, PatientLookupResponseSchema } from '@dental/contracts';
import { z } from 'zod';
import { PatientDto } from './patient.dto.js';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard.js';
import { PatientsService } from '../application/patients.service.js';
import { PatientHubService } from '../application/patient-hub.service.js';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@ApiTags('patients')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Clinic-Id', required: true })
@Controller('patients')
export class PatientsController {
  constructor(@Inject(PatientsService) private readonly patients: PatientsService, @Inject(PatientHubService) private readonly hub: PatientHubService) {}
  @Get(':id/hub') @Header('Cache-Control','no-store') @Access('staff')
  readHub(@Req() request: AuthorizedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    return this.hub.read(request.actor, id);
  }
  @Post('lookup') @HttpCode(200) @Header('Cache-Control','no-store') @Access('staff')
  @ApiOperation({summary:'Read-only patient lookup: literal exact reference or name prefix; maximum 20'})
  @ApiBody({schema:z.toJSONSchema(PatientLookupRequestSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiOkResponse({schema:z.toJSONSchema(PatientLookupResponseSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:400,description:'Invalid input or unsupported query parameters'})
  @ApiResponse({status:401,description:'Identity missing, invalid or expired'})
  @ApiResponse({status:403,description:'Active reception/manager/dentist membership required'})
  @ApiResponse({status:503,description:'Provider or malformed result failure'})
  lookup(@Req() request: AuthorizedRequest,@Body() body:unknown) {
    if(Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    return this.patients.lookup(request.actor,body);
  }
  @Get() @Header('Cache-Control','no-store') @Access('staff') @ApiOkResponse({type:PatientDto,isArray:true}) list(@Req() request: AuthorizedRequest) { return this.patients.list(request.actor); }
  @Get(':id') @Header('Cache-Control','no-store') @Access('staff') @ApiOkResponse({type:PatientDto}) find(@Req() request: AuthorizedRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.patients.find(request.actor, id); }
}
