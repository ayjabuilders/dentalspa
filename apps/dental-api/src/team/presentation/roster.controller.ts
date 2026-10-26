import { ArgumentsHost,BadRequestException,Body,Catch,Controller,ExceptionFilter,Get,Header,HttpException,Inject,Req,UseFilters } from '@nestjs/common';
import { ApiBearerAuth,ApiBody,ApiHeader,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import { TeamRosterSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access,type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { TeamRosterService } from '../application/roster.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@Catch()
export class TeamRosterExceptionFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const status=error instanceof HttpException&&[400,401,403,503].includes(error.getStatus())?error.getStatus():503;
    const messages:Record<number,string>={400:'Invalid roster request',401:'Authentication required',403:'Team roster scope denied',503:'Team roster unavailable'};
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control','no-store').status(status).json({statusCode:status,message:messages[status]});
  }
}
@ApiTags('team') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@ApiResponse({status:400,description:'No query or request body accepted'}) @ApiResponse({status:401,description:'Absent or expired identity'})
@ApiResponse({status:403,description:'Current active manager/dentist membership required'}) @ApiResponse({status:503,description:'Unavailable, incomplete profiles or malformed trusted response'})
@Controller('team') @Access('staff') @UseFilters(TeamRosterExceptionFilter)
export class TeamRosterController {
  constructor(@Inject(TeamRosterService) private readonly roster:TeamRosterService) {}
  @Get('roster') @Header('Cache-Control','no-store') @ApiOperation({summary:'Observed active clinic members and access roles; first100 distinct members'})
  @ApiResponse({status:200,schema:z.toJSONSchema(TeamRosterSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request:AuthorizedRequest,@Body() body:unknown) {
    if(Object.keys(request.query).length||body!==undefined||Number(request.headers['content-length']??0)>0||request.headers['transfer-encoding']!==undefined) throw new BadRequestException('Invalid roster request');
    return this.roster.list(request.actor);
  }
}
