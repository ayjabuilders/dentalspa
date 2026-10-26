import { Controller, Get } from '@nestjs/common';
import { Access } from './identity/presentation/policy.guard';
@Controller('health')
export class HealthController {
  @Get() @Access('public') health() { return { status: 'ok', milestone: 'M01', clinical_features: false }; }
}
