import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const apiEnv = join(process.cwd(), 'apps', 'dental-api', '.env.local');
if (!existsSync(apiEnv)) throw new Error('Local Dental API .env.local is missing.');
const original = readFileSync(apiEnv, 'utf8');
const envValue = (name) => original.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim();
const supabaseUrl = new URL(envValue('SUPABASE_URL') ?? '');
if (supabaseUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(supabaseUrl.hostname)) {
  throw new Error('Refusing to configure a non-loopback Supabase endpoint.');
}
const docker = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
if (!existsSync(docker)) throw new Error('Docker Desktop CLI was not found at the per-user install path.');
const hmacSecret = randomBytes(32).toString('base64url');
const gateKey = randomBytes(32).toString('base64url');
const names = new Set(['ENABLE_DEMO_FAKE_INBOX', 'DEMO_FAKE_INBOX_HMAC_SECRET', 'DEMO_FAKE_INBOX_DATABASE_GATE_KEY']);
const kept = original.split(/\r?\n/).filter(line => ![...names].some(name => line.startsWith(`${name}=`)) && line.length > 0);
kept.push('ENABLE_DEMO_FAKE_INBOX=true', `DEMO_FAKE_INBOX_HMAC_SECRET=${hmacSecret}`, `DEMO_FAKE_INBOX_DATABASE_GATE_KEY=${gateKey}`);
writeFileSync(apiEnv, `${kept.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
const quote = value => `'${value.replaceAll("'", "''")}'`;
const sql = `update private.demo_fake_inbox_settings set enabled=true,api_gate_key=${quote(gateKey)} where singleton;`;
const result = spawnSync(docker, ['exec', '-i', 'supabase_db_Dental_Spa', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
  input: sql,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 15000,
});
if (result.error || result.status !== 0) {
  throw new Error('Could not enable the local fake inbox database gate. Verify the local Supabase database container is running; secret values were not printed.');
}
console.log('Local synthetic webhook configured. Restart only the local Dental API to load its new secret.');
