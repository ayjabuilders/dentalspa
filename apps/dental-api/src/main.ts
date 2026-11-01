// Vercel detects the NestJS server from a direct framework import in this entrypoint.
import '@nestjs/core';
import { createApplication } from './bootstrap.js';
import { resolveListenHost } from './runtime-host.js';
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4300);

void createApplication().then(app => {
  const host = resolveListenHost(process.env);
  return host ? app.listen(port, host) : app.listen(port);
});
