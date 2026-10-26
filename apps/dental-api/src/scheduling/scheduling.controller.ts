import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Req, Res, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Response } from 'express';
import { CreateSchedulingHoldSchema, SchedulingAvailabilityRequestSchema, SchedulingAvailabilityResponseSchema, SchedulingResourceListResponseSchema, SchedulingHoldCreatedResponseSchema, SchedulingHoldReleasedResponseSchema, SchedulingHoldResponseSchema } from '@dental/contracts';
import { Access, type AuthorizedRequest } from '../identity/presentation/policy.guard';
import { SchedulingService } from './scheduling.service';
import { SchedulingError, SchedulingExceptionFilter } from './errors';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
const schema=(value:z.ZodType)=>z.toJSONSchema(value,{target:'openapi-3.0'}) as ApiSchema;
@ApiTags('scheduling') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'invalid_request'}) @ApiResponse({status:401,description:'unauthenticated'})
@ApiResponse({status:403,description:'forbidden'}) @ApiResponse({status:404,description:'resource_not_found or hold_not_found'})
@ApiResponse({status:409,description:'resource_conflict, idempotency_conflict or hold_expired'})
@ApiResponse({status:503,description:'scheduling_disabled'}) @ApiResponse({status:500,description:'internal_error'})
@Controller('scheduling') @Access('staff') @UseFilters(SchedulingExceptionFilter)
export class SchedulingController {
  constructor(@Inject(SchedulingService) private readonly service:SchedulingService) {}
  private check(request:AuthorizedRequest) { if(Object.keys(request.query).length) throw new SchedulingError('invalid_request'); }
  @Get('resources') @Header('Cache-Control','no-store') @ApiOkResponse({schema:schema(SchedulingResourceListResponseSchema)})
  resources(@Req() request:AuthorizedRequest) { this.check(request);return this.service.resources(request.actor); }
  @Post('availability') @HttpCode(200) @Header('Cache-Control','no-store')
  @ApiBody({schema:schema(SchedulingAvailabilityRequestSchema)}) @ApiOkResponse({schema:schema(SchedulingAvailabilityResponseSchema)})
  availability(@Req() request:AuthorizedRequest,@Body() body:unknown) { this.check(request);return this.service.availability(request.actor,body); }
  @Post('holds') @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:schema(CreateSchedulingHoldSchema)}) @ApiResponse({status:201,schema:schema(SchedulingHoldCreatedResponseSchema)}) @ApiOkResponse({schema:schema(SchedulingHoldCreatedResponseSchema)})
  async create(@Req() request:AuthorizedRequest,@Body() body:unknown,@Res({passthrough:true}) response:Response) {
    this.check(request);const result=await this.service.create(request.actor,body,request.headers['idempotency-key'],request.correlationId);response.status(result.replayed?200:201);return result;
  }
  @Get('holds/:id') @Header('Cache-Control','no-store') @ApiOkResponse({schema:schema(SchedulingHoldResponseSchema)})
  get(@Req() request:AuthorizedRequest,@Param('id') id:string) { this.check(request);return this.service.get(request.actor,id); }
  @Post('holds/:id/release') @HttpCode(200) @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({required:false,schema:{type:'object',additionalProperties:false}}) @ApiOkResponse({schema:schema(SchedulingHoldReleasedResponseSchema)})
  release(@Req() request:AuthorizedRequest,@Param('id') id:string,@Body() body:unknown) { this.check(request);return this.service.release(request.actor,id,body,request.headers['idempotency-key'],request.correlationId); }
}
