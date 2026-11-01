import assert from 'node:assert/strict';

// Run against emitted JavaScript, with Node's CommonJS-to-ESM bridge disabled.
// This catches runtime failures that a TypeScript build or Vitest transform misses.
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.ALLOWED_ORIGINS = 'https://clinic.example.com';
const { createApplication } = await import('../dist/bootstrap.js');
const app = await createApplication();
try {
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const health = await fetch(`${origin}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const privateRoute = await fetch(`${origin}/api/v1/me/workspaces`, {
    headers: { Origin: 'https://clinic.example.com' },
  });
  assert.equal(privateRoute.status, 401);
  assert.equal(privateRoute.headers.get('access-control-allow-origin'), 'https://clinic.example.com');
  assert.equal((await fetch(`${origin}/api/docs`)).status, 404);
  console.log('Native runtime passed: health, authentication boundary, CORS and production docs exclusion.');
} finally {
  await app.close();
}
