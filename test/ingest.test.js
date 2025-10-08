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

describe('ingest CLI', () => {
  test('prints usage without args', async () => {
    const {stderr} = await execNode(['src/cli/ingest.js']).catch(e => ({stderr: e.stderr}));
    assert.match(stderr, /Usage: ingest/);
  });

  test('processes a text file and outputs JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-'));
    const file = path.join(dir, 'doc.txt');
    await fs.writeFile(file, '1. 总则\n正文A\n1.1 范围\n正文B\n2. 定义\n正文C');

    const {stdout} = await execNode(['src/cli/ingest.js', file, '--max', '100']);
    const out = JSON.parse(stdout);
    assert.equal(out.meta.pageCount, 1);
    assert.ok(Array.isArray(out.sections) && out.sections.length >= 1);
    assert.ok(Array.isArray(out.chunks) && out.chunks.length >= 1);
  });
});
