import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Deliberately report location/type only: never echo credentials into CI logs.
export function inspectPublicationSource(root = process.cwd()) {
  const listed = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error('Cannot enumerate Git publication candidates');
  const paths = [...new Set(listed.stdout.split('\0').filter(Boolean))];
  const findings = [], binaryFiles = [], oversizedFiles = [];
  let checkedTextFiles = 0;
  const patterns = [
    ['Supabase server key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/gu],
    ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/gu],
    ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu],
    ['Credential-bearing database URL', /\bpostgres(?:ql)?:\/\/[^\s:/]+:([^\s@]+)@[^\s]+/gu],
    ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu],
  ];
  for (const path of paths) {
    if (/(?:^|\/)(?:\.env(?:\..+)?|auth\.json|credentials\.json)$/u.test(path) && !path.endsWith('/.env.example') && path !== '.env.example') {
      findings.push({ path, kind: 'Private configuration file' });
      continue;
    }
    const absolute = resolve(root, path);
    let stat;
    try { stat = statSync(absolute); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile()) continue;
    if (stat.size > 5 * 1024 * 1024) { oversizedFiles.push(path); continue; }
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) { binaryFiles.push(path); continue; }
    checkedTextFiles++;
    const text = bytes.toString('utf8');
    for (const [kind, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        // Public JWTs may appear in examples; a decoded service role is never public.
        if (kind === 'JWT') {
          let claims;
          try { claims = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8')); } catch { continue; }
          if (claims.role !== 'service_role') continue;
        }
        if (kind === 'Credential-bearing database URL') {
          let url;
          try { url = new URL(match[0]); } catch { continue; }
          if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) continue;
          if (/^(?:\[.*\]|<.*>|PASSWORD|password|YOUR_PASSWORD|your-password|REDACTED|%5B.*%5D)$/iu.test(match[1])) continue;
        }
        findings.push({ path, line: text.slice(0, match.index).split('\n').length, kind });
      }
    }
  }
  return { candidateFiles: paths.length, checkedTextFiles, binaryFiles, oversizedFiles, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = inspectPublicationSource();
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length || result.oversizedFiles.length) process.exitCode = 1;
}
