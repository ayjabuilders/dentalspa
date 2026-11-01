import { ArgumentsHost, BadRequestException, Body, Catch, Controller, ExceptionFilter, Header, Headers, HttpException, Inject, Param, Post, Req, Res, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InquiryOwnerAssignmentResultSchema, SetInquiryOwnerSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard.js';
import { InquiryOwnerReassignmentService } from '../application/owner-reassignment.service.js';

type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

@Catch()
export class InquiryOwnerReassignmentExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException && [400, 401, 403, 404, 409, 503].includes(error.getStatus()) ? error.getStatus() : 503;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const disabled = status === 503 && typeof raw === 'object' && raw !== null && 'code' in raw && raw.code === 'intake_disabled';
    const messages: Record<number, string> = { 400: 'Invalid owner reassignment request', 401: 'Authentication required', 403: 'Owner reassignment scope denied', 404: 'Inquiry not found', 409: 'Owner reassignment conflict', 503: 'Owner reassignment unavailable' };
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store').status(status).json({ statusCode: status, message: disabled ? 'Intake commands are disabled' : messages[status], ...(disabled ? { code: 'intake_disabled' } : {}) });
  }
}

@ApiTags('intake') @ApiBearerAuth() @ApiHeader({ name: 'X-Clinic-Id', required: true })
@ApiResponse({ status: 400, description: 'Invalid request, query, identifier or key' })
@ApiResponse({ status: 401, description: 'Unauthenticated' })
@ApiResponse({ status: 403, description: 'Active manager and eligible target membership required' })
@ApiResponse({ status: 404, description: 'Absent or foreign inquiry' })
@ApiResponse({ status: 409, description: 'Stale owner or idempotency conflict' })
@ApiResponse({ status: 503, description: 'Commands disabled or provider unavailable' })
@Controller('inquiries/:id/owner') @Access('staff') @UseFilters(InquiryOwnerReassignmentExceptionFilter)
export class InquiryOwnerReassignmentController {
  constructor(@Inject(InquiryOwnerReassignmentService) private readonly service: InquiryOwnerReassignmentService) {}

  @Post() @Header('Cache-Control', 'no-store') @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Reassign an inquiry to an active intake owner; manager-only' })
  @ApiBody({ schema: z.toJSONSchema(SetInquiryOwnerSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 201, schema: z.toJSONSchema(InquiryOwnerAssignmentResultSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 200, description: 'Original receipt returned for an identical replay' })
  async assign(@Req() request: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) response: Response) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    const result = await this.service.assign(request.actor, id, body, key, request.correlationId);
    response.status(result.replayed ? 200 : 201);
    return result;
  }
}
