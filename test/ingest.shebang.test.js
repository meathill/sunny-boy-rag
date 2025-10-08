// Direct execution with shebang (skip if DB binding missing)
let hasDb = true;
try {
  const { default: Database } = await import('better-sqlite3');
  const t = new Database(':memory:'); t.close();
} catch { hasDb = false; }

import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function execBin(file, args=[], opts={}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, opts, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, {stdout, stderr}));
      resolve({stdout, stderr});
    });
  });
}

describe('ingest shebang', { skip: !hasDb }, () => {
  test('executes ./src/cli/ingest.js and writes to sqlite', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-sh-'));
    const file = path.join(dir, 'doc.txt');
    const dbPath = path.join(dir, 'data.sqlite');
    await fs.writeFile(file, '1. 总则\n正文A\n1.1 范围\n正文B\n2. 定义\n正文C');

    const {stdout} = await execBin('./src/cli/ingest.js', [file, '--max', '200'], { env: { ...process.env, SUNNY_SQLITE: dbPath } });
    const out = JSON.parse(stdout);
    assert.ok(out.chunks.length >= 1);

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    const n = db.prepare('SELECT COUNT(*) AS n FROM chunks').get().n;
    assert.ok(n >= 1);
  });
});
