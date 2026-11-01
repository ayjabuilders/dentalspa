import {LocalPaymentRefundContextSchema,RecordLocalPaymentRefundSchema,LocalPaymentRefundReceiptSchema} from '@dental/contracts';
import {BadRequestException,Body,Controller,Get,Header,Headers,Inject,Param,ParseUUIDPipe,Post,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiBody,ApiCreatedResponse,ApiHeader,ApiOkResponse,ApiTags} from '@nestjs/swagger';
import {RecordLocalPaymentSchema,TransitionLocalPaymentSchema,AllocateLocalPaymentSchema,IssueLocalPaymentReceiptSchema,LocalPaymentStateReceiptSchema,LocalAllocationReceiptSchema,LocalPaymentDocumentReceiptSchema,LocalPatientPaymentsSchema,LocalPaymentDocumentSchema} from '@dental/contracts';
import {z} from 'zod';
import {Access,type AuthorizedRequest} from '../../identity/presentation/policy.guard';
import {LocalPaymentsService} from '../application/local-payments.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@ApiTags('finance') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@Controller('finance/patients/:patientId/payments')
export class LocalPaymentsController {
  constructor(@Inject(LocalPaymentsService) private readonly payments:LocalPaymentsService){}
  @Get() @Access('staff') @Header('Cache-Control','no-store')
  @ApiOkResponse({schema:z.toJSONSchema(LocalPatientPaymentsSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string){
    if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.list(req.actor,patient);
  }
  @Get(':paymentId/refunds') @Access('staff') @Header('Cache-Control','no-store')
  @ApiOkResponse({schema:z.toJSONSchema(LocalPaymentRefundContextSchema,{target:'openapi-3.0'}) as ApiSchema})
  refundContext(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('paymentId',new ParseUUIDPipe()) payment:string){if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.refundContext(req.actor,patient,payment);}
  @Post(':paymentId/refunds') @Access('staff') @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(RecordLocalPaymentRefundSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalPaymentRefundReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  refund(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('paymentId',new ParseUUIDPipe()) payment:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.refund(req.actor,patient,payment,body,key);}
  @Get(':paymentId/receipt') @Access('staff') @Header('Cache-Control','no-store')
  @ApiOkResponse({schema:z.toJSONSchema(LocalPaymentDocumentSchema,{target:'openapi-3.0'}) as ApiSchema})
  document(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('paymentId',new ParseUUIDPipe()) payment:string){
    if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.document(req.actor,patient,payment);
  }
  @ApiHeader({name:'Idempotency-Key',required:true})
  @Post() @Access('staff') @Header('Cache-Control','no-store')
  @ApiBody({schema:z.toJSONSchema(RecordLocalPaymentSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalPaymentStateReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  record(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){
    if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.record(req.actor,patient,body,key);
  }
  @ApiHeader({name:'Idempotency-Key',required:true})
  @Post(':paymentId/transitions') @Access('staff') @Header('Cache-Control','no-store')
  @ApiBody({schema:z.toJSONSchema(TransitionLocalPaymentSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalPaymentStateReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  transition(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('paymentId',new ParseUUIDPipe()) payment:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){
    if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.transition(req.actor,patient,payment,body,key);
  }
  @ApiHeader({name:'Idempotency-Key',required:true})
  @Post(':paymentId/allocations') @Access('staff') @Header('Cache-Control','no-store')
  @ApiBody({schema:z.toJSONSchema(AllocateLocalPaymentSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalAllocationReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  allocate(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('paymentId',new ParseUUIDPipe()) payment:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){
    if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.allocate(req.actor,patient,payment,body,key);
  }
  @ApiHeader({name:'Idempotency-Key',required:true})
  @Post(':paymentId/receipts') @Access('staff') @Header('Cache-Control','no-store')
  @ApiBody({schema:z.toJSONSchema(IssueLocalPaymentReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalPaymentDocumentReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  receipt(@Req() req:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('paymentId',new ParseUUIDPipe()) payment:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){
    if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.payments.receipt(req.actor,patient,payment,body,key);
  }
}
