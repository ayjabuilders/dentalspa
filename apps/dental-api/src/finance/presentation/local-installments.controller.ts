import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, ParseIntPipe, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { LocalInstallmentReminderQueueSchema, AllocateLocalInstallmentSchema, LocalInstallmentAllocationReceiptSchema, LocalInstallmentBalancesSchema, SaveLocalInstallmentSchema, TransitionLocalInstallmentSchema, LocalInstallmentDraftReceiptSchema, LocalInstallmentTransitionReceiptSchema, LocalInstallmentListSchema, LocalInstallmentVersionSchema } from '@dental/contracts';
import { z } from 'zod';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard.js';
import { LocalInstallmentsService } from '../application/local-installments.service.js';
type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];
function noQuery(request:AuthorizedRequest){if(Object.keys(request.query).length)throw new BadRequestException('Query parameters not supported');}
@ApiTags('finance') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@Controller('finance/patients/:patientId/installments')
export class LocalInstallmentsController {
  constructor(@Inject(LocalInstallmentsService) private readonly agreements:LocalInstallmentsService){}
  @Get() @Header('Cache-Control','no-store') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(LocalInstallmentListSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string){noQuery(req);return this.agreements.list(req.actor,patient);}
  @Get(':planId/versions/:version') @Header('Cache-Control','no-store') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(LocalInstallmentVersionSchema,{target:'openapi-3.0'}) as ApiSchema})
  detail(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('planId',new ParseUUIDPipe()) plan:string,@Param('version',new ParseIntPipe()) version:number){noQuery(req);return this.agreements.detail(req.actor,patient,plan,version);}
  @Get(':planId/versions/:version/balances') @Header('Cache-Control','no-store') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(LocalInstallmentBalancesSchema,{target:'openapi-3.0'}) as ApiSchema})
  balances(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('planId',new ParseUUIDPipe()) plan:string,@Param('version',new ParseIntPipe()) version:number){noQuery(req);return this.agreements.balances(req.actor,patient,plan,version);}
  @Post(':planId/allocations') @Header('Cache-Control','no-store') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(AllocateLocalInstallmentSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalInstallmentAllocationReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  allocate(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('planId',new ParseUUIDPipe()) plan:string,@Body() body:unknown,@Headers('idempotency-key') key:string){noQuery(req);return this.agreements.allocate(req.actor,patient,plan,body,key);}
  @Post() @Header('Cache-Control','no-store') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(SaveLocalInstallmentSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalInstallmentDraftReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  save(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Body() body:unknown,@Headers('idempotency-key') key:string){noQuery(req);return this.agreements.save(req.actor,patient,body,key);}
  @Post(':planId/transitions') @Header('Cache-Control','no-store') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(TransitionLocalInstallmentSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalInstallmentTransitionReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  transition(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('planId',new ParseUUIDPipe()) plan:string,@Body() body:unknown,@Headers('idempotency-key') key:string){noQuery(req);return this.agreements.transition(req.actor,patient,plan,body,key);}
}

@ApiTags('finance') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@Controller('finance/installment-reminders')
export class LocalInstallmentRemindersController {
 constructor(@Inject(LocalInstallmentsService) private readonly agreements:LocalInstallmentsService){}
 @Get() @Header('Cache-Control','no-store') @Access('staff')
 @ApiQuery({name:'after_due',required:false,type:String,description:'Cursor due date; must accompany after_id.'})
 @ApiQuery({name:'after_id',required:false,type:String,description:'Cursor line UUID; must accompany after_due.'})
 @ApiQuery({name:'q',required:false,type:String,maxLength:100,description:'Literal substring search across patient name and reference; outer whitespace is trimmed.'})
 @ApiOkResponse({schema:z.toJSONSchema(LocalInstallmentReminderQueueSchema,{target:'openapi-3.0'}) as ApiSchema})
 list(@Req() req:AuthorizedRequest){return this.agreements.reminderQueue(req.actor,req.query);}
}
