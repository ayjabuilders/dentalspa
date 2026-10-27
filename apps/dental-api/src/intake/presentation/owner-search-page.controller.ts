import { ArgumentsHost,BadRequestException,Body,Catch,Controller,ExceptionFilter,Header,HttpCode,HttpException,Inject,Post,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquiryOwnerSearchPageRequestSchema,InquiryOwnerSearchPageResultSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { OwnerSearchPageService } from '../application/owner-search-page.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class OwnerSearchPageExceptionFilter implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException&&[400,401,403,503].includes(error.getStatus())?error.getStatus():503;const messages:Record<number,string>={400:'Invalid search request',401:'Authentication required',403:'Inquiry scope denied',503:'Owner search unavailable'};host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});}
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Noncanonical body or unsupported query'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Active intake role required'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted result'})
@Controller('inquiries/owner-search-page') @Access('staff') @UseFilters(OwnerSearchPageExceptionFilter)
export class OwnerSearchPageController {
 constructor(@Inject(OwnerSearchPageService) private readonly ownerSearch:OwnerSearchPageService){}
 @Post() @HttpCode(200) @Header('Cache-Control','no-store') @ApiOperation({summary:'Read a current-owner literal-name search page with an untrusted comparison bound'})
 @ApiBody({schema:z.toJSONSchema(InquiryOwnerSearchPageRequestSchema,{target:'openapi-3.0'}) as ApiSchema})
 @ApiResponse({status:200,schema:z.toJSONSchema(InquiryOwnerSearchPageResultSchema,{target:'openapi-3.0'}) as ApiSchema})
 search(@Req() request:AuthorizedRequest,@Body() body:unknown){if(Object.keys(request.query).length)throw new BadRequestException();return this.ownerSearch.search(request.actor,body);}
}
