import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {chunkSections} from '../src/pdf/chunk.js';

describe('chunk', () => {
  test('respects maxChars without overlap', () => {
    const longText = 'x'.repeat(5000);
    const sections = [{
      id: 'sec:1', title: '总则', section: '1', startPage: 1, endPage: 3, text: longText
    }];
    const chunks = chunkSections(sections, {maxChars: 2000, sourceId: 'doc1'});
    assert.equal(chunks.length, 2);
    assert.ok(chunks[0].text.length <= 2000);
    assert.ok(chunks[1].text.length > 2000);
  });

  test('small section becomes single chunk', () => {
    const sections = [{
      id: 'sec:2', title: '范围', section: '1.1', startPage: 1, endPage: 1, text: '短文本'
    }];
    const chunks = chunkSections(sections, {
      maxChars: 4000, sourceId: 'doc2'
    });
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].sectionId, 'sec:2');
  });

  test('splits at level 4 subsection boundaries, not mid-subsection', () => {
    // Simulate a section with multiple level 4 subsections
    const subsections = [
      '2.2.11.1. First subsection content\nThis is a longer paragraph with details.\nMore text here.',
      '2.2.11.2. Second subsection\nAnother paragraph of content.',
      '2.2.11.3. Third subsection\nYet more content here.',
      '2.2.11.4. Fourth subsection\nAdditional details.',
      '2.2.11.5. Fifth subsection\nFinal content here.'
    ];
    const longText = subsections.join('\n');
    
    const sections = [{
      sectionId: '26 24 13',
      partNo: 2,
      level2Code: '2.2',
      level3Code: '2.2.11',
      level2Title: 'Product Requirements',
      level3Title: 'MCCB',
      title: 'MCCB',
      startPage: 10,
      endPage: 15,
      text: longText
    }];
    
    const chunks = chunkSections(sections, {maxChars: 150, sourceId: 'test'});
    
    // Should create multiple chunks
    assert.ok(chunks.length > 1, 'Should split into multiple chunks');
    
    // Each chunk (except possibly the first) should start with a level 4 heading
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i].text.trim();
      // Check if starts with pattern like "2.2.11.X."
      const startsWithLevel4 = /^2\.2\.11\.\d+\./.test(text);
      assert.ok(startsWithLevel4, `Chunk ${i} should start with level 4 heading, got: ${text.slice(0, 50)}`);
    }
    
    // Verify no subsection is broken across chunks
    // by checking that each numbered subsection appears in exactly one chunk
    for (let i = 1; i <= 5; i++) {
      const subsectionMarker = `2.2.11.${i}.`;
      let foundInChunks = 0;
      for (const chunk of chunks) {
        if (chunk.text.includes(subsectionMarker)) {
          foundInChunks++;
        }
      }
      assert.equal(foundInChunks, 1, `Subsection ${i} should appear in exactly one chunk, found in ${foundInChunks}`);
    }
  });
});
