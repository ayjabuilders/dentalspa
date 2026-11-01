import {PostLocalInvoiceCreditSchema,LocalInvoiceCreditReceiptSchema,LocalInvoiceCreditContextSchema,LocalInvoiceCreditDocumentSchema} from '@dental/contracts';
import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrepareLocalInvoiceSchema, IssueLocalInvoiceSchema, LocalInvoiceDraftReceiptSchema, LocalInvoiceIssuedReceiptSchema, LocalInvoiceListSchema } from '@dental/contracts';
import { z } from 'zod';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard.js';
import { LocalInvoicesService } from '../application/local-invoices.service.js';
type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

@ApiTags('finance') @ApiBearerAuth() @ApiHeader({ name: 'X-Clinic-Id', required: true })
@Controller('finance/patients/:patientId/invoices')
export class LocalInvoicesController {
  constructor(@Inject(LocalInvoicesService) private readonly invoices: LocalInvoicesService) {}
  @Get() @Header('Cache-Control','no-store') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(LocalInvoiceListSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string){
    if(Object.keys(request.query).length)throw new BadRequestException('Query parameters not supported');
    return this.invoices.list(request.actor,patient);
  }
  @Post() @Header('Cache-Control', 'no-store') @Access('staff')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: z.toJSONSchema(PrepareLocalInvoiceSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiCreatedResponse({ schema: z.toJSONSchema(LocalInvoiceDraftReceiptSchema, { target: 'openapi-3.0' }) as ApiSchema })
  prepare(@Req() request: AuthorizedRequest, @Param('patientId', new ParseUUIDPipe()) patient: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters not supported');
    return this.invoices.prepare(request.actor, patient, body, key);
  }
  @Get(':invoiceId/credits') @Header('Cache-Control','no-store') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(LocalInvoiceCreditContextSchema,{target:'openapi-3.0'}) as ApiSchema})
  creditContext(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('invoiceId',new ParseUUIDPipe()) invoice:string){if(Object.keys(r.query).length)throw new BadRequestException('Query parameters not supported');return this.invoices.creditContext(r.actor,patient,invoice);}
  @Get(':invoiceId/credits/:creditId') @Header('Cache-Control','no-store') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(LocalInvoiceCreditDocumentSchema,{target:'openapi-3.0'}) as ApiSchema})
  creditDocument(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('invoiceId',new ParseUUIDPipe()) invoice:string,@Param('creditId',new ParseUUIDPipe()) credit:string){if(Object.keys(r.query).length)throw new BadRequestException('Query parameters not supported');return this.invoices.creditDocument(r.actor,patient,invoice,credit);}
  @Post(':invoiceId/credits') @Header('Cache-Control','no-store') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(PostLocalInvoiceCreditSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(LocalInvoiceCreditReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  postCredit(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patient:string,@Param('invoiceId',new ParseUUIDPipe()) invoice:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){if(Object.keys(r.query).length)throw new BadRequestException('Query parameters not supported');return this.invoices.postCredit(r.actor,patient,invoice,body,key);}
  @Post(':invoiceId/issue') @Header('Cache-Control', 'no-store') @Access('staff')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: z.toJSONSchema(IssueLocalInvoiceSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiCreatedResponse({ schema: z.toJSONSchema(LocalInvoiceIssuedReceiptSchema, { target: 'openapi-3.0' }) as ApiSchema })
  issue(@Req() request: AuthorizedRequest, @Param('patientId', new ParseUUIDPipe()) patient: string, @Param('invoiceId', new ParseUUIDPipe()) invoice: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters not supported');
    return this.invoices.issue(request.actor, patient, invoice, body, key);
  }
}
