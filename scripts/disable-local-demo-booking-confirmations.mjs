import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function main() {
  if (process.platform === 'win32') {
    const dockerDirectory = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin');
    process.env.PATH = `${dockerDirectory};${process.env.PATH ?? ''}`;
  }
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], { encoding: 'utf8', windowsHide: true })
    : spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Start local Supabase before changing the demo gate.');
  const status = JSON.parse(result.stdout);
  const url = new URL(status.API_URL);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '54321') throw new Error('Refusing to change a non-local Supabase project.');

  const envPath = join(process.cwd(), 'apps', 'dental-api', '.env.local');
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const pattern = /^ENABLE_DEMO_BOOKING_CONFIRMATIONS=.*$/m;
  const updated = pattern.test(current)
    ? current.replace(pattern, 'ENABLE_DEMO_BOOKING_CONFIRMATIONS=false')
    : `${current}${current && !current.endsWith('\n') ? '\n' : ''}ENABLE_DEMO_BOOKING_CONFIRMATIONS=false\n`;
  if (updated !== current) writeFileSync(envPath, updated, 'utf8');

  const docker = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
  const executable = process.platform === 'win32' && existsSync(docker) ? docker : 'docker';
  execFileSync(executable, ['exec', 'supabase_db_Dental_Spa', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "update private.demo_booking_confirmation_settings set enabled=false,api_gate_key='' where singleton"], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('Disabled synthetic booking confirmations on local Supabase only. Restart Dental API to load the local gate. Existing synthetic rows were preserved.');
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not disable local demo confirmations.');
  process.exitCode = 1;
}
