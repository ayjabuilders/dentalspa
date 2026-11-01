import { BadRequestException, Controller, Get, Header, Headers, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DemoFakeInboundAcknowledgementSchema, DemoFakeInboxListSchema, DemoFakeWebhookEventSchema } from '@dental/contracts';
import { z } from 'zod';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { DemoFakeInboxService } from '../application/demo-fake-inbox.service';

type RawWebhookRequest = Request & { rawBody?: Buffer };
type ApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

@ApiTags('communications')
@Controller('communications')
export class DemoFakeInboxController {
  constructor(@Inject(DemoFakeInboxService) private readonly inbox: DemoFakeInboxService) {}

  @Post('demo-webhook') @Header('Cache-Control', 'no-store') @Access('public') @ApiHeader({ name: 'X-Demo-Signature', required: true })
  @ApiOperation({ summary: 'Accept an exact-body HMAC-signed, allowlisted local synthetic inbound event; no provider or send is enabled' })
  @ApiBody({ schema: z.toJSONSchema(DemoFakeWebhookEventSchema, { target: 'openapi-3.0' }) as ApiSchema })
  @ApiResponse({ status: 201, schema: z.toJSONSchema(DemoFakeInboundAcknowledgementSchema, { target: 'openapi-3.0' }) as ApiSchema })
  receive(@Req() request: RawWebhookRequest, @Headers('x-demo-signature') signature: string | undefined) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    if (request.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.origin)) {
      throw new UnauthorizedException('Local synthetic webhooks are available only from localhost');
    }
    if (!Buffer.isBuffer(request.rawBody)) throw new BadRequestException('Synthetic event body unavailable');
    return this.inbox.receive(request.rawBody, signature);
  }

  @Get('demo-inbox') @Header('Cache-Control', 'no-store') @Access('staff') @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the verified same-clinic synthetic inbound inbox; only active Reception and Manager roles' })
  @ApiResponse({ status: 200, schema: z.toJSONSchema(DemoFakeInboxListSchema, { target: 'openapi-3.0' }) as ApiSchema })
  list(@Req() request: AuthorizedRequest) {
    if (Object.keys(request.query).length) throw new BadRequestException('Query parameters are not supported');
    return this.inbox.list(request.actor);
  }
}
