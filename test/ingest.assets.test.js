import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs';

function execNode(args, opts={}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, opts, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, {stdout, stderr}));
      resolve({stdout, stderr});
    });
  });
}

describe('ingest CLI with real PDF (assets)', () => {
  test('reads first pages quickly and outputs valid JSON', async () => {
    const pdf = 'assets/demo.pdf';
    const {stdout} = await execNode(['src/cli/ingest.js', pdf, '--pages', '3', '--max', '800']);
    assert.equal(stdout.trim(), 'done');
    const out = JSON.parse(await fs.promises.readFile('last-ingest.json', 'utf8'));
    assert.ok(out.meta.pageCount >= 1);
    assert.ok(Array.isArray(out.sections) && out.sections.length >= 1);
    assert.ok(Array.isArray(out.chunks) && out.chunks.length >= 1);
    assert.ok(out.chunks.length >= 1);
    assert.ok(out.chunks.some(c => typeof c.text === 'string' && c.text.length > 0));
  });
});
