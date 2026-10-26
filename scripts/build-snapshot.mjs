import { mkdir, mkdtemp, readFile, writeFile, rename, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Publish only after the complete build process returns success. Readers see
// either the preceding complete snapshot or the new complete snapshot.
export async function buildAndPublish(directory, run) {
  await mkdir(directory, { recursive: true });
  const temporary = await mkdtemp(join(directory, 'candidate-'));
  const candidate = join(temporary, 'status.json');
  const snapshotId = randomUUID();
  try {
    const code = await run({ DENTAL_BUILD_CANDIDATE: candidate, DENTAL_BUILD_SNAPSHOT_ID: snapshotId });
    if (code !== 0) throw new Error('Clinic build failed; previous delivery snapshot retained.');
    const snapshot = JSON.parse(await readFile(candidate, 'utf8'));
    if (snapshot.snapshotId !== snapshotId || snapshot.productModules?.length !== 21 || !Array.isArray(snapshot.tasks)) throw new Error('Missing or invalid build snapshot; previous snapshot retained.');
    snapshot.successfulAt = new Date().toISOString();
    await writeFile(candidate, JSON.stringify(snapshot));
    await rename(candidate, join(directory, 'latest.json'));
    return snapshot;
  } finally {
    await unlink(candidate).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(temporary);
  }
}
