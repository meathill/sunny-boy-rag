import { test } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { 
  createKeywordsTables, 
  searchSectionsWithSynonyms,
  insertProductKeywords 
} from '../src/db/search-schema.js';

test('createKeywordsTables - creates product_keywords table', () => {
  const db = new Database(':memory:');
  
  // 先创建基础 sections 表
  db.exec(`
    CREATE TABLE sections (
      id TEXT PRIMARY KEY,
      title TEXT,
      start_page INTEGER,
      end_page INTEGER,
      overview TEXT
    );
  `);
  
  createKeywordsTables(db);
  
  // 验证表存在
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='product_keywords'
  `).all();
  
  assert.strictEqual(tables.length, 1, 'product_keywords table should exist');
  
  // 验证表结构
  const columns = db.prepare(`PRAGMA table_info(product_keywords)`).all();
  const columnNames = columns.map(c => c.name);
  
  assert.ok(columnNames.includes('section_id'), 'Should have section_id column');
  assert.ok(columnNames.includes('keyword'), 'Should have keyword column');
  assert.ok(columnNames.includes('keyword_type'), 'Should have keyword_type column');
  assert.ok(columnNames.includes('language'), 'Should have language column');
  
  db.close();
});

test('insertProductKeywords - inserts keywords', () => {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sections (id TEXT PRIMARY KEY, title TEXT);
    INSERT INTO sections VALUES ('26 24 13', 'SWITCHBOARDS');
  `);
  
  createKeywordsTables(db);
  
  const keywords = [
    { sectionId: '26 24 13', keyword: 'switchboard', type: 'primary', language: 'en' },
    { sectionId: '26 24 13', keyword: 'panel board', type: 'synonym', language: 'en' },
    { sectionId: '26 24 13', keyword: '配电柜', type: 'translation', language: 'zh' },
  ];
  
  insertProductKeywords(db, keywords);
  
  const count = db.prepare('SELECT COUNT(*) as cnt FROM product_keywords').get();
  assert.strictEqual(count.cnt, 3, 'Should insert 3 keywords');
  
  const result = db.prepare(`
    SELECT * FROM product_keywords WHERE section_id = '26 24 13'
  `).all();
  
  assert.strictEqual(result.length, 3, 'Should have 3 keywords for section');
  assert.strictEqual(result[0].keyword, 'switchboard');
  assert.strictEqual(result[1].keyword, 'panel board');
  assert.strictEqual(result[2].keyword, '配电柜');
  
  db.close();
});

test('searchSectionsWithSynonyms - finds by synonym', () => {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sections (
      id TEXT PRIMARY KEY,
      title TEXT,
      start_page INTEGER,
      end_page INTEGER,
      overview TEXT
    );
    INSERT INTO sections VALUES 
      ('26 24 13', 'SWITCHBOARDS', 1, 10, 'Overview text'),
      ('26 24 19', 'MOTOR CONTROL CENTER', 11, 20, 'MCC overview');
  `);
  
  createKeywordsTables(db);
  
  insertProductKeywords(db, [
    { sectionId: '26 24 13', keyword: 'switchboard', type: 'primary', language: 'en' },
    { sectionId: '26 24 13', keyword: 'panel board', type: 'synonym', language: 'en' },
    { sectionId: '26 24 19', keyword: 'motor control center', type: 'primary', language: 'en' },
    { sectionId: '26 24 19', keyword: 'mcc', type: 'abbreviation', language: 'en' },
  ]);
  
  // 测试 1: 通过同义词查找
  const result1 = searchSectionsWithSynonyms(db, 'panel board');
  assert.strictEqual(result1.length, 1, 'Should find 1 section');
  assert.strictEqual(result1[0].id, '26 24 13');
  assert.strictEqual(result1[0].title, 'SWITCHBOARDS');
  
  // 测试 2: 通过缩写查找
  const result2 = searchSectionsWithSynonyms(db, 'mcc');
  assert.strictEqual(result2.length, 1, 'Should find MCC');
  assert.strictEqual(result2[0].id, '26 24 19');
  
  // 测试 3: 大小写不敏感
  const result3 = searchSectionsWithSynonyms(db, 'PANEL BOARD');
  assert.strictEqual(result3.length, 1, 'Should be case-insensitive');
  assert.strictEqual(result3[0].id, '26 24 13');
  
  db.close();
});

test('searchSectionsWithSynonyms - Chinese translation', () => {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sections (
      id TEXT PRIMARY KEY,
      title TEXT,
      start_page INTEGER,
      end_page INTEGER,
      overview TEXT
    );
    INSERT INTO sections VALUES ('26 24 13', 'SWITCHBOARDS', 1, 10, 'Overview');
  `);
  
  createKeywordsTables(db);
  
  insertProductKeywords(db, [
    { sectionId: '26 24 13', keyword: 'switchboard', type: 'primary', language: 'en' },
    { sectionId: '26 24 13', keyword: '配电柜', type: 'translation', language: 'zh' },
    { sectionId: '26 24 13', keyword: '配电板', type: 'translation', language: 'zh' },
  ]);
  
  const result = searchSectionsWithSynonyms(db, '配电柜');
  assert.strictEqual(result.length, 1, 'Should find by Chinese keyword');
  assert.strictEqual(result[0].id, '26 24 13');
  
  db.close();
});

