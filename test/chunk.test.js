import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {chunkSections} from '../src/pdf/chunk.js';

describe('chunk', () => {
  test('respects maxChars and overlap', () => {
    const longText = 'x'.repeat(5000);
    const sections = [{
      id: 'sec:1', title: '总则', section: '1', startPage: 1, endPage: 3, text: longText
    }];
    const chunks = chunkSections(sections, {maxChars: 2000, overlap: 100, sourceId: 'doc1'});
    assert.ok(chunks.length >= 2);
    assert.ok(chunks[0].text.length <= 2000);
    assert.ok(chunks[1].text.startsWith('x'.repeat(100)));
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
});
