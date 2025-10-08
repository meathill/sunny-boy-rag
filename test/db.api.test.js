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

describe('sqlite api', { skip: !hasDb }, () => {
  let db, initDb, saveChunks, getChunk, getChunksBySource;
  before(async () => {
    ({ initDb, saveChunks, getChunk, getChunksBySource } = await import('../src/db/sqlite.js'));
    db = initDb(':memory:');
    saveChunks(db, [
      { id: 'ch:a', sourceId: 'docX', sectionId: 'sec:1', title: 'A', startPage: 1, endPage: 1, text: 'T1' },
      { id: 'ch:b', sourceId: 'docX', sectionId: 'sec:2', title: 'B', startPage: 2, endPage: 2, text: 'T2' },
      { id: 'ch:c', sourceId: 'docY', sectionId: 'sec:1', title: 'C', startPage: 1, endPage: 1, text: 'T3' }
    ]);
  });

  test('getChunk returns a single row', () => {
    const row = getChunk(db, 'ch:b');
    assert.equal(row.title, 'B');
  });

  test('getChunksBySource filters by source', () => {
    const rows = getChunksBySource(db, 'docX');
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.source_id === 'docX'));
  });
});
