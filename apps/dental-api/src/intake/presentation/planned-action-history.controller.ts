import { ArgumentsHost,BadRequestException,Catch,Controller,ExceptionFilter,Get,Header,HttpException,Inject,Param,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquiryPlannedActionHistorySchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { PlannedActionHistoryService } from '../application/planned-action-history.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class PlannedActionHistoryExceptionFilter implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException&&[400,401,403,404,503].includes(error.getStatus())?error.getStatus():503;const messages:Record<number,string>={400:'Invalid history request',401:'Authentication required',403:'Inquiry scope denied',404:'Inquiry not found',503:'Planned action history unavailable'};host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});}
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Invalid path or unsupported query'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Active intake role required'}) @ApiResponse({status:404,description:'Absent, foreign or not currently owned'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted result'})
@Controller('inquiries/:id/planned-action/history') @Access('staff') @UseFilters(PlannedActionHistoryExceptionFilter)
export class PlannedActionHistoryController {
 constructor(@Inject(PlannedActionHistoryService) private readonly history:PlannedActionHistoryService){}
 @Get() @Header('Cache-Control','no-store') @ApiOperation({summary:'Current owner own planned-action receipts; newest first, maximum 50; no write activation required'})
 @ApiResponse({status:200,schema:z.toJSONSchema(InquiryPlannedActionHistorySchema,{target:'openapi-3.0'}) as ApiSchema})
 list(@Req() request:AuthorizedRequest,@Param('id') id:string){if(Object.keys(request.query).length)throw new BadRequestException();return this.history.list(request.actor,id);}
}
