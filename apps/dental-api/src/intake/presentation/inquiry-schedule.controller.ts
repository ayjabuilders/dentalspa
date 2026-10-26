import { ArgumentsHost, BadRequestException, Body, Catch, Controller, ExceptionFilter, Header, Headers, HttpException, Inject, Param, Post, HttpCode, Req, Res, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InquiryScheduleResultSchema, SetInquiryScheduleSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { InquiryScheduleService } from '../application/inquiry-schedule.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class InquiryScheduleExceptionFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const status=error instanceof HttpException&&[400,401,403,404,409,503].includes(error.getStatus())?error.getStatus():503;
    const raw=error instanceof HttpException?error.getResponse():null;
    const disabled=status===503&&typeof raw==='object'&&raw!==null&&'code' in raw&&raw.code==='intake_disabled';
    const messages:Record<number,string>={400:'Invalid schedule request',401:'Authentication required',403:'Schedule scope denied',404:'Inquiry not found',409:'Schedule conflict',503:'Schedule unavailable'};
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:disabled?'Intake commands are disabled':messages[status],...(disabled?{code:'intake_disabled'}:{})});
  }
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Invalid request, query, identifier or key'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Current active inquiry owner with permitted role required'}) @ApiResponse({status:404,description:'Absent or foreign inquiry'})
@ApiResponse({status:503,description:'intake_disabled for disabled commands; generic unavailable for provider failures'})
@Controller('inquiries/:id/follow-up-schedule') @Access('staff') @UseFilters(InquiryScheduleExceptionFilter)
export class InquiryScheduleController {
  constructor(@Inject(InquiryScheduleService) private readonly schedule:InquiryScheduleService) {}
  @Post() @HttpCode(200) @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiOperation({summary:'Change administrative follow-up instant; no contact or appointment'})
  @ApiBody({schema:z.toJSONSchema(SetInquiryScheduleSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:200,schema:z.toJSONSchema(InquiryScheduleResultSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiResponse({status:409,description:'Stale expected instant or same scoped key with different normalized input'})
  async record(@Req() request:AuthorizedRequest,@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown,@Res({passthrough:true}) response:Response) {
    if(Object.keys(request.query).length) throw new BadRequestException();const result=await this.schedule.set(request.actor,id,body,key,request.correlationId);response.status(200);return result;
  }
}
