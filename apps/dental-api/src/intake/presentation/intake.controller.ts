import { BadRequestException, Body, Controller, Get, Headers, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateInquirySchema, InquiryCreatedSchema, InquiryListSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { IntakeService } from '../application/intake.service';
type ApiSchema = Extract<Parameters<typeof ApiBody>[0], {schema: unknown}>['schema'];

@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Invalid input, unsupported query or missing/invalid idempotency key'})
@ApiResponse({status:401,description:'Identity missing, invalid or expired'})
@ApiResponse({status:403,description:'Active intake role and selected clinic required'})
@ApiResponse({status:503,description:'Commands disabled or provider unavailable'})
@Controller('inquiries')
export class IntakeController {
  constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}
  @Get() @Access('staff') @ApiOperation({summary:'Authorized manual inquiries, newest first; maximum 100'})
  @ApiResponse({status:200,description:'Items and explicit truncated flag',schema:z.toJSONSchema(InquiryListSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request: AuthorizedRequest) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    return this.intake.list(request.actor);
  }
  @Post() @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true,description:'UUID scoped to clinic and verified actor'})
  @ApiOperation({summary:'Create a manual inquiry; commands disabled by default'})
  @ApiBody({schema:z.toJSONSchema(CreateInquirySchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:201,description:'New inquiry persisted atomically with audit and outbox',schema:z.toJSONSchema(InquiryCreatedSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:200,description:'Original inquiry returned on identical replay',schema:z.toJSONSchema(InquiryCreatedSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:409,description:'Idempotency key reused with different normalized input'})
  async create(@Req() request: AuthorizedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Res({passthrough:true}) response: Response) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    const result = await this.intake.create(request.actor,body,key,request.correlationId);
    response.status(result.replayed ? 200 : 201);
    return result;
  }
}
