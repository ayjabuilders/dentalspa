import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function supabaseStatus() {
  if (process.platform === 'win32') {
    const dockerDirectory = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin');
    process.env.PATH = `${dockerDirectory};${process.env.PATH ?? ''}`;
  }
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], { encoding: 'utf8', windowsHide: true })
    : spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Start the local Supabase stack before enabling the demo.');
  try { return JSON.parse(result.stdout); } catch { throw new Error('Local Supabase did not return status JSON.'); }
}

function configureLocalApiGate() {
  const envPath = join(process.cwd(), 'apps', 'dental-api', '.env.local');
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const existing = current.match(/^DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY=(.*)$/m)?.[1]?.trim();
  const key = existing || randomBytes(32).toString('base64url');
  if (!/^[A-Za-z0-9_-]{40,}$/.test(key)) throw new Error('Existing local database gate key is invalid.');
  const set = (source, name, value) => {
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    return pattern.test(source)
      ? source.replace(pattern, `${name}=${value}`)
      : `${source}${source && !source.endsWith('\n') ? '\n' : ''}${name}=${value}\n`;
  };
  const updated = set(set(current, 'DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY', key), 'ENABLE_DEMO_BOOKING_CONFIRMATIONS', 'true');
  if (updated !== current) writeFileSync(envPath, updated, 'utf8');
  return key;
}

function dockerPath() {
  const candidates = process.platform === 'win32'
    ? [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'), 'docker.exe']
    : ['docker'];
  const executable = candidates.find(candidate => candidate.includes('/') || candidate.includes('\\') ? existsSync(candidate) : true);
  if (!executable) throw new Error('Docker Desktop CLI is unavailable.');
  return executable;
}

function main() {
  const status = supabaseStatus();
  const api = new URL(status.API_URL);
  if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1') {
    throw new Error('Refusing to change any non-local Supabase project.');
  }
  const key = configureLocalApiGate();
  const sql = `update private.demo_booking_confirmation_settings set enabled=true,api_gate_key='${key}' where singleton=true; insert into private.demo_booking_sample_resources(id,clinic_id,kind,display_name) values ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo A'),('73000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo B'),('73000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo A'),('73000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo B') on conflict (id) do update set clinic_id=excluded.clinic_id,kind=excluded.kind,display_name=excluded.display_name,active=true;`;
  execFileSync(dockerPath(), ['exec', 'supabase_db_Dental_Spa', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('Enabled the fictional booking-confirmation demo on local Supabase only. Restart Dental API to load its local gate.');
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : 'Local booking demo setup failed.');
  process.exitCode = 1;
}
