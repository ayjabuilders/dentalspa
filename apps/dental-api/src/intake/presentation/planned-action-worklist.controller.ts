import { ArgumentsHost,BadRequestException,Catch,Controller,ExceptionFilter,Get,Header,HttpException,Inject,Req,UseFilters } from '@nestjs/common';
import { ApiBody,ApiBearerAuth,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquiryPlannedActionWorklistSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { PlannedActionWorklistService } from '../application/planned-action-worklist.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class PlannedActionWorklistExceptionFilter implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException&&[400,401,403,503].includes(error.getStatus())?error.getStatus():503;const messages:Record<number,string>={400:'Invalid worklist request',401:'Authentication required',403:'Inquiry scope denied',503:'Planned-action worklist unavailable'};host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});}
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Unsupported query'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Active intake role required'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted result'})
@Controller('inquiries/owner-planned-actions') @Access('staff') @UseFilters(PlannedActionWorklistExceptionFilter)
export class PlannedActionWorklistController {
 constructor(@Inject(PlannedActionWorklistService) private readonly worklist:PlannedActionWorklistService){}
 @Get() @Header('Cache-Control','no-store') @ApiOperation({summary:'Current-owner recorded intentions; read-only, maximum 50; no write activation'})
 @ApiResponse({status:200,schema:z.toJSONSchema(InquiryPlannedActionWorklistSchema,{target:'openapi-3.0'}) as ApiSchema})
 list(@Req() request:AuthorizedRequest){if(Object.keys(request.query).length)throw new BadRequestException();return this.worklist.list(request.actor);}
}
