import { BadRequestException, Body, Controller, Get, Header, Headers, HttpException, Inject, Param, ParseUUIDPipe, Post, Req, Res, UseFilters, Catch, ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PatientAdminChecklistListSchema, PatientAdminChecklistResultSchema, SetPatientAdminChecklistSchema } from '@dental/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { PatientsService } from '../application/patients.service';

type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

@Catch()
export class PatientAdminChecklistExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException && [400, 401, 403, 404, 409, 503].includes(error.getStatus()) ? error.getStatus() : 503;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const disabled = status === 503 && typeof raw === 'object' && raw !== null && 'code' in raw && raw.code === 'patient_admin_checklist_disabled';
    const messages: Record<number, string> = {
      400: 'Invalid checklist request', 401: 'Authentication required', 403: 'Administrative checklist scope denied',
      404: 'Patient record unavailable', 409: 'Checklist changed; refresh before saving', 503: 'Checklist unavailable',
    };
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store').status(status).json({
      statusCode: status,
      message: disabled ? 'Checklist is disabled pending local database and privacy review' : messages[status],
      ...(disabled ? { code: 'patient_admin_checklist_disabled' } : {}),
    });
  }
}

@ApiTags('patients')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Clinic-Id', required: true })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Active same-clinic reception, manager or dentist membership required' })
@ApiResponse({ status: 503, description: 'Checklist disabled pending local database and privacy review' })
@Controller('patients/:id/admin-document-checklist')
@Access('staff')
@UseFilters(PatientAdminChecklistExceptionFilter)
export class PatientAdminChecklistController {
  constructor(@Inject(PatientsService) private readonly patients: PatientsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read the current clinic-only manual CNSS/CNOPS checklist states' })
  @ApiResponse({ status: 200, schema: z.toJSONSchema(PatientAdminChecklistListSchema, { target: 'openapi-3.0' }) as ApiSchema })
  list(@Req() request: AuthorizedRequest, @Param('id', new ParseUUIDPipe()) patientId: string) {
    if (Object.keys(request.query).length) throw new BadRequestException();
    return this.patients.listAdminChecklist(request.actor, patientId, request.correlationId);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Set a manually reviewed CNSS/CNOPS paperwork status; does not submit a claim or decide eligibility' })
  @ApiBody({ schema: z.toJSONSchema(SetPatientAdminChecklistSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 201, schema: z.toJSONSchema(PatientAdminChecklistResultSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 200, description: 'Exact idempotent replay', schema: z.toJSONSchema(PatientAdminChecklistResultSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 409, description: 'Stale revision or changed idempotency key' })
  async set(
    @Req() request: AuthorizedRequest,
    @Param('id', new ParseUUIDPipe()) patientId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(request.query).length) throw new BadRequestException();
    const result = await this.patients.setAdminChecklist(request.actor, patientId, body, key, request.correlationId);
    response.status(result.replayed ? 200 : 201);
    return result;
  }
}
