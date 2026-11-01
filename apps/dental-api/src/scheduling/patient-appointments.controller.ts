import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Access, type AuthorizedRequest } from '../identity/presentation/policy.guard.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { AppointmentPatientAssociationSchema, AppointmentPatientAssociationReceiptSchema } from '@dental/contracts';
type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];
@Controller('appointments')
export class PatientAppointmentsController {
  constructor(@Inject(PatientAppointmentsService) private readonly appointments:PatientAppointmentsService){}
  @Post(':id/patient-association') @Header('Cache-Control','no-store') @Access('staff')
  @ApiOperation({ summary: 'Record or clear an identity-unverified possible patient match; no Patient Pass release' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'X-Clinic-Id', required: true })
  @ApiBody({ schema: z.toJSONSchema(AppointmentPatientAssociationSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiCreatedResponse({ schema: z.toJSONSchema(AppointmentPatientAssociationReceiptSchema, { target: 'openapi-3.0' }) as ApiSchema })
  associatePatient(@Req() request: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length || !z.uuid().safeParse(id).success || !z.uuid().safeParse(key).success) throw new BadRequestException('Valid appointment ID and request key required');
    return this.appointments.associatePatient(request.actor, id, body, key as string);
  }
  @Get() @Header('Cache-Control','no-store') @Access('staff')
  list(@Req() request:AuthorizedRequest) {return this.appointments.list(request.actor,request.query);}
  @Post(':id/commands') @Header('Cache-Control','no-store') @Access('staff')
  command(@Req() request:AuthorizedRequest,@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown) {
    if(Object.keys(request.query).length||!z.uuid().safeParse(id).success||!z.uuid().safeParse(key).success)throw new BadRequestException('Valid appointment ID and request key required');
    return this.appointments.command(request.actor,id,body,key as string);
  }
  @Post(':id/configured-commands') @Header('Cache-Control','no-store') @Access('staff')
  configuredCommand(@Req() request:AuthorizedRequest,@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){
    if(Object.keys(request.query).length||!z.uuid().safeParse(id).success||!z.uuid().safeParse(key).success)throw new BadRequestException('Valid appointment ID and request key required');
    return this.appointments.configuredCommand(request.actor,id,body,key as string);
  }
  @Get(':id/configured-availability') @Header('Cache-Control','no-store') @Access('staff')
  configuredAvailability(@Req() request:AuthorizedRequest,@Param('id') id:string){
    if(!z.uuid().safeParse(id).success)throw new BadRequestException('Valid appointment ID required');
    return this.appointments.configuredAvailability(request.actor,id,request.query);
  }
}
