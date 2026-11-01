import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Access, type AuthorizedRequest } from '../identity/presentation/policy.guard.js';
import { AgendaSettingsService } from './agenda-settings.service.js';

@ApiTags('agenda-settings') @ApiBearerAuth()
@Controller('agenda-settings')
export class AgendaSettingsController {
  constructor(@Inject(AgendaSettingsService) private readonly settings: AgendaSettingsService) {}
  @Get('availability') @Header('Cache-Control', 'no-store') @Access('staff')
  availability(@Req() request: AuthorizedRequest) {
    return this.settings.availability(request.actor, request.query);
  }
  @Get() @Header('Cache-Control', 'no-store') @Access('staff')
  read(@Req() request: AuthorizedRequest) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    return this.settings.read(request.actor);
  }
  @Post() @Header('Cache-Control', 'no-store') @Access('staff') @ApiHeader({ name: 'Idempotency-Key', required: true })
  save(@Req() request: AuthorizedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    return this.settings.save(request.actor, body, key);
  }
}
