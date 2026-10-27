import { ArgumentsHost,BadRequestException,Body,Catch,Controller,ExceptionFilter,Get,Header,Headers,HttpCode,HttpException,Inject,Param,Post,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquiryPlannedActionStateSchema,InquiryPlannedActionResultSchema,SetInquiryPlannedActionSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { PlannedActionService } from '../application/planned-action.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class PlannedActionExceptionFilter implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException&&[400,401,403,404,409,503].includes(error.getStatus())?error.getStatus():503;const raw=error instanceof HttpException?error.getResponse():null;const disabled=status===503&&typeof raw==='object'&&raw!==null&&'code' in raw&&raw.code==='intake_disabled';const messages:Record<number,string>={400:'Invalid planned_action request',401:'Authentication required',403:'Inquiry scope denied',404:'Inquiry not found',409:'Planned action conflict',503:'Planned action unavailable'};host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:disabled?'Intake commands are disabled':messages[status],...(disabled?{code:'intake_disabled'}:{})});}
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Invalid path/body/key or unsupported query'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Active intake role required'}) @ApiResponse({status:404,description:'Absent, foreign or not current owner'}) @ApiResponse({status:503,description:'Unavailable; intake_disabled only for disabled commands'})
@Controller('inquiries/:id/planned-action') @Access('staff') @UseFilters(PlannedActionExceptionFilter)
export class PlannedActionController {
 constructor(@Inject(PlannedActionService) private readonly planned_action:PlannedActionService){}
 @Get() @Header('Cache-Control','no-store') @ApiOperation({summary:'Current-owner planned administrative intention; no execution or completion'})
 @ApiResponse({status:200,schema:z.toJSONSchema(InquiryPlannedActionStateSchema,{target:'openapi-3.0'}) as ApiSchema})
 get(@Req() request:AuthorizedRequest,@Param('id') id:string){if(Object.keys(request.query).length)throw new BadRequestException();return this.planned_action.get(request.actor,id);}
 @Post() @HttpCode(200) @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOperation({summary:'Record a planned administrative intention; no task or messaging effect'})
 @ApiBody({schema:z.toJSONSchema(SetInquiryPlannedActionSchema,{target:'openapi-3.0'}) as ApiSchema})
 @ApiResponse({status:200,schema:z.toJSONSchema(InquiryPlannedActionResultSchema,{target:'openapi-3.0'}) as ApiSchema}) @ApiResponse({status:409,description:'Stale revision, key conflict or revision exhaustion'})
 set(@Req() request:AuthorizedRequest,@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown){if(Object.keys(request.query).length)throw new BadRequestException();return this.planned_action.set(request.actor,id,body,key,request.correlationId);}
}
