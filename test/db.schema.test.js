import {describe, test, before} from 'node:test';
import assert from 'node:assert/strict';

let hasDb = true;
try { const { default: Database } = await import('better-sqlite3'); const t = new Database(':memory:'); t.close(); } catch { hasDb = false; }

describe('schema: sections/parts', { skip: !hasDb }, () => {
  let db, initDb, saveSections, saveChunks;
  before(async () => {
    ({ initDb, saveSections, saveChunks } = await import('../src/db/sqlite.js'));
    db = initDb(':memory:');
  });

  test('tables exist', () => {
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert.ok(names.includes('sections'));
    assert.ok(names.includes('parts'));
  });

  test('saveSections inserts and chunks link to section', () => {
    const src = 'docZ.pdf';
    const sections = [{ id: '1', section: '1', title: '总则', startPage: 1, endPage: 2, overview: null, p14: null, p15: null, p17: null, p18: null }];
    saveSections(db, src, sections);
    const row = db.prepare('SELECT * FROM sections WHERE id = ?').get('1');
    assert.equal(row.id, '1');
    assert.equal(row.title, '总则');

    // Save a chunk and verify foreign key by convention
    saveChunks(db, [{ id: 'ch:1', sourceId: src, sectionId: '1', title: 't', startPage: 1, endPage: 1, text: 'a' }]);
    const c = db.prepare('SELECT * FROM chunks WHERE id = ?').get('ch:1');
    assert.equal(c.section_id, '1');
  });
});
