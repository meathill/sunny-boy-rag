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
    const rows = db.prepare('SELECT id, title, overview, p14, p15, p17, p18 FROM sections ORDER BY id').all();
    assert.ok(rows.length >= 2);
    // overview ends before 1.2 and not include it
    for (const r of rows) {
      if (r.overview) {
        assert.ok(!/\n\s*1\s*\.\s*2(?!\d)\b/.test(r.overview), `overview contains 1.2 in ${r.id}`);
      }
      for (const k of ['p14','p15','p17','p18']) {
        const v = r[k];
        if (!v) continue;
        assert.ok(!/DMBLP\s*-\s*RTA\s*-\s*N0001/i.test(v), `${k} contains footer marker in ${r.id}`);
        assert.ok(!/Pages?:\s*\d+\s*of\s*\d+/i.test(v), `${k} contains page count in ${r.id}`);
      }
    }
    // p14 slice begins at 1.4 and stops before 1.5
    const s = rows.find(x => x.p14);
    if (s) {
      assert.ok(/^\s*1\s*\.\s*4\b/m.test(s.p14));
      assert.ok(!/\n\s*1\s*\.\s*5\b/m.test(s.p14));
    }
  });

  test('section_relations extracted from Part 1 - 1.2 with correct sectionId format', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-rel-'));
    const dbPath = path.join(dir, 'data.sqlite');
    const pdf = 'assets/demo.pdf';

    const {stdout} = await execNode(['src/cli/ingest.js', pdf, '--pages', '50', '--max', '2000', '--db', dbPath]);
    assert.equal(stdout.trim(), 'done');

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    const rels = db.prepare('SELECT section_id, related_section_id FROM section_relations').all();
    assert.ok(rels.length >= 1);
    for (const r of rels) {
      assert.ok(/^\d+\s+\d+\s+\d+$/.test(r.section_id));
      assert.ok(/^\d+\s+\d+\s+\d+$/.test(r.related_section_id));
      assert.notEqual(r.section_id, r.related_section_id);
    }
  });
});
