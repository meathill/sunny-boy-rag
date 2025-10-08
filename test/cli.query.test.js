// DB query subcommand e2e (skip if native binding missing)
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

describe('ingest CLI query', { skip: !hasDb }, () => {
  test('list and get work with sqlite file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-q-'));
    const file = path.join(dir, 'doc.txt');
    const dbPath = path.join(dir, 'data.sqlite');
    await fs.writeFile(file, '1. 总则\n正文A\n1.1 范围\n正文B\n2. 定义\n正文C');

    await execNode(['src/cli/ingest.js', file, '--max', '200', '--overlap', '10', '--db', dbPath]);

    const {stdout: lsOut} = await execNode(['src/cli/ingest.js', 'list', '--db', dbPath, '--source', file]);
    const rows = JSON.parse(lsOut);
    assert.ok(rows.length >= 1);
    const id = rows[0].id;

    const {stdout: getOut} = await execNode(['src/cli/ingest.js', 'get', id, '--db', dbPath]);
    const row = JSON.parse(getOut);
    assert.equal(row.id, id);
  });
});