test('searchSectionsWithSynonyms - partial match', () => {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sections (id TEXT PRIMARY KEY, title TEXT, start_page INTEGER, end_page INTEGER, overview TEXT);
    INSERT INTO sections VALUES ('26 24 19', 'MOTOR CONTROL CENTER', 1, 10, 'Overview');
  `);
  
  createKeywordsTables(db);
  
  insertProductKeywords(db, [
    { sectionId: '26 24 19', keyword: 'motor control center', type: 'primary', language: 'en' },
  ]);
  
  // 部分匹配 "motor"
  const result = searchSectionsWithSynonyms(db, 'motor');
  assert.strictEqual(result.length, 1, 'Should support partial match');
  assert.strictEqual(result[0].id, '26 24 19');
  
  db.close();
});

test('searchSectionsWithSynonyms - fallback to title search', () => {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sections (id TEXT PRIMARY KEY, title TEXT, start_page INTEGER, end_page INTEGER, overview TEXT);
    INSERT INTO sections VALUES ('26 24 19', 'MOTOR CONTROL CENTER', 1, 10, 'Overview');
  `);
  
  createKeywordsTables(db);
  // 不插入任何 keywords
  
  // 应该回退到 title 搜索
  const result = searchSectionsWithSynonyms(db, 'CONTROL');
  assert.strictEqual(result.length, 1, 'Should fallback to title search');
  assert.strictEqual(result[0].id, '26 24 19');
  
  db.close();
});

test('searchSectionsWithSynonyms - no match returns empty', () => {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sections (id TEXT PRIMARY KEY, title TEXT, start_page INTEGER, end_page INTEGER, overview TEXT);
    INSERT INTO sections VALUES ('26 24 13', 'SWITCHBOARDS', 1, 10, 'Overview');
  `);
  
  createKeywordsTables(db);
  
  const result = searchSectionsWithSynonyms(db, 'nonexistent');
  assert.strictEqual(result.length, 0, 'Should return empty array');
  
  db.close();
});

test('searchSectionsWithSynonyms - returns multiple matches', () => {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sections (id TEXT PRIMARY KEY, title TEXT, start_page INTEGER, end_page INTEGER, overview TEXT);
    INSERT INTO sections VALUES 
      ('26 24 13', 'SWITCHBOARDS', 1, 10, 'Overview'),
      ('26 24 19', 'MOTOR CONTROL CENTER', 11, 20, 'Overview');
  `);
  
  createKeywordsTables(db);
  
  insertProductKeywords(db, [
    { sectionId: '26 24 13', keyword: 'electrical equipment', type: 'synonym', language: 'en' },
    { sectionId: '26 24 19', keyword: 'electrical equipment', type: 'synonym', language: 'en' },
  ]);
  
  const result = searchSectionsWithSynonyms(db, 'electrical equipment');
  assert.strictEqual(result.length, 2, 'Should return multiple matches');
  
  db.close();
});
