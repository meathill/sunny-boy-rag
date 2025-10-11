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

  test('std_refs extracted from Part 1 - 1.3 and relations saved', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-refs-'));
    const dbPath = path.join(dir, 'data.sqlite');
    const pdf = 'assets/demo.pdf';

    const {stdout} = await execNode(['src/cli/ingest.js', pdf, '--pages', '50', '--max', '2000', '--db', dbPath]);
    assert.equal(stdout.trim(), 'done');

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    const refs = db.prepare('SELECT * FROM std_refs ORDER BY id').all();
    const rels = db.prepare('SELECT * FROM section_std_refs_relations').all();
    
    assert.ok(refs.length > 30, `should extract ~36 refs, got ${refs.length}`);
    assert.ok(rels.length >= 1);
    
    // Test multi-line shared title: "IEC 60947-2 / \n BS EN 60898-2"
    const iec60947 = refs.find(r => r.id === 'IEC 60947-2');
    const bsen60898 = refs.find(r => r.id === 'BS EN 60898-2');
    assert.ok(iec60947, 'IEC 60947-2 should exist');
    assert.ok(bsen60898, 'BS EN 60898-2 should exist');
    assert.ok(iec60947.title && iec60947.title.includes('Low'), 'IEC 60947-2 should have shared title');
    assert.ok(bsen60898.title && bsen60898.title.includes('Low'), 'BS EN 60898-2 should have shared title');
    
    // Test trailing colon removal: "IEC 337-2:"
    const iec337 = refs.find(r => r.id === 'IEC 337-2');
    assert.ok(iec337, 'IEC 337-2 should exist (colon removed)');
    assert.ok(iec337.title, 'IEC 337-2 should have title');
    
    // Test other edge case patterns
    assert.ok(refs.find(r => r.id === 'DEWA Regulations'), 'DEWA Regulations should exist');
    assert.ok(refs.find(r => r.id === 'IEC 51'), 'IEC 51 should exist');
    assert.ok(refs.find(r => r.id === 'IEC/EN 61000-4-5'), 'IEC/EN 61000-4-5 should exist');
    
    // All refs should have titles
    const noTitle = refs.filter(r => !r.title);
    assert.strictEqual(noTitle.length, 0, `all refs should have title, but ${noTitle.length} missing: ${noTitle.map(r => r.id).join(', ')}`);
  });

  test('definitions extracted from Part 1 - 1.6 and relations saved', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-defs-'));
    const dbPath = path.join(dir, 'data.sqlite');
    const pdf = 'assets/demo.pdf';

    const {stdout} = await execNode(['src/cli/ingest.js', pdf, '--pages', '50', '--max', '2000', '--db', dbPath]);
    assert.equal(stdout.trim(), 'done');

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    const defs = db.prepare('SELECT * FROM definitions ORDER BY id').all();
    const rels = db.prepare('SELECT * FROM section_definition_relations').all();
    
    assert.ok(defs.length > 70, `should extract 70+ definitions, got ${defs.length}`);
    assert.ok(rels.length > 70, `should have 70+ relations, got ${rels.length}`);
    
    // Test standard uppercase abbreviations
    const ac = defs.find(d => d.id === 'AC');
    assert.ok(ac, 'AC should exist');
    assert.ok(ac.definition && ac.definition.includes('Alternating'), 'AC should have correct definition');
    
    const dewa = defs.find(d => d.id === 'DEWA');
    assert.ok(dewa, 'DEWA should exist');
    assert.ok(dewa.definition && dewa.definition.includes('Dubai'), 'DEWA should have correct definition');
    
    const atsAtc = defs.find(d => d.id === 'ATS/ATC');
    assert.ok(atsAtc, 'ATS/ATC (with slash) should exist');
    assert.ok(atsAtc.definition && atsAtc.definition.includes('Automatic'), 'ATS/ATC should have correct definition');
    
    // Test edge case: with lowercase and space "Cu ETP"
    const cuEtp = defs.find(d => d.id === 'Cu ETP');
    assert.ok(cuEtp, 'Cu ETP (with lowercase and space) should exist');
    assert.ok(cuEtp.definition && cuEtp.definition.includes('Copper'), 'Cu ETP should have correct definition');
    
    // Test edge case: unit prefixes (lowercase start) "kV", "kVA", "mA"
    const kv = defs.find(d => d.id === 'kV');
    assert.ok(kv, 'kV (lowercase start) should exist');
    assert.ok(kv.definition && kv.definition.includes('Volt'), 'kV should have correct definition');
    
    const kva = defs.find(d => d.id === 'kVA');
    assert.ok(kva, 'kVA (lowercase start) should exist');
    assert.ok(kva.definition && kva.definition.includes('Ampere'), 'kVA should have correct definition');
    
    const ma = defs.find(d => d.id === 'mA');
    assert.ok(ma, 'mA (lowercase start) should exist');
    assert.ok(ma.definition && ma.definition.includes('Ampere'), 'mA should have correct definition');
    
    // Test edge case: with hyphens and spaces "O - C - O"
    const oco = defs.find(d => d.id === 'O - C - O');
    assert.ok(oco, 'O - C - O (with hyphens and spaces) should exist');
    assert.ok(oco.definition && oco.definition.includes('cancels'), 'O - C - O should have correct definition');
    
    // Test edge case: with parentheses "PDS (MV)"
    const pds = defs.find(d => d.id === 'PDS (MV)');
    assert.ok(pds, 'PDS (MV) (with parentheses) should exist');
    assert.ok(pds.definition && pds.definition.includes('Power'), 'PDS (MV) should have correct definition');
    
    // Test edge case: with hyphen and space "TN - S"
    const tns = defs.find(d => d.id === 'TN - S');
    assert.ok(tns, 'TN - S (with hyphen and space) should exist');
    assert.ok(tns.definition, 'TN - S should have definition');
    
    // Test edge case: mixed case "RoHS"
    const rohs = defs.find(d => d.id === 'RoHS');
    assert.ok(rohs, 'RoHS (mixed case) should exist');
    assert.ok(rohs.definition && rohs.definition.includes('Hazardous'), 'RoHS should have correct definition');
    
    // All definitions should have content
    const noDef = defs.filter(d => !d.definition || d.definition.trim() === '');
    assert.strictEqual(noDef.length, 0, `all definitions should have content, but ${noDef.length} empty: ${noDef.map(d => d.id).join(', ')}`);
    
    // All relations should link to valid sections and definitions
    for (const r of rels.slice(0, 10)) {
      assert.ok(/^\d+\s+\d+\s+\d+$/.test(r.section_id), `section_id should be in 'X Y Z' format: ${r.section_id}`);
      assert.ok(r.definition_id, `definition_id should exist`);
      const defExists = defs.find(d => d.id === r.definition_id);
      assert.ok(defExists, `definition ${r.definition_id} should exist in definitions table`);
    }
  });
