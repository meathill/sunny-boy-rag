import { test } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import fs from 'fs';
import { 
  syncFTSTable,
  searchSectionsFullText,
  smartSearch,
  loadKeywordSeeds,
} from '../src/db/sqlite.js';

// Helper: create test database
function createTestDb() {
  const db = new Database(':memory:');
  
  // Create tables
  db.exec(`
    CREATE TABLE sections (
      id TEXT PRIMARY KEY,
      title TEXT,
      start_page INTEGER,
      end_page INTEGER,
      overview TEXT
    );
    
    CREATE TABLE product_keywords (
      section_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      keyword_type TEXT NOT NULL,
      language TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(section_id, keyword)
    );
    
    CREATE INDEX idx_product_keywords_keyword ON product_keywords(keyword);
    CREATE INDEX idx_product_keywords_section ON product_keywords(section_id);
    
    CREATE VIRTUAL TABLE sections_fts USING fts5(
      section_id UNINDEXED,
      title,
      overview,
      keywords,
      tokenize='unicode61'
    );
  `);
  
  // Insert test data
  db.exec(`
    INSERT INTO sections (id, title, start_page, end_page, overview) VALUES
      ('26 24 13', 'SWITCHBOARDS', 1, 10, 'Electrical distribution panels for power systems'),
      ('26 24 19', 'MOTOR CONTROL CENTER', 11, 20, 'MCC for motor control and protection'),
      ('26 25 13', 'LOW VOLTAGE BUSWAYS', 21, 30, 'Busbar trunking systems for low voltage distribution');
  `);
  
  // Load keywords
  const seedSQL = fs.readFileSync('./seeds/product-keywords.sql', 'utf-8');
  db.exec(seedSQL);
  
  return db;
}

test('syncFTSTable - populates FTS5 table', () => {
  const db = createTestDb();
  
  syncFTSTable(db);
  
  const count = db.prepare('SELECT COUNT(*) as cnt FROM sections_fts').get();
  assert.strictEqual(count.cnt, 3, 'Should sync 3 sections');
  
  // Verify keywords are included
  const ftsRow = db.prepare(`
    SELECT keywords FROM sections_fts WHERE section_id = '26 24 13'
  `).get();
  
  assert.ok(ftsRow.keywords.includes('switchboard'), 'Should include keywords');
  assert.ok(ftsRow.keywords.includes('panel board'), 'Should include synonyms');
  
  db.close();
});

test('searchSectionsFullText - simple search', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, 'motor');
  
  assert.strictEqual(results.length, 1, 'Should find 1 result');
  assert.strictEqual(results[0].id, '26 24 19');
  assert.ok(results[0].relevance !== undefined, 'Should have relevance score');
  
  db.close();
});

test('searchSectionsFullText - Boolean AND', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, 'motor AND control');
  
  assert.strictEqual(results.length, 1, 'Should find MCC');
  assert.strictEqual(results[0].id, '26 24 19');
  
  db.close();
});

test('searchSectionsFullText - Boolean OR', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, 'switchboard OR busway');
  
  assert.ok(results.length >= 2, 'Should find multiple results');
  const ids = results.map(r => r.id);
  assert.ok(ids.includes('26 24 13'), 'Should include SWITCHBOARDS');
  assert.ok(ids.includes('26 25 13'), 'Should include BUSWAYS');
  
  db.close();
});

test('searchSectionsFullText - phrase search', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, '"motor control"');
  
  assert.strictEqual(results.length, 1, 'Should find exact phrase');
  assert.strictEqual(results[0].id, '26 24 19');
  
  db.close();
});

test('searchSectionsFullText - prefix search', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, 'switch*');
  
  assert.ok(results.length >= 1, 'Should find with prefix');
  assert.strictEqual(results[0].id, '26 24 13');
  
  db.close();
});

test('searchSectionsFullText - search in overview', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, 'trunking');
  
  assert.strictEqual(results.length, 1, 'Should find in overview');
  assert.strictEqual(results[0].id, '26 25 13');
  
  db.close();
});

test('searchSectionsFullText - invalid syntax returns empty', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, 'AND OR');
  
  assert.strictEqual(results.length, 0, 'Should handle invalid syntax gracefully');
  
  db.close();
});

test('smartSearch - Section ID detection', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const result = smartSearch(db, '26 24 13');
  
  assert.strictEqual(result.strategy, 'section_id');
  assert.strictEqual(result.results.length, 1);
  assert.strictEqual(result.results[0].id, '26 24 13');
  
  db.close();
});

test('smartSearch - Section ID with dots', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const result = smartSearch(db, '26.24.13');
  
  assert.strictEqual(result.strategy, 'section_id');
  assert.strictEqual(result.results.length, 1);
  
  db.close();
});

test('smartSearch - FTS5 syntax detection', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const result = smartSearch(db, 'motor AND control');
  
  assert.strictEqual(result.strategy, 'fts5');
  assert.ok(result.results.length > 0);
  
  db.close();
});

test('smartSearch - synonym search fallback', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const result = smartSearch(db, 'panel board');
  
  assert.strictEqual(result.strategy, 'synonym');
  assert.strictEqual(result.results[0].id, '26 24 13');
  
  db.close();
});

test('smartSearch - FTS fallback for simple query', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  // Query that won't match keywords but will match FTS
  const result = smartSearch(db, 'distribution');
  
  assert.ok(result.strategy === 'fts5_fallback' || result.strategy === 'synonym');
  assert.ok(result.results.length > 0);
  
  db.close();
});

test('smartSearch - basic fallback', () => {
  const db = createTestDb();
  // Don't sync FTS, disable FTS
  
  const result = smartSearch(db, 'CONTROL', { useFTS: false, useSynonyms: false });
  
  assert.strictEqual(result.strategy, 'basic');
  assert.ok(result.results.length > 0);
  
  db.close();
});

test('smartSearch - empty query', () => {
  const db = createTestDb();
  
  const result = smartSearch(db, '');
  
  assert.strictEqual(result.strategy, 'empty');
  assert.strictEqual(result.results.length, 0);
  
  db.close();
});

test('smartSearch - no results', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const result = smartSearch(db, 'nonexistent12345');
  
  assert.strictEqual(result.results.length, 0);
  
  db.close();
});

test('smartSearch - limit option', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const result = smartSearch(db, 'voltage OR motor OR switch', { limit: 2 });
  
  assert.ok(result.results.length <= 2, 'Should respect limit');
  
  db.close();
});

test('smartSearch - Chinese keyword', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const result = smartSearch(db, '配电柜');
  
  assert.strictEqual(result.strategy, 'synonym');
  assert.strictEqual(result.results[0].id, '26 24 13');
  
  db.close();
});

test('searchSectionsFullText - relevance scoring', () => {
  const db = createTestDb();
  syncFTSTable(db);
  
  const results = searchSectionsFullText(db, 'motor control');
  
  assert.ok(results.length > 0);
  // Results should be sorted by relevance (lower BM25 = more relevant)
  if (results.length > 1) {
    assert.ok(results[0].relevance <= results[1].relevance);
  }
  
  db.close();
});
