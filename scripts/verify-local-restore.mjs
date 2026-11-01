import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Deliberately pinned to the synthetic local stack. No hosted URL is accepted.
const container = 'supabase_db_Dental_Spa';
const dockerPath = process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe')
  : 'docker';
const docker = existsSync(dockerPath) ? dockerPath : 'docker';
const suffix = `${Date.now()}_${randomBytes(6).toString('hex')}`;
const target = `dental_restore_${suffix}`;
const archive = `/tmp/${target}.dump`;
let created = false;
let sourceSnapshot;
let snapshotClient;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function openSnapshot() {
  const status = spawnSync(process.execPath, [join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], {
    cwd: root, encoding: 'utf8', timeout: 20000, env: { ...process.env, PATH: `${dirname(dockerPath)}${delimiter}${process.env.PATH ?? ''}` },
  });
  if (status.status !== 0) throw new Error('Cannot discover local database endpoint.');
  const url = new URL(JSON.parse(status.stdout).DB_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.port !== '54322' || url.pathname !== '/postgres' || url.username !== 'postgres' || url.search || url.hash) {
    throw new Error('Refusing non-local snapshot connection.');
  }
  snapshotClient = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  snapshotClient.on('error', () => {});
  try {
    await snapshotClient.connect();
    await snapshotClient.query('begin isolation level repeatable read read only');
    const result = await snapshotClient.query('select pg_export_snapshot() snapshot');
    sourceSnapshot = result.rows[0].snapshot;
    if (!/^[0-9A-F-]+$/u.test(sourceSnapshot)) throw new Error('Invalid snapshot identifier.');
  } catch { throw new Error('Could not establish read-only local snapshot; details withheld.'); }
}

function validateCleanupTarget() {
  if (!/^dental_restore_\d+_[a-f0-9]{12}$/u.test(target) || archive !== `/tmp/${target}.dump`) {
    throw new Error('Unsafe cleanup target refused.');
  }
}

