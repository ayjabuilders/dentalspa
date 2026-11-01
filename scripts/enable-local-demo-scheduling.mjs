import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const clinicId = '10000000-0000-4000-8000-000000000001';
const resources = [
  ['74000000-0000-4000-8000-000000000001', 'provider', 'Praticien·ne de démonstration A'],
  ['74000000-0000-4000-8000-000000000002', 'provider', 'Praticien·ne de démonstration B'],
  ['74000000-0000-4000-8000-000000000003', 'chair', 'Fauteuil de démonstration 01'],
  ['74000000-0000-4000-8000-000000000004', 'chair', 'Fauteuil de démonstration 02'],
];

function dockerPath() {
  const candidates = process.platform === 'win32'
    ? [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'), 'docker.exe']
    : ['docker'];
  const executable = candidates.find(candidate => candidate.includes('/') || candidate.includes('\\') ? existsSync(candidate) : true);
  if (!executable) throw new Error('Docker Desktop CLI is unavailable.');
  return executable;
}

function localSupabaseStatus() {
  if (process.platform === 'win32') {
    const dockerDirectory = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin');
    process.env.PATH = `${dockerDirectory};${process.env.PATH ?? ''}`;
  }
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], { encoding: 'utf8', windowsHide: true })
    : spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Start the local Supabase stack before enabling the planning demo.');
  let status;
  try { status = JSON.parse(result.stdout); } catch { throw new Error('Local Supabase did not return status JSON.'); }
  const api = new URL(status.API_URL);
  if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.port !== '54321') {
    throw new Error('Refusing to enable scheduling outside the loopback-only local Supabase project.');
  }
}

function enableApiGate() {
  const envPath = join(process.cwd(), 'apps', 'dental-api', '.env.local');
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const url = current.match(/^SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  if (url !== 'http://127.0.0.1:54321') throw new Error('Dental API must point to the loopback-only local Supabase URL.');
  const pattern = /^ENABLE_SCHEDULING_HOLDS=.*$/m;
  const updated = pattern.test(current)
    ? current.replace(pattern, 'ENABLE_SCHEDULING_HOLDS=true')
    : `${current}${current && !current.endsWith('\n') ? '\n' : ''}ENABLE_SCHEDULING_HOLDS=true\n`;
  if (updated !== current) writeFileSync(envPath, updated, 'utf8');
}

function main() {
  localSupabaseStatus();
  enableApiGate();
  const rows = resources.map(([id, kind, label]) => `('${id}','${clinicId}','${kind}','${label}',true,true)`).join(',');
  const ids = resources.map(([id]) => `'${id}'`).join(',');
  const sql = `begin;
insert into private.scheduling_settings(clinic_id,enabled,synthetic_only) values('${clinicId}',true,true) on conflict(clinic_id) do update set enabled=true,synthetic_only=true;
insert into private.scheduling_resources(id,clinic_id,kind,display_name,active,synthetic_only) values ${rows} on conflict(id) do update set clinic_id=excluded.clinic_id,kind=excluded.kind,display_name=excluded.display_name,active=true,synthetic_only=true;
delete from private.scheduling_windows where clinic_id='${clinicId}' and resource_id in(${ids});
with days as(select (timezone('Africa/Casablanca',clock_timestamp())::date + n)::date as local_day from generate_series(0,44) n), blocks as(select local_day,starts,ends from days cross join lateral(values(time '09:00',time '12:00'),(time '14:00',time '18:00')) b(starts,ends) where extract(isodow from local_day) between 1 and 6), selected_resources as(select id from private.scheduling_resources where clinic_id='${clinicId}' and id in(${ids})) insert into private.scheduling_windows(clinic_id,resource_id,starts_at,ends_at) select '${clinicId}',r.id,(b.local_day+b.starts) at time zone 'Africa/Casablanca',(b.local_day+b.ends) at time zone 'Africa/Casablanca' from blocks b cross join selected_resources r;
commit;`;
  execFileSync(dockerPath(), ['exec', 'supabase_db_Dental_Spa', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('Enabled the fictional Agenda hold demo on local Supabase only. Restart Dental API to load its local gate.');
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : 'Local planning demo setup failed.');
  process.exitCode = 1;
}
