// Skip DB tests if native binding not available
let hasDb = true;
try {
  const { default: Database } = await import('better-sqlite3');
  const t = new Database(':memory:');
  t.close();
} catch {
  hasDb = false;
}

import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function execNode(args, opts={}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, opts, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, {stdout, stderr}));
      resolve({stdout, stderr});
    });
  });
}

describe('ingest CLI with --db', { skip: !hasDb }, () => {
  test('stores chunks into sqlite file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-db-'));
    const file = path.join(dir, 'doc.txt');
    const dbPath = path.join(dir, 'data.sqlite');
    await fs.writeFile(file, '1. 总则\n正文A\n1.1 范围\n正文B\n2. 定义\n正文C');

    await execNode(['src/cli/ingest.js', file, '--max', '200', '--db', dbPath]);

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'").all();
    assert.equal(tables.length, 1);
    const n = db.prepare('SELECT COUNT(*) AS n FROM chunks').get().n;
    assert.ok(n >= 1);
  });
});
