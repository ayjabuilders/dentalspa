import { ArgumentsHost,BadRequestException,Body,Catch,Controller,ExceptionFilter,Header,HttpCode,HttpException,Inject,Post,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquiryOwnerSearchRequestSchema,InquiryOwnerSearchResultSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { OwnerSearchService } from '../application/owner-search.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class OwnerSearchExceptionFilter implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException&&[400,401,403,503].includes(error.getStatus())?error.getStatus():503;const messages:Record<number,string>={400:'Invalid search request',401:'Authentication required',403:'Inquiry scope denied',503:'Owner search unavailable'};host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});}
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Noncanonical body or unsupported query'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Active intake role required'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted result'})
@Controller('inquiries/owner-search') @Access('staff') @UseFilters(OwnerSearchExceptionFilter)
export class OwnerSearchController {
 constructor(@Inject(OwnerSearchService) private readonly ownerSearch:OwnerSearchService){}
 @Post() @HttpCode(200) @Header('Cache-Control','no-store') @ApiOperation({summary:'Literal search in current owner inquiries; read-only, maximum50; no write activation'})
 @ApiBody({schema:z.toJSONSchema(InquiryOwnerSearchRequestSchema,{target:'openapi-3.0'}) as ApiSchema})
 @ApiResponse({status:200,schema:z.toJSONSchema(InquiryOwnerSearchResultSchema,{target:'openapi-3.0'}) as ApiSchema})
 search(@Req() request:AuthorizedRequest,@Body() body:unknown){if(Object.keys(request.query).length)throw new BadRequestException();return this.ownerSearch.search(request.actor,body);}
}
