import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public development metadata only. Never read live source files, credentials,
// account state or patient records; only the allowlisted successful-build artifact.
export async function GET() {
  try {
    const data = JSON.parse(await readFile(path.resolve(process.cwd(), '.build-status/latest.json'), 'utf8'));
    if (!data.successfulAt || !data.snapshotId) throw new Error('Unpublished snapshot');
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ message: 'Aucun instantané de build réussi disponible.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
