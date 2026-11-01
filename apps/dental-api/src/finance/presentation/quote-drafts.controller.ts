import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { QuoteCatalogSchema, QuoteDraftCommandSchema, QuoteDraftReceiptSchema, QuoteRevisionCommandSchema, QuoteRevisionReceiptSchema, FinanceCatalogSchema, FinanceCatalogCommandSchema, FinanceCatalogReceiptSchema } from '@dental/contracts';
import { z } from 'zod';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard.js';
import { QuoteDraftsService } from '../application/quote-drafts.service.js';
type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];
@ApiTags('finance') @ApiBearerAuth() @ApiHeader({ name: 'X-Clinic-Id', required: true })
@Controller('finance')
export class QuoteDraftsController {
  constructor(@Inject(QuoteDraftsService) private readonly drafts: QuoteDraftsService) {}
  @Get('services') @Header('Cache-Control','no-store') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(FinanceCatalogSchema,{target:'openapi-3.0'}) as ApiSchema})
  services(@Req() request:AuthorizedRequest){
    if(Object.keys(request.query).length)throw new BadRequestException('Query parameters not supported');
    return this.drafts.services(request.actor);
  }
  @Post('services') @Header('Cache-Control','no-store') @Access('staff')
  @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(FinanceCatalogCommandSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(FinanceCatalogReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  saveService(@Req() request:AuthorizedRequest,@Body() body:unknown,@Headers('idempotency-key') key:unknown){
    if(Object.keys(request.query).length)throw new BadRequestException('Query parameters not supported');
    return this.drafts.saveService(request.actor,body,key);
  }
  @Get('catalog') @Header('Cache-Control', 'no-store') @Access('staff')
  @ApiOkResponse({ schema: z.toJSONSchema(QuoteCatalogSchema, { target: 'openapi-3.0' }) as ApiSchema })
  catalog(@Req() request: AuthorizedRequest) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters not supported');
    return this.drafts.catalog(request.actor);
  }
  @Post('patients/:patientId/quotes') @Header('Cache-Control', 'no-store') @Access('staff')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: z.toJSONSchema(QuoteDraftCommandSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiCreatedResponse({ schema: z.toJSONSchema(QuoteDraftReceiptSchema, { target: 'openapi-3.0' }) as ApiSchema })
  create(@Req() request: AuthorizedRequest, @Param('patientId', new ParseUUIDPipe()) patient: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters not supported');
    return this.drafts.create(request.actor, patient, body, key);
  }
  @Post('patients/:patientId/quotes/:quoteId/revisions') @Header('Cache-Control', 'no-store') @Access('staff')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: z.toJSONSchema(QuoteRevisionCommandSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiCreatedResponse({ schema: z.toJSONSchema(QuoteRevisionReceiptSchema, { target: 'openapi-3.0' }) as ApiSchema })
  revise(@Req() request: AuthorizedRequest, @Param('patientId', new ParseUUIDPipe()) patient: string, @Param('quoteId', new ParseUUIDPipe()) quote: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters not supported');
    return this.drafts.revise(request.actor, patient, quote, body, key);
  }
}
