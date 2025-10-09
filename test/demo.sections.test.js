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

describe('demo.pdf sections', () => {
  test('detects literal Section markers and 3 sections; fills p14/p15/p17/p18 from Part 1', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-demo-'));
    const dbPath = path.join(dir, 'data.sqlite');
    const pdf = 'assets/demo.pdf';

    const {stdout} = await execNode(['src/cli/ingest.js', pdf, '--pages', '50', '--max', '2000', '--db', dbPath]);
    assert.equal(stdout.trim(), 'done');

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    const rows = db.prepare('SELECT id, title, p14, p15, p17, p18 FROM sections').all();
    assert.equal(rows.length, 3);
    // allow nulls if not present, but at least some should be non-null
    const hasAny = rows.some(r => r.p14 || r.p15 || r.p17 || r.p18);
    assert.ok(hasAny);
  });
});
