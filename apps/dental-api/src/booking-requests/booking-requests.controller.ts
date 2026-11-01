import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Access, type AuthorizedRequest } from '../identity/presentation/policy.guard';
import { BookingRequestsService } from './booking-requests.service';
import { PublicAgendaService } from './public-agenda.service';

@ApiTags('booking-requests')
@Controller('booking-requests')
export class BookingRequestsController {
  constructor(@Inject(BookingRequestsService) private readonly requests: BookingRequestsService, @Inject(PublicAgendaService) private readonly publicAgenda: PublicAgendaService) {}

  @Get('configured-availability') @Header('Cache-Control', 'no-store') @Access('public')
  configuredAvailability(@Req() request: AuthorizedRequest) {
    return this.publicAgenda.availability(request.query);
  }

  @Post('configured') @Header('Cache-Control','no-store') @Access('public') @ApiHeader({name:'Idempotency-Key',required:true})
  configuredRequest(@Req() request:AuthorizedRequest,@Body() body:unknown,@Headers('idempotency-key') key:unknown) {
    if(Object.keys(request.query).length)throw new BadRequestException('Query parameters are not supported');
    return this.publicAgenda.createRequest(body,key);
  }
  @Get('configured') @Header('Cache-Control','no-store') @Access('staff') @ApiBearerAuth()
  configuredList(@Req() request:AuthorizedRequest) {
    if(Object.keys(request.query).length)throw new BadRequestException('Query parameters are not supported');
    return this.requests.configuredList(request.actor);
  }

  @Get('demo-status') @Header('Cache-Control', 'no-store') @Access('public')
  demoStatus() {
    return this.requests.demoStatus();
  }

  @Post('configured/:id/confirm') @Header('Cache-Control','no-store') @Access('staff') @ApiBearerAuth() @ApiHeader({name:'Idempotency-Key',required:true})
  confirmConfigured(@Req() request:AuthorizedRequest,@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown) {
    if(Object.keys(request.query).length)throw new BadRequestException('Query parameters are not supported');
    return this.requests.confirmConfigured(request.actor,id,body,key);
  }

  @Get('demo-availability') @Header('Cache-Control', 'no-store') @Access('public')
  availability(@Req() request: AuthorizedRequest) {
    return this.requests.availability(request.query);
  }

  @Post('demo') @Header('Cache-Control', 'no-store') @Access('public') @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(@Req() request: AuthorizedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    if (!z.uuid().safeParse(key).success) throw new BadRequestException('A valid idempotency key is required');
    if (request.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.origin)) {
      throw new ServiceUnavailableException('Local demo requests are only available from localhost');
    }
    return this.requests.create(body, key as string);
  }

  @Get() @Header('Cache-Control', 'no-store') @Access('staff') @ApiBearerAuth()
  list(@Req() request: AuthorizedRequest) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    return this.requests.list(request.actor);
  }

  @Post(':id/confirm-demo') @Header('Cache-Control', 'no-store') @Access('staff') @ApiBearerAuth() @ApiHeader({ name: 'Idempotency-Key', required: true })
  confirmDemo(@Req() request: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(key).success) throw new BadRequestException('A valid request ID and idempotency key are required');
    if (request.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.origin)) {
      throw new ServiceUnavailableException('Local demo confirmations are only available from localhost');
    }
    return this.requests.confirm(request.actor, id, body, key as string);
  }
}
