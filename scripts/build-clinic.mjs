import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildAndPublish } from './build-snapshot.mjs';

const require = createRequire(resolve(process.cwd(), 'package.json'));
try {
  await buildAndPublish(resolve('.build-status'), environment => {
    const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--webpack'], { stdio: 'inherit', env: { ...process.env, ...environment } });
    return result.status ?? 1;
  });
  console.log('Build Center: successful build snapshot published.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
