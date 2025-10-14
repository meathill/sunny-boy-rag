import { test } from 'node:test';
import assert from 'node:assert';
import { MockAIClient } from '../src/ai/client.js';
import { extractComplianceRequirements, extractTechnicalSpecs, extractDesignRequirements, extractTestingRequirements, processChunk } from '../src/ai/parser.js';

test('MockAIClient - compliance extraction', async () => {
  const client = new MockAIClient();
  const text = `All switchboards shall comply with IEC 61439-1 and IEC 61439-2. 
                The manufacturer should be certified by ISO 9001.`;
  
  const context = { sectionId: '26 24 13', chunkId: 'test-chunk-1' };
  const results = await extractComplianceRequirements(text, context, client);
  
  assert.ok(results.length >= 2, 'Should extract at least 2 standards');
  assert.ok(results.some(r => r.stdRefId && r.stdRefId.includes('IEC 61439')), 'Should find IEC standard');
  assert.strictEqual(results[0].sectionId, '26 24 13');
  assert.strictEqual(results[0].chunkId, 'test-chunk-1');
});

test('MockAIClient - technical specs extraction', async () => {
  const client = new MockAIClient();
  const text = `All switchboards shall be suitable for 400V, 50Hz AC system. 
                Temperature rating at 52°C. Protection rating IP54 and IK10.`;
  
  const context = { sectionId: '26 24 13', chunkId: 'test-chunk-2' };
  const results = await extractTechnicalSpecs(text, context, client);
  
  assert.ok(results.length >= 3, 'Should extract voltage, temperature, and IP rating');
  
  const voltage = results.find(r => r.parameterName === 'voltage');
  assert.ok(voltage, 'Should extract voltage');
  assert.strictEqual(voltage.value, '400');
  assert.strictEqual(voltage.unit, 'V');
  
  const temp = results.find(r => r.parameterName === 'temperature');
  assert.ok(temp, 'Should extract temperature');
  assert.strictEqual(temp.value, '52');
  
  const ip = results.find(r => r.parameterName === 'IP_rating');
  assert.ok(ip, 'Should extract IP rating');
  assert.strictEqual(ip.value, 'IP54');
});

test('MockAIClient - design requirements extraction', async () => {
  const client = new MockAIClient();
  const text = `All wall mounted SMDBs shall be installed at a minimum height of 600mm from finished floor level.
                Floor mounted switchboards shall be provided with cable entry from bottom side only.`;
  
  const context = { sectionId: '26 24 13', chunkId: 'test-chunk-3' };
  const results = await extractDesignRequirements(text, context, client);
  
  assert.ok(results.length >= 1, 'Should extract design requirements');
  assert.ok(results[0].requirementText.includes('mount') || results[0].requirementText.includes('install'));
});

test('MockAIClient - testing requirements extraction', async () => {
  const client = new MockAIClient();
  const text = `FAT shall be carried out in the presence of the Engineer.
                All equipment shall undergo routine testing per IEC standards.`;
  
  const context = { sectionId: '26 24 13', chunkId: 'test-chunk-4' };
  const results = await extractTestingRequirements(text, context, client);
  
  assert.ok(results.length >= 1, 'Should extract testing requirements');
  const fat = results.find(r => r.testType === 'FAT');
  assert.ok(fat, 'Should identify FAT requirement');
});

test('processChunk - comprehensive extraction', async () => {
  const client = new MockAIClient();
  const chunk = {
    id: 'test-chunk-full',
    section_id: '26 24 13',
    part_no: 2,
    text: `All switchboards shall comply with IEC 61439-1 and be suitable for 400V operation at 52°C.
           Wall mounted units shall be installed at 600mm height.
           FAT shall be conducted before shipment.`,
  };
  
  const results = await processChunk(chunk, client);
  
  assert.ok(results.compliance.length > 0, 'Should extract compliance');
  assert.ok(results.technical.length > 0, 'Should extract technical specs');
  assert.ok(results.design.length > 0, 'Should extract design requirements');
  assert.ok(results.testing.length > 0, 'Should extract testing requirements');
});

test('parseAIResponse - handles JSON in code blocks', async () => {
  const client = new MockAIClient();
  
  // Mock response with markdown code block
  const originalComplete = client.complete.bind(client);
  client.complete = async (prompt) => {
    return '```json\n[{"std_ref_id": "IEC 61439-1", "requirement_text": "test"}]\n```';
  };
  
  const text = 'Test text with IEC 61439-1';
  const context = { sectionId: '26 24 13', chunkId: 'test' };
  const results = await extractComplianceRequirements(text, context, client);
  
  assert.ok(Array.isArray(results), 'Should parse JSON from code block');
  client.complete = originalComplete;
});

test('parseAIResponse - handles empty results', async () => {
  const client = new MockAIClient();
  const text = 'No requirements here, just plain description.';
  const context = { sectionId: '26 24 13', chunkId: 'test-empty' };
  
  const results = await extractComplianceRequirements(text, context, client);
  assert.ok(Array.isArray(results), 'Should return array even if empty');
});
