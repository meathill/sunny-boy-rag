// Skip if no binding
let hasDb = true;
try { const { default: Database } = await import('better-sqlite3'); const t = new Database(':memory:'); t.close(); } catch { hasDb = false; }

import {describe, test, before} from 'node:test';
import assert from 'node:assert/strict';

describe('documents table', { skip: !hasDb }, () => {
  let db, initDb, saveChunks, refreshDocument, getDocument;
  before(async () => {
    ({ initDb, saveChunks, refreshDocument, getDocument } = await import('../src/db/sqlite.js'));
    db = initDb(':memory:');
  });

  test('records chunk_count and processed_pages', () => {
    const src = 'docA.pdf';
    saveChunks(db, [
      { id: 'ch:1', sourceId: src, sectionId: 's1', title: 't1', startPage: 1, endPage: 1, text: 'a' },
      { id: 'ch:2', sourceId: src, sectionId: 's2', title: 't2', startPage: 2, endPage: 2, text: 'b' }
    ]);
    refreshDocument(db, src, { pageCount: 10, processedPages: 3 });
    let doc = getDocument(db, src);
    assert.equal(doc.page_count, 10);
    assert.equal(doc.chunk_count, 2);
    assert.equal(doc.processed_pages, 3);

    // another run with fewer pages should not decrease processed_pages
    saveChunks(db, [{ id: 'ch:3', sourceId: src, sectionId: 's3', title: 't3', startPage: 3, endPage: 3, text: 'c' }]);
    refreshDocument(db, src, { pageCount: 10, processedPages: 2 });
    doc = getDocument(db, src);
    assert.equal(doc.chunk_count, 3);
    assert.equal(doc.processed_pages, 3);
  });
});
