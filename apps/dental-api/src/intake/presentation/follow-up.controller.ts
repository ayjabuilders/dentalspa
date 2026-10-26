import { ArgumentsHost, BadRequestException, Body, Catch, Controller, ExceptionFilter, Get, Header, Headers, HttpException, Inject, Param, Post, Req, Res, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FollowUpListSchema, FollowUpRecordedSchema, RecordFollowUpSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { FollowUpService } from '../application/follow-up.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class FollowUpExceptionFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const status=error instanceof HttpException&&[400,401,403,404,409,503].includes(error.getStatus())?error.getStatus():503;
    const raw=error instanceof HttpException?error.getResponse():null;
    const disabled=status===503&&typeof raw==='object'&&raw!==null&&'code' in raw&&raw.code==='intake_disabled';
    const messages:Record<number,string>={400:'Invalid follow-up request',401:'Authentication required',403:'Follow-up scope denied',404:'Inquiry not found',409:'Follow-up idempotency conflict',503:'Follow-up unavailable'};
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:disabled?'Intake commands are disabled':messages[status],...(disabled?{code:'intake_disabled'}:{})});
  }
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Invalid request, query, identifier or key'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Current active inquiry owner with permitted role required'}) @ApiResponse({status:404,description:'Absent or foreign inquiry'})
@ApiResponse({status:503,description:'intake_disabled for disabled commands; generic unavailable for provider failures'})
@Controller('inquiries/:id/follow-ups') @Access('staff') @UseFilters(FollowUpExceptionFilter)
export class FollowUpController {
  constructor(@Inject(FollowUpService) private readonly followUps:FollowUpService) {}
  @Get() @Header('Cache-Control','no-store') @ApiOperation({summary:'Current owner follow-up history; newest first, maximum50'})
  @ApiResponse({status:200,schema:z.toJSONSchema(FollowUpListSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request:AuthorizedRequest,@Param('id') id:string) {
    if(Object.keys(request.query).length) throw new BadRequestException();return this.followUps.list(request.actor,id);
  }
  @Post() @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiOperation({summary:'Attest a completed external/manual action; sends no message'})
  @ApiBody({schema:z.toJSONSchema(RecordFollowUpSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:201,schema:z.toJSONSchema(FollowUpRecordedSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:200,schema:z.toJSONSchema(FollowUpRecordedSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:409,description:'Same scoped key with different payload'})
  async record(@Req() request:AuthorizedRequest,@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown,@Res({passthrough:true}) response:Response) {
    if(Object.keys(request.query).length) throw new BadRequestException();const result=await this.followUps.record(request.actor,id,body,key,request.correlationId);response.status(result.replayed?200:201);return result;
  }
}
