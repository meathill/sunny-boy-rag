// Skip DB tests if native binding not available
let hasDb = true;
try {
  const { default: Database } = await import('better-sqlite3');
  const t = new Database(':memory:');
  t.close();
} catch {
  hasDb = false;
}

import {describe, test, before} from 'node:test';
import assert from 'node:assert/strict';

describe('sqlite db', { skip: !hasDb }, () => {
  let db;
  let initDb, saveChunks;
  before(async () => {
    ({ initDb, saveChunks } = await import('../src/db/sqlite.js'));
    db = initDb(':memory:');
  });

  test('initializes schema', () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'").all();
    assert.equal(rows.length, 1);
  });

  test('saves chunks in a transaction', () => {
    const chunks = [
      { id: 'ch:1', sourceId: 'doc1', sectionId: 'sec:1', title: '总则', startPage: 1, endPage: 1, text: '内容A' },
      { id: 'ch:2', sourceId: 'doc1', sectionId: 'sec:1.1', title: '范围', startPage: 1, endPage: 1, text: '内容B' }
    ];
    const n0 = db.prepare('SELECT COUNT(*) AS n FROM chunks').get().n;
    saveChunks(db, chunks);
    const n1 = db.prepare('SELECT COUNT(*) AS n FROM chunks').get().n;
    assert.equal(n1 - n0, chunks.length);

    const row = db.prepare('SELECT * FROM chunks WHERE id = ?').get('ch:1');
    assert.equal(row.source_id, 'doc1');
    assert.equal(row.text, '内容A');
  });

  test('upsert by id replaces existing chunk', () => {
    saveChunks(db, [{ id: 'ch:1', sourceId: 'doc1', sectionId: 'sec:1', title: '总则2', startPage: 1, endPage: 2, text: '内容A2' }]);
    const row = db.prepare('SELECT * FROM chunks WHERE id = ?').get('ch:1');
    assert.equal(row.title, '总则2');
    assert.equal(row.end_page, 2);
  });
});
