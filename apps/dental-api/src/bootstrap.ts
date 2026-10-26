import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Request, Response, NextFunction } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { accessLog, safeCorrelation } from './audit/redaction';
export function describeApi(app: Parameters<typeof SwaggerModule.createDocument>[0]) {
  return SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Dental Spa Foundation API').setVersion('1.0').addBearerAuth().build());
}
export async function createApplication() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4200,http://localhost:4201,http://localhost:4202').split(','), methods: ['GET', 'OPTIONS'], allowedHeaders: ['Authorization', 'X-Clinic-Id', 'Content-Type', 'X-Correlation-Id'] });
  app.use((req: Request & { correlationId?: string }, res: Response, next: NextFunction) => {
    const start = Date.now();
    req.correlationId = safeCorrelation(req.headers['x-correlation-id']);
    res.setHeader('X-Correlation-Id', req.correlationId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.on('finish', () => console.log(JSON.stringify(accessLog(req.correlationId!, req.method, res.statusCode, Date.now() - start))));
    next();
  });
  const specification = describeApi(app);
  if (process.env.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, specification);
  return app;
}
