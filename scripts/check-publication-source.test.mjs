import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectPublicationSource } from './check-publication-source.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'publication-source-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('publication-source-'));
    rmSync(root, { recursive: true, force: true });
  });
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, 'fixture Git operation failed');
  };
  git('init', '--quiet');
  return { root, git, put: (path, text) => writeFileSync(join(root, path), text) };
}

test('ignored credentials are excluded but forced tracked private files are blocked', (t) => {
  const { root, git, put } = fixture(t);
  put('.gitignore', '.env*\n!.env.example\n');
  put('.env.local', 'PRIVATE=value');
  put('.env.example', 'PUBLIC=placeholder');
  assert.equal(inspectPublicationSource(root).findings.length, 0);
  git('add', '-f', '.env.local');
  assert.deepEqual(inspectPublicationSource(root).findings, [{ path: '.env.local', kind: 'Private configuration file' }]);
});

test('detects server credentials without including their values in output', (t) => {
  const { root, put } = fixture(t);
  const key = ['sb', 'secret', 'x'.repeat(30)].join('_');
  const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'), Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 's'.repeat(32)].join('.');
  put('unsafe.txt', `header\n${key}\n${jwt}`);
  const result = inspectPublicationSource(root);
  assert.equal(result.findings.length, 2);
  assert.deepEqual(result.findings.map(f => f.line), [2, 3]);
  assert.equal(JSON.stringify(result).includes(key), false);
  assert.equal(JSON.stringify(result).includes(jwt), false);
});

test('distinguishes local fixture URLs from remote database passwords', (t) => {
  const { root, put } = fixture(t);
  put('urls.txt', ['postgres://postgres:postgres@localhost:54322/postgres', 'postgres://user:PASSWORD@db.example.com/postgres', 'postgres://user:' + 'synthetic-private-value' + '@db.example.com/postgres'].join('\n'));
  const result = inspectPublicationSource(root);
  assert.deepEqual(result.findings, [{ path: 'urls.txt', line: 3, kind: 'Credential-bearing database URL' }]);
});

test('reports binary and oversized files separately for review', (t) => {
  const { root, put } = fixture(t);
  put('asset.bin', Buffer.from([0, 1, 2]));
  put('large.txt', Buffer.alloc(5 * 1024 * 1024 + 1, 65));
  const result = inspectPublicationSource(root);
  assert.deepEqual(result.binaryFiles, ['asset.bin']);
  assert.deepEqual(result.oversizedFiles, ['large.txt']);
});
