import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAndPublish } from '../../scripts/build-snapshot.mjs';

it('publishes success atomically and retains it after failed or invalid builds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dental-snapshot-test-'));
  try {
    const first = await buildAndPublish(directory, async env => {
      await writeFile(env.DENTAL_BUILD_CANDIDATE, JSON.stringify({ snapshotId: env.DENTAL_BUILD_SNAPSHOT_ID, productModules: Array(21).fill({}), tasks: [] }));
      return 0;
    });
    expect(first.successfulAt).toBeTruthy();
    const published = await readFile(join(directory, 'latest.json'), 'utf8');
    await expect(buildAndPublish(directory, async env => {
      await writeFile(env.DENTAL_BUILD_CANDIDATE, '{}');
      return 1;
    })).rejects.toThrow(/failed/);
    expect(await readFile(join(directory, 'latest.json'), 'utf8')).toBe(published);
    await expect(buildAndPublish(directory, async env => {
      await writeFile(env.DENTAL_BUILD_CANDIDATE, '{}');
      return 0;
    })).rejects.toThrow(/invalid/);
    expect(await readFile(join(directory, 'latest.json'), 'utf8')).toBe(published);
    const second = await buildAndPublish(directory, async env => {
      await writeFile(env.DENTAL_BUILD_CANDIDATE, JSON.stringify({ snapshotId: env.DENTAL_BUILD_SNAPSHOT_ID, productModules: Array(21).fill({}), tasks: [] }));
      return 0;
    });
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8')).snapshotId).toBe(second.snapshotId);
    expect(await readdir(directory)).toEqual(['latest.json']);
  } finally {
    await unlink(join(directory, 'latest.json')).catch(() => {});
    await rmdir(directory);
  }
});
