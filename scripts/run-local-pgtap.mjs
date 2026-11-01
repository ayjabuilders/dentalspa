import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseCli = join(repo, 'node_modules', 'supabase', 'dist', 'supabase.js');
if (!existsSync(supabaseCli)) throw new Error('Supabase CLI dependency is missing. Run pnpm install first.');

const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`;
const projectId = `dental_spa_pgtap_${suffix}`;
const testRoot = mkdtempSync(join(tmpdir(), 'dental-spa-pgtap-'));
if (dirname(resolve(testRoot)) !== resolve(tmpdir()) || !basename(testRoot).startsWith('dental-spa-pgtap-')) {
  throw new Error('Refusing an isolated test directory outside the expected temporary parent.');
}
const testSupabase = join(testRoot, 'supabase');
const originalSupabase = join(repo, 'supabase');
let stackAttempted = false;
let cleanupSucceeded = false;

function sanitized(output) {
  return output.split(/\r?\n/u).map(line => {
    if (/(?:ANON_KEY|SECRET_KEY|PUBLISHABLE_KEY|SERVICE_ROLE_KEY|JWT_SECRET|S3_PROTOCOL_ACCESS_KEY|DB_URL=|API_URL=)/u.test(line)) return '[local Supabase connection material redacted]';
    return line.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/giu, '$1[redacted]$2');
  }).filter(Boolean).join('\n');
}

function runCli(args, label) {
  const result = spawnSync(process.execPath, [supabaseCli, ...args], {
    cwd: repo,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = sanitized(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (output) process.stdout.write(`${output}\n`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
}

function portAvailable(port) {
  return new Promise(resolvePort => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
  });
}

async function isolatedConfig() {
  const source = readFileSync(join(originalSupabase, 'config.toml'), 'utf8');
  for (const offset of [10000, 10500, 11000]) {
    const config = source
      .replace(/^project_id\s*=.*$/mu, `project_id = "${projectId}"`)
      .replace(/^([\t ]*[\w]*port\s*=\s*)(\d+)([\t ]*(?:#.*)?)$/gmu, (_, prefix, value, suffix) => `${prefix}${Number(value) + offset}${suffix}`);
    const seedStart = config.indexOf('[db.seed]');
    const seedEnd = config.indexOf('\n[', seedStart + 1);
    if (seedStart < 0 || seedEnd < 0) throw new Error('The Supabase config is missing its [db.seed] section.');
    let seed = config.slice(seedStart, seedEnd);
    seed = seed.replace(/^enabled\s*=.*$/mu, 'enabled = false').replace(/^sql_paths\s*=.*$/mu, 'sql_paths = []');
    const isolated = `${config.slice(0, seedStart)}${seed}${config.slice(seedEnd)}`;
    const ports = [...isolated.matchAll(/^[\t ]*[\w]*port\s*=\s*(\d+)/gmu)].map(match => Number(match[1]));
    if (await Promise.all(ports.map(portAvailable)).then(values => values.every(Boolean))) return isolated;
  }
  throw new Error('Could not reserve a free local port range for the isolated pgTAP stack.');
}

const dockerBin = process.platform === 'win32' && process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin')
  : null;
if (dockerBin && existsSync(join(dockerBin, 'docker.exe')) && !process.env.PATH?.split(delimiter).includes(dockerBin)) {
  process.env.PATH = `${dockerBin}${delimiter}${process.env.PATH ?? ''}`;
}

try {
  cpSync(join(originalSupabase, 'migrations'), join(testSupabase, 'migrations'), { recursive: true });
  cpSync(join(originalSupabase, 'tests'), join(testSupabase, 'tests'), { recursive: true });
  cpSync(join(originalSupabase, 'seed.sql'), join(testSupabase, 'seed.sql'));
  writeFileSync(join(testSupabase, 'config.toml'), await isolatedConfig());

  console.log(`Starting isolated local Supabase pgTAP project ${projectId} with synthetic seed disabled.`);
  stackAttempted = true;
  runCli(['start', '--workdir', testRoot], 'Starting isolated local Supabase');
  runCli(['db', 'reset', '--local', '--no-seed', '--yes', '--workdir', testRoot], 'Preparing the isolated, seedless test database');
  runCli(['db', 'test', '--local', '--workdir', testRoot], 'Running local pgTAP tests');
} finally {
  if (stackAttempted) {
    try {
      runCli(['stop', '--project-id', projectId, '--no-backup', '--workdir', testRoot], 'Stopping the isolated local Supabase project');
      cleanupSucceeded = true;
    } finally {
      if (cleanupSucceeded) rmSync(testRoot, { recursive: true, force: true });
      else console.error(`Isolated project cleanup needs review. Its temporary config remains at ${testRoot}.`);
    }
  } else {
    rmSync(testRoot, { recursive: true, force: true });
  }
}