function run(args, input) {
  const result = spawnSync(docker, ['exec', '-i', container, ...args], {
    input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  // Never print SQL rows, dumps or stderr: errors can contain patient values.
  if (result.error || result.status !== 0) {
    const category = ['already exists', 'permission denied', 'must be owner', 'could not open extension', 'unrecognized configuration parameter', 'does not exist', 'can only create extension', 'not superuser', 'must be superuser']
      .find(message => result.stderr?.includes(message)) ?? 'unclassified';
    if (args[0] === 'pg_restore') {
      const diagnostic = result.stderr?.split('\n').find(line => line.includes('ERROR:'));
      if (diagnostic) console.error(diagnostic.replace(/"[^"\n]*"|'[^'\n]*'/gu, '[redacted identifier]'));
    }
    throw new Error(`Local restore command ${args[0]} failed (exit ${result.status ?? 'unavailable'}, ${category}); raw output withheld.`);
  }
  return result.stdout;
}
function sql(database, query, role = 'postgres') {
  if (database === 'postgres' && sourceSnapshot) query = `begin isolation level repeatable read read only; set transaction snapshot '${sourceSnapshot}';\n${query}\nrollback;`;
  return run(['psql', '-X', '-q', '-U', role, '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], query).trim();
}
const namespaces = "('public','private','auth','storage','supabase_migrations')";
function canonicalChecks(sourceSchema) {
  // PostgreSQL can flatten associative AND expressions when restoring a dump.
  // Reparse only CHECK definitions in empty temporary tables on the TARGET.
  // Never strip parentheses or otherwise rewrite SQL with a heuristic.
  const checks = JSON.parse(sql('postgres', `select coalesce(json_agg(x),'[]') from (
    select format('%I.%I',n.nspname,c.relname) relation,
      pg_get_constraintdef(k.oid) definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid
      join pg_namespace n on n.oid=c.relnamespace
    where k.contype='c' and n.nspname in ${namespaces} order by n.nspname,c.relname,k.conname
  ) x;`));
  const definitions = sql(target, 'begin;\n' + checks.map(check => `
    create temporary table restore_constraint_probe (like ${check.relation});
    alter table restore_constraint_probe add constraint restore_probe ${check.definition};
    select to_json(pg_get_constraintdef(oid)) from pg_constraint
      where conrelid='pg_temp.restore_constraint_probe'::regclass and conname='restore_probe';
    drop table restore_constraint_probe;`).join('\n') + '\nrollback;', 'supabase_admin').split('\n');
  if (definitions.length !== checks.length) throw new Error('Constraint canonicalization result count mismatch.');
  let normalized = sourceSchema;
  checks.forEach((check, i) => {
    normalized = normalized.split(check.definition).join(JSON.parse(definitions[i]));
  });
  return normalized;
}
function verifyRestoredAccess() {
  const output = sql(target, readFileSync(join(root, 'supabase/tests/session_reads.test.sql'), 'utf8'));
  const lines = output.split('\n');
  const plan = lines.find(line => /^1\.\.\d+$/u.test(line));
  const passed = lines.filter(line => /^ok \d+\b/u.test(line)).length;
  if (!plan || lines.some(line => /^(?:not ok|Bail out!|# Looks like)/u.test(line)) || passed !== Number(plan.slice(3))) {
    throw new Error('Restored session/tenant access checks failed; raw rows withheld.');
  }
  console.log(`PASS: ${passed} restored database session/tenant access assertions.`);
}
function manifest(database) {
  const tables = sql(database, `select format('%I.%I', n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ${namespaces} and c.relkind='r' order by 1;`).split('\n').filter(Boolean);
  const rows = sql(database, tables.map(table =>
    `select count(*), md5(coalesce(string_agg(row_hash, '' order by row_hash),''))
     from (select md5(row_to_json(t)::text) row_hash from ${table} t) hashes;`).join('\n'));
  const schema = run(['pg_dump', '-U', 'postgres', '-d', database, '--schema-only',
    ...(database === 'postgres' && sourceSnapshot ? [`--snapshot=${sourceSnapshot}`] : []),
    '--schema=public', '--schema=private', '--schema=auth', '--schema=storage', '--schema=supabase_migrations'])
    .split('\n').filter(line => !/^\\(?:un)?restrict /u.test(line)).join('\n');
  return { tables: tables.length, names: tables, rows, schema: createHash('sha256').update(schema).digest('hex'), schemaLines: schema.split('\n') };
}

try {
  console.log('Reading local source fingerprints; no patient values are written to logs.');
  await openSnapshot();
  const before = manifest('postgres');
  run(['pg_dump', '-U', 'postgres', '-d', 'postgres', `--snapshot=${sourceSnapshot}`, '-Fc', '-f', archive]);
  run(['createdb', '-U', 'postgres', '--template=template0', target]);
  created = true;
  // Local Supabase's postgres role cannot restore platform-owned Auth/Storage
  // objects. The existing local cluster administrator preserves their owners.
  run(['pg_restore', '-U', 'supabase_admin', '-d', target, '--exit-on-error', archive]);
  const restored = manifest(target);
  const after = manifest('postgres');
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Source changed during rehearsal. Retry when local demo writes are idle.');
  }
  const canonicalSource = canonicalChecks(before.schemaLines.join('\n'));
  const schemaMatches = createHash('sha256').update(canonicalSource).digest('hex') === restored.schema;
  if (JSON.stringify(before.names) !== JSON.stringify(restored.names) || before.rows !== restored.rows || !schemaMatches) {
    console.log(`Table identities match: ${JSON.stringify(before.names) === JSON.stringify(restored.names)}; row fingerprints match: ${before.rows === restored.rows}; schema matches: ${before.schema === restored.schema}`);
    const index = before.schemaLines.findIndex((line, i) => line !== restored.schemaLines[i]);
    if (index >= 0) console.log(`First schema difference at dump line ${index + 1}; definition contents withheld.`);
    throw new Error('Restored data or schema differs from the source; rehearsal failed.');
  }
  console.log(`PASS: ${restored.tables} tables, row fingerprints and schema (including policies/grants) match.`);
  verifyRestoredAccess();
  console.log('Scope: local database only; shared cluster roles, Storage file bytes and hosted disaster recovery are not verified.');
} finally {
  // Generated identifiers only; never drop/reset the source database or stack.
  validateCleanupTarget();
  try {
    if (created) run(['dropdb', '-U', 'postgres', target]);
  } finally {
    try { run(['rm', '-f', '--', archive]); }
    finally { if (snapshotClient) await snapshotClient.end(); }
  }
  console.log('Temporary restore database and archive cleaned up.');
}
