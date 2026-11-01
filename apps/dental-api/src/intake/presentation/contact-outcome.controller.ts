import { ArgumentsHost, BadRequestException, Body, Catch, Controller, ExceptionFilter, Get, Header, Headers, HttpException, Inject, Param, Post, Req, Res, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InquiryContactOutcomeListSchema, InquiryContactOutcomeRecordedSchema, RecordInquiryContactOutcomeSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Response } from 'express';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard.js';
import { InquiryContactOutcomeService } from '../application/contact-outcome.service.js';

type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

@Catch()
export class InquiryContactOutcomeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException && [400, 401, 403, 404, 409, 503].includes(error.getStatus()) ? error.getStatus() : 503;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const disabled = status === 503 && typeof raw === 'object' && raw !== null && 'code' in raw && raw.code === 'contact_outcomes_disabled';
    const messages: Record<number, string> = { 400: 'Invalid contact outcome request', 401: 'Authentication required', 403: 'Contact outcome scope denied', 404: 'Inquiry not found', 409: 'Contact outcome idempotency conflict', 503: 'Contact outcome history unavailable' };
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store').status(status).json({ statusCode: status, message: disabled ? 'Contact outcome history is disabled pending privacy review' : messages[status], ...(disabled ? { code: 'contact_outcomes_disabled' } : {}) });
  }
}

@ApiTags('intake') @ApiBearerAuth() @ApiHeader({ name: 'X-Clinic-Id', required: true })
@ApiResponse({ status: 400, description: 'Invalid request, query, identifier or key' }) @ApiResponse({ status: 401, description: 'Unauthenticated' })
@ApiResponse({ status: 403, description: 'Current active inquiry owner with permitted same-clinic role required' }) @ApiResponse({ status: 404, description: 'Absent or foreign inquiry' })
@ApiResponse({ status: 503, description: 'Contact outcome history disabled pending privacy/retention review; provider failures are generic' })
@Controller('inquiries/:id/contact-outcomes') @Access('staff') @UseFilters(InquiryContactOutcomeExceptionFilter)
export class InquiryContactOutcomeController {
  constructor(@Inject(InquiryContactOutcomeService) private readonly outcomes: InquiryContactOutcomeService) {}

  @Get() @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Current owner factual contact-outcome history; newest first, maximum 50' })
  @ApiResponse({ status: 200, schema: z.toJSONSchema(InquiryContactOutcomeListSchema, { target: 'openapi-3.0' }) as ApiSchema })
  list(@Req() request: AuthorizedRequest, @Param('id') id: string) {
    if (Object.keys(request.query).length) throw new BadRequestException();
    return this.outcomes.list(request.actor, id);
  }

  @Post() @Header('Cache-Control', 'no-store') @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Record one factual outcome for a manually completed contact; does not contact anyone or change inquiry status' })
  @ApiBody({ schema: z.toJSONSchema(RecordInquiryContactOutcomeSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 201, schema: z.toJSONSchema(InquiryContactOutcomeRecordedSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 200, description: 'Exact idempotent replay', schema: z.toJSONSchema(InquiryContactOutcomeRecordedSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 409, description: 'Same scoped key with different payload' })
  async record(@Req() request: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) response: Response) {
    if (Object.keys(request.query).length) throw new BadRequestException();
    const result = await this.outcomes.record(request.actor, id, body, key, request.correlationId);
    response.status(result.replayed ? 200 : 201);
    return result;
  }
}
