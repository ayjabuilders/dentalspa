import { ArgumentsHost,BadRequestException,Catch,Controller,ExceptionFilter,Get,Header,HttpException,Inject,Param,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { InquirySchema,InquiryOwnerWorklistSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { OwnerWorklistService } from '../application/owner-worklist.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class OwnerWorklistExceptionFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const status=error instanceof HttpException&&[400,401,403,404,503].includes(error.getStatus())?error.getStatus():503;
    const messages:Record<number,string>={400:'Invalid inquiry request',401:'Authentication required',403:'Inquiry scope denied',404:'Inquiry not found',503:'Inquiry unavailable'};
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});
  }
}
@ApiTags('intake') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'Unsupported query or malformed identifier'}) @ApiResponse({status:401,description:'Unauthenticated'})
@ApiResponse({status:403,description:'Active reception/manager/dentist membership required'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted response'})
@Controller('inquiries') @Access('staff') @UseFilters(OwnerWorklistExceptionFilter)
export class OwnerWorklistController {
  constructor(@Inject(OwnerWorklistService) private readonly worklist:OwnerWorklistService) {}
  // Static route deliberately precedes the UUID detail route.
  @Get('owner-worklist') @Header('Cache-Control','no-store') @ApiOperation({summary:'Current owner due buckets, first50 each at one database observation'})
  @ApiResponse({status:200,schema:z.toJSONSchema(InquiryOwnerWorklistSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request:AuthorizedRequest) {if(Object.keys(request.query).length) throw new BadRequestException();return this.worklist.list(request.actor);}
  @Get(':id') @Header('Cache-Control','no-store') @ApiOperation({summary:'Current-owner inquiry detail, including older inquiries outside newest100'})
  @ApiResponse({status:200,schema:z.toJSONSchema(InquirySchema,{target:'openapi-3.0'}) as ApiSchema}) @ApiResponse({status:404,description:'Absent, foreign or no longer owned; same response'})
  find(@Req() request:AuthorizedRequest,@Param('id') id:string) {if(Object.keys(request.query).length) throw new BadRequestException();return this.worklist.find(request.actor,id);}
}
