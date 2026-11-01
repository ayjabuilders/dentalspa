import { ArgumentsHost, BadRequestException, Body, Catch, Controller, ExceptionFilter, Get, Header, HttpCode, HttpException, Param, Patch, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTeamAccessMemberSchema, TeamAccessListSchema, TeamAccessReceiptSchema, UpdateTeamAccessMemberSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { TeamAccessService } from '../application/team-access.service';

type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

@Catch()
export class TeamAccessExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException && [400, 401, 403, 404, 409, 503].includes(error.getStatus()) ? error.getStatus() : 503;
    const messages: Record<number, string> = { 400: 'Invalid team access request', 401: 'Authentication required', 403: 'Manager access required', 404: 'Team member unavailable', 409: 'Team access changed or request conflicted', 503: 'Local team access unavailable' };
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store').status(status).json({ statusCode: status, message: messages[status] });
  }
}

@ApiTags('team') @ApiBearerAuth() @ApiHeader({ name: 'X-Clinic-Id', required: true })
@ApiResponse({ status: 401, description: 'Absent or expired identity' })
@ApiResponse({ status: 403, description: 'Active same-clinic manager membership required' })
@ApiResponse({ status: 503, description: 'Local loopback gate disabled or backend unavailable' })
@Controller('team/access/members') @Access('staff') @UseFilters(TeamAccessExceptionFilter)
export class TeamAccessController {
  constructor(private readonly access: TeamAccessService) {}

  @Get() @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'List the current clinic team accounts and application access' })
  @ApiQuery({ name: 'q', required: false, maxLength: 100 }) @ApiQuery({ name: 'cursor', required: false, maxLength: 300 })
  @ApiResponse({ status: 200, schema: z.toJSONSchema(TeamAccessListSchema, { target: 'openapi-3.0' }) as ApiSchema })
  list(@Req() request: AuthorizedRequest, @Query('q') query: string | undefined, @Query('cursor') cursor: string | undefined, @Body() body: unknown) {
    this.assertGet(request, body);
    if (Object.keys(request.query).some(key => key !== 'q' && key !== 'cursor')) throw new BadRequestException('Unexpected query');
    return this.access.list(request.actor, query, cursor);
  }

  @Post() @HttpCode(200) @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Create a synthetic local Auth account without sending email' })
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: z.toJSONSchema(CreateTeamAccessMemberSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 200, schema: z.toJSONSchema(TeamAccessReceiptSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 400, description: 'Invalid body or idempotency key' }) @ApiResponse({ status: 409, description: 'Email reserved or idempotency conflict' })
  create(@Req() request: AuthorizedRequest, @Body() body: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Unexpected query');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/i.test(key)) throw new BadRequestException('Invalid idempotency key');
    return this.access.create(request.actor, body, key);
  }

  @Patch(':userId') @HttpCode(200) @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Change a team member role set or deactivate/reactivate access with version check' })
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiParam({ name: 'userId', format: 'uuid' }) @ApiBody({ schema: z.toJSONSchema(UpdateTeamAccessMemberSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 200, schema: z.toJSONSchema(TeamAccessReceiptSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 400, description: 'Invalid body or idempotency key' }) @ApiResponse({ status: 404, description: 'Team member unavailable' }) @ApiResponse({ status: 409, description: 'Stale version, last manager, or idempotency conflict' })
  update(@Req() request: AuthorizedRequest, @Param('userId') userId: string, @Body() body: unknown) {
    if (Object.keys(request.query).length) throw new BadRequestException('Unexpected query');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/i.test(key)) throw new BadRequestException('Invalid idempotency key');
    return this.access.update(request.actor, userId, body, key);
  }

  private assertGet(request: AuthorizedRequest, body: unknown) {
    if (body !== undefined || Number(request.headers['content-length'] ?? 0) > 0 || request.headers['transfer-encoding'] !== undefined) throw new BadRequestException('Unexpected body');
  }
}
