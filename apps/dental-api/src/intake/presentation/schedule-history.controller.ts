import { ArgumentsHost,BadRequestException,Catch,Controller,ExceptionFilter,Get,Header,HttpException,Inject,Param,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquiryScheduleHistorySchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { ScheduleHistoryService } from '../application/schedule-history.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class ScheduleHistoryExceptionFilter implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException&&[400,401,403,404,503].includes(error.getStatus())?error.getStatus():503;const messages:Record<number,string>={400:'Invalid history request',401:'Authentication required',403:'Inquiry scope denied',404:'Inquiry not found',503:'Schedule history unavailable'};host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});}
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Invalid path or unsupported query'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Active intake role required'}) @ApiResponse({status:404,description:'Absent, foreign or not currently owned'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted result'})
@Controller('inquiries/:id/follow-up-schedule/history') @Access('staff') @UseFilters(ScheduleHistoryExceptionFilter)
export class ScheduleHistoryController {
 constructor(@Inject(ScheduleHistoryService) private readonly history:ScheduleHistoryService){}
 @Get() @Header('Cache-Control','no-store') @ApiOperation({summary:'Current owner own schedule receipts; newest first, maximum 50; no write activation required'})
 @ApiResponse({status:200,schema:z.toJSONSchema(InquiryScheduleHistorySchema,{target:'openapi-3.0'}) as ApiSchema})
 list(@Req() request:AuthorizedRequest,@Param('id') id:string){if(Object.keys(request.query).length)throw new BadRequestException();return this.history.list(request.actor,id);}
}
