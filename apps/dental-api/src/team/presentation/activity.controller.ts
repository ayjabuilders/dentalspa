import { ArgumentsHost,BadRequestException,Body,Catch,Controller,ExceptionFilter,Get,Header,HttpException,Inject,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { TeamActivitySchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { TeamActivityService } from '../application/activity.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class TeamActivityExceptionFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const status=error instanceof HttpException&&[400,401,403,503].includes(error.getStatus())?error.getStatus():503;
    const messages:Record<number,string>={400:'Invalid activity request',401:'Authentication required',403:'Team activity scope denied',503:'Team activity unavailable'};
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});
  }
}
@ApiTags('team') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'No query or request body accepted'}) @ApiResponse({status:401,description:'Absent or expired identity'})
@ApiResponse({status:403,description:'Current active manager membership required'}) @ApiResponse({status:503,description:'Unavailable or malformed trusted response'})
@Controller('team') @Access('staff') @UseFilters(TeamActivityExceptionFilter)
export class TeamActivityController {
  constructor(@Inject(TeamActivityService) private readonly activity:TeamActivityService) {}
  @Get('activity') @Header('Cache-Control','no-store') @ApiOperation({summary:'Recent supported operational actions; first 50; not exhaustive'})
  @ApiResponse({status:200,schema:z.toJSONSchema(TeamActivitySchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request:AuthorizedRequest,@Body() body:unknown) {
    if(Object.keys(request.query).length||body!==undefined||Number(request.headers['content-length']??0)>0||request.headers['transfer-encoding']!==undefined) throw new BadRequestException('Invalid activity request');
    return this.activity.list(request.actor);
  }
}
