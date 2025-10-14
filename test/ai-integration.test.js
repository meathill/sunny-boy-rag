import { test } from 'node:test';
import assert from 'node:assert';
import { initDb, saveComplianceRequirements, saveTechnicalSpecs, saveDesignRequirements, saveTestingRequirements, getSectionRequirements, getAllSectionRequirementsRecursive, getUnprocessedChunks, updateAIProcessingStatus, getProcessingStats, saveChunks, saveSections } from '../src/db/sqlite.js';

test('AI schema tables creation', () => {
  const db = initDb(':memory:');
  
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name IN (
      'compliance_requirements',
      'technical_specs',
      'design_requirements',
      'testing_requirements',
      'ai_processing_status'
    )
  `).all();
  
  assert.strictEqual(tables.length, 5, 'Should create all 5 AI tables');
  db.close();
});

test('saveComplianceRequirements', () => {
  const db = initDb(':memory:');
  
  const requirements = [
    {
      sectionId: '26 24 13',
      chunkId: 'chunk-1',
      stdRefId: 'IEC 61439-1',
      requirementText: 'Shall comply with IEC 61439-1',
      appliesTo: 'switchboards',
      isMandatory: 1,
      requirementType: 'standard_compliance',
    },
    {
      sectionId: '26 24 13',
      chunkId: 'chunk-1',
      stdRefId: 'ISO 9001',
      requirementText: 'Manufacturer shall be ISO 9001 certified',
      appliesTo: null,
      isMandatory: 1,
      requirementType: 'certification',
    },
  ];
  
  saveComplianceRequirements(db, requirements);
  
  const saved = db.prepare('SELECT * FROM compliance_requirements').all();
  assert.strictEqual(saved.length, 2);
  assert.strictEqual(saved[0].std_ref_id, 'IEC 61439-1');
  assert.strictEqual(saved[1].std_ref_id, 'ISO 9001');
  
  db.close();
});

test('saveTechnicalSpecs', () => {
  const db = initDb(':memory:');
  
  const specs = [
    {
      sectionId: '26 24 13',
      chunkId: 'chunk-1',
      specCategory: 'electrical',
      parameterName: 'voltage',
      value: '400',
      unit: 'V',
      testStandard: null,
      requirementText: 'Suitable for 400V operation',
      appliesTo: null,
    },
    {
      sectionId: '26 24 13',
      chunkId: 'chunk-1',
      specCategory: 'environmental',
      parameterName: 'temperature',
      value: '52',
      unit: '°C',
      testStandard: null,
      requirementText: 'Temperature rating at 52°C',
      appliesTo: null,
    },
  ];
  
  saveTechnicalSpecs(db, specs);
  
  const saved = db.prepare('SELECT * FROM technical_specs').all();
  assert.strictEqual(saved.length, 2);
  assert.strictEqual(saved[0].parameter_name, 'voltage');
  assert.strictEqual(saved[1].parameter_name, 'temperature');
  
  db.close();
});

test('saveDesignRequirements', () => {
  const db = initDb(':memory:');
  
  const requirements = [
    {
      sectionId: '26 24 13',
      chunkId: 'chunk-1',
      requirementCategory: 'installation',
      requirementText: 'Install at 600mm height',
      appliesTo: 'wall mounted units',
      isMandatory: 1,
    },
  ];
  
  saveDesignRequirements(db, requirements);
  
  const saved = db.prepare('SELECT * FROM design_requirements').all();
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].requirement_category, 'installation');
  
  db.close();
});

test('saveTestingRequirements', () => {
  const db = initDb(':memory:');
  
  const requirements = [
    {
      sectionId: '26 24 13',
      chunkId: 'chunk-1',
      testType: 'FAT',
      requirementText: 'FAT shall be conducted',
      appliesTo: null,
      isMandatory: 1,
    },
  ];
  
  saveTestingRequirements(db, requirements);
  
  const saved = db.prepare('SELECT * FROM testing_requirements').all();
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].test_type, 'FAT');
  
  db.close();
});

test('getSectionRequirements - comprehensive query', () => {
  const db = initDb(':memory:');
  
  // Setup test data
  saveSections(db, 'test.pdf', [{
    id: '26 24 13',
    title: 'SWITCHBOARDS',
    startPage: 1,
    endPage: 10,
  }]);
  
  saveComplianceRequirements(db, [{
    sectionId: '26 24 13',
    chunkId: 'chunk-1',
    stdRefId: 'IEC 61439-1',
    requirementText: 'Comply with IEC 61439-1',
    isMandatory: 1,
  }]);
  
  saveTechnicalSpecs(db, [{
    sectionId: '26 24 13',
    chunkId: 'chunk-1',
    specCategory: 'electrical',
    parameterName: 'voltage',
    value: '400',
    unit: 'V',
    requirementText: '400V operation',
  }]);
  
  const results = getSectionRequirements(db, '26 24 13');
  
  assert.strictEqual(results.sectionId, '26 24 13');
  assert.strictEqual(results.compliance.length, 1);
  assert.strictEqual(results.technical.length, 1);
  assert.ok(Array.isArray(results.design));
  assert.ok(Array.isArray(results.testing));
  
  db.close();
});

test('getAllSectionRequirementsRecursive - includes related sections', () => {
  const db = initDb(':memory:');
  
  // Setup sections
  saveSections(db, 'test.pdf', [
    { id: '26 24 13', title: 'SWITCHBOARDS', startPage: 1, endPage: 10 },
    { id: '26 05 19', title: 'CABLES', startPage: 11, endPage: 20 },
  ]);
  
  // Create relation
  db.prepare(`
    INSERT INTO section_relations (section_id, related_section_id)
    VALUES ('26 24 13', '26 05 19')
  `).run();
  
  // Add requirements to both sections
  saveComplianceRequirements(db, [
    {
      sectionId: '26 24 13',
      chunkId: 'chunk-1',
      stdRefId: 'IEC 61439-1',
      requirementText: 'Switchboard compliance',
      isMandatory: 1,
    },
    {
      sectionId: '26 05 19',
      chunkId: 'chunk-2',
      stdRefId: 'IEC 60502',
      requirementText: 'Cable compliance',
      isMandatory: 1,
    },
  ]);
  
  const results = getAllSectionRequirementsRecursive(db, '26 24 13');
  
  assert.strictEqual(results.sectionId, '26 24 13');
  assert.strictEqual(results.compliance.length, 1);
  assert.ok(results.indirect['26 05 19'], 'Should include related section');
  assert.strictEqual(results.indirect['26 05 19'].compliance.length, 1);
  
  db.close();
});

test('getUnprocessedChunks - filters Part 2/3 only', () => {
  const db = initDb(':memory:');
  
  saveChunks(db, [
    { id: 'chunk-1', sourceId: 'test.pdf', sectionId: '26 24 13', partNo: 1, text: 'Part 1 content' },
    { id: 'chunk-2', sourceId: 'test.pdf', sectionId: '26 24 13', partNo: 2, text: 'Part 2 content' },
    { id: 'chunk-3', sourceId: 'test.pdf', sectionId: '26 24 13', partNo: 3, text: 'Part 3 content' },
  ]);
  
  const unprocessed = getUnprocessedChunks(db);
  
  assert.strictEqual(unprocessed.length, 2, 'Should only get Part 2 and 3');
  assert.ok(unprocessed.every(c => c.part_no === 2 || c.part_no === 3));
  
  db.close();
});

test('updateAIProcessingStatus and getProcessingStats', () => {
  const db = initDb(':memory:');
  
  saveChunks(db, [
    { id: 'chunk-1', sourceId: 'test.pdf', sectionId: '26 24 13', partNo: 2, text: 'Content 1' },
    { id: 'chunk-2', sourceId: 'test.pdf', sectionId: '26 24 13', partNo: 2, text: 'Content 2' },
  ]);
  
  // Mark first chunk as processed
  updateAIProcessingStatus(db, 'chunk-1', {
    processed: 1,
    completedAt: new Date().toISOString(),
  });
  
  const stats = getProcessingStats(db);
  
  assert.strictEqual(stats.total_chunks, 2);
  assert.strictEqual(stats.processed_chunks, 1);
  assert.strictEqual(stats.error_chunks, 0);
  
  // Mark second chunk with error
  updateAIProcessingStatus(db, 'chunk-2', {
    processed: 0,
    errorMessage: 'Test error',
    retryCount: 1,
  });
  
  const stats2 = getProcessingStats(db);
  assert.strictEqual(stats2.error_chunks, 1);
  
  db.close();
});

test('AI processing idempotency - can reprocess', () => {
  const db = initDb(':memory:');
  
  saveChunks(db, [
    { id: 'chunk-1', sourceId: 'test.pdf', sectionId: '26 24 13', partNo: 2, text: 'Content' },
  ]);
  
  const reqs = [{
    sectionId: '26 24 13',
    chunkId: 'chunk-1',
    stdRefId: 'IEC 61439-1',
    requirementText: 'Test requirement',
    isMandatory: 1,
  }];
  
  // First processing
  saveComplianceRequirements(db, reqs);
  updateAIProcessingStatus(db, 'chunk-1', { processed: 1 });
  
  let count = db.prepare('SELECT COUNT(*) as n FROM compliance_requirements').get().n;
  assert.strictEqual(count, 1);
  
  // Reprocess (e.g., after improving prompts)
  updateAIProcessingStatus(db, 'chunk-1', { processed: 0 });
  saveComplianceRequirements(db, reqs);
  updateAIProcessingStatus(db, 'chunk-1', { processed: 1 });
  
  count = db.prepare('SELECT COUNT(*) as n FROM compliance_requirements').get().n;
  assert.strictEqual(count, 2, 'Should allow reprocessing (creating new records)');
  
  db.close();
});
