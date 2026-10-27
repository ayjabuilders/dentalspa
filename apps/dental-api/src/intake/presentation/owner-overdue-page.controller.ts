import { ArgumentsHost,BadRequestException,Body,Catch,Controller,ExceptionFilter,Header,HttpCode,HttpException,Inject,Post,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquiryOwnerOverduePageRequestSchema,InquiryOwnerOverduePageResultSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { OwnerOverduePageService } from '../application/owner-overdue-page.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch() export class OwnerOverduePageExceptionFilter implements ExceptionFilter {catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException&&[400,401,403,503].includes(error.getStatus())?error.getStatus():503;const messages:Record<number,string>={400:'Invalid overdue page request',401:'Authentication required',403:'Inquiry scope denied',503:'Overdue page unavailable'};host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});}}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true}) @ApiResponse({status:400,description:'Malformed request'}) @ApiResponse({status:401,description:'Unauthenticated'}) @ApiResponse({status:403,description:'Active intake role required'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted result'})
@Controller('inquiries/owner-overdue-page') @Access('staff') @UseFilters(OwnerOverduePageExceptionFilter)
export class OwnerOverduePageController {
 constructor(@Inject(OwnerOverduePageService) private readonly service:OwnerOverduePageService){}
 @Post() @HttpCode(200) @Header('Cache-Control','no-store') @ApiOperation({summary:'Read a bounded current-owner overdue inquiry page'}) @ApiBody({schema:z.toJSONSchema(InquiryOwnerOverduePageRequestSchema,{target:'openapi-3.0'}) as ApiSchema}) @ApiResponse({status:200,schema:z.toJSONSchema(InquiryOwnerOverduePageResultSchema,{target:'openapi-3.0'}) as ApiSchema})
 page(@Req() request:AuthorizedRequest,@Body() body:unknown){if(Object.keys(request.query).length)throw new BadRequestException();return this.service.page(request.actor,body);}
}
