import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApplication } from '../../apps/dental-api/src/bootstrap';

describe('hosted API browser boundary using actual bootstrap', () => {
  let app: INestApplication;
  const origin = 'https://clinic.example.com';
  beforeAll(async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOWED_ORIGINS', origin + ',https://pass.example.com');
    app = await createApplication();
    await app.init();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  it('permits browser preflight for private document upload headers', async () => {
    const response = await request(app.getHttpServer()).options('/api/v1/patients/20000000-0000-4000-8000-000000000001/documents/uploads')
      .set('Origin', origin).set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,x-clinic-id,content-type,idempotency-key,x-document-section,x-document-category,x-document-date,x-document-title').expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    const allowed = String(response.headers['access-control-allow-headers']).toLowerCase().split(',');
    for (const name of ['authorization', 'x-clinic-id', 'content-type', 'idempotency-key', 'x-document-section', 'x-document-category', 'x-document-date', 'x-document-title']) expect(allowed).toContain(name);
  });

  it.each(['https://clinic.example.com.attacker.test', 'http://localhost:4204', 'null'])('does not grant browser access to %s', async foreign => {
    const response = await request(app.getHttpServer()).options('/api/v1/me/workspaces').set('Origin', foreign)
      .set('Access-Control-Request-Method', 'GET');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps authentication mandatory even for the allowed frontend', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me/workspaces').set('Origin', origin).expect(401);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not publish the interactive API explorer in production', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(404);
  });
});
