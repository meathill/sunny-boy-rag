import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { initDb, saveChunks, getUnprocessedChunks } from '../src/db/sqlite.js';
import fs from 'fs';

describe('parse CLI', () => {
  it('shows help with --help', async () => {
    const proc = spawn('./src/cli/parse.js', ['--help']);
    let stdout = '';
    proc.stdout.on('data', d => stdout += d.toString());
    await new Promise(res => proc.on('close', res));
    assert.match(stdout, /AI Parse/);
    assert.match(stdout, /--section-id/);
  });

  it('getUnprocessedChunks filters by sectionId', () => {
    const db = initDb(':memory:');
    
    // Insert test chunks
    const chunks = [
      {
        id: 'c1',
        sourceId: 'test.pdf',
        sectionId: '26 24 13',
        partNo: 2,
        level2Code: '2.1',
        level3Code: '2.1.1',
        level2Title: 'Level 2',
        level3Title: 'Level 3',
        title: 'General',
        startPage: 1,
        endPage: 1,
        text: 'Test content 1',
      },
      {
        id: 'c2',
        sourceId: 'test.pdf',
        sectionId: '26 25 13',
        partNo: 2,
        level2Code: '2.1',
        level3Code: '2.1.1',
        level2Title: 'Level 2',
        level3Title: 'Level 3',
        title: 'General',
        startPage: 2,
        endPage: 2,
        text: 'Test content 2',
      },
      {
        id: 'c3',
        sourceId: 'test.pdf',
        sectionId: '26 24 13',
        partNo: 3,
        level2Code: '3.1',
        level3Code: '3.1.1',
        level2Title: 'Level 2',
        level3Title: 'Level 3',
        title: 'Testing',
        startPage: 3,
        endPage: 3,
        text: 'Test content 3',
      },
    ];
    
    saveChunks(db, chunks);
    
    // Test without sectionId filter
    const allChunks = getUnprocessedChunks(db, { limit: 100 });
    assert.equal(allChunks.length, 3);
    
    // Test with sectionId filter
    const filtered = getUnprocessedChunks(db, { limit: 100, sectionId: '26 24 13' });
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].id, 'c1');
    assert.equal(filtered[1].id, 'c3');
    
    // Test with different sectionId
    const filtered2 = getUnprocessedChunks(db, { limit: 100, sectionId: '26 25 13' });
    assert.equal(filtered2.length, 1);
    assert.equal(filtered2[0].id, 'c2');
    
    db.close();
  });

  it('processes specific section with --section-id in demo.pdf', async () => {
    // Clean up test db
    const testDbPath = './test-parse-section.db';
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    try {
      // First ingest demo.pdf
      const ingestProc = spawn('./src/cli/ingest.js', [
        'assets/demo.pdf',
        '--db', testDbPath
      ], {
        env: { ...process.env, SUNNY_SQLITE: testDbPath }
      });
      
      await new Promise((resolve, reject) => {
        ingestProc.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(`Ingest failed with code ${code}`));
        });
      });
      
      // Open db and check chunks for a specific section
      const db = initDb(testDbPath);
      const section2613Chunks = getUnprocessedChunks(db, { sectionId: '26 24 13' });
      
      assert.ok(section2613Chunks.length > 0, 'Should have chunks for section 26 24 13');
      
      // All chunks should belong to the same section
      section2613Chunks.forEach(chunk => {
        assert.equal(chunk.section_id, '26 24 13');
      });
      
      db.close();
    } finally {
      // Clean up
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    }
  });
});
