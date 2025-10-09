import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import { buildSections, buildParts } from '../src/pdf/analyze.js';

describe('parts detection and section end trimming', () => {
  test('detects PART 1/2/3 and trims END OF SECTION', () => {
    const textByPage = [
      'Section 1 2 3\nTitle\nPART 1 - GENERAL\nG body\nPART 2 - PRODUCT\nP body\nPART 3 - EXECUTION\nE body\nEND OF SECTION 1 2 3',
      'Section 2 0 0\nNext Title\n...' 
    ];
    const sections = buildSections(textByPage);
    assert.equal(sections.length, 2);
    assert.ok(!/END OF SECTION/i.test(sections[0].text));

    const parts = buildParts(sections.slice(0,1));
    assert.equal(parts.length, 3);
    assert.deepEqual(parts.map(p => p.partNo), [1,2,3]);
    assert.ok(parts[0].title.toUpperCase().includes('GENERAL'));
    assert.ok(parts[1].title.toUpperCase().includes('PRODUCT'));
    assert.ok(parts[2].title.toUpperCase().includes('EXECUTION'));
  });
});
