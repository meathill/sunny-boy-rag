import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSections, detectHeadings, extractReferences} from '../src/pdf/analyze.js';

describe('analyze', () => {
  test('detectHeadings finds numbered headings', () => {
    const pages = ['1. 总则\n一些内容\n1.1 范围\n更多内容', '2. 定义\n进一步内容'];
    const hs = detectHeadings(pages);
    assert.ok(hs.some(h => h.section === '1' && h.page === 1));
    assert.ok(hs.some(h => h.section === '1.1' && h.page === 1));
    assert.ok(hs.some(h => h.section === '2' && h.page === 2));
  });

  test('buildSections yields sections with text and page ranges', () => {
    const pages = ['1. 总则\nA\nA2', '1.1 范围\nB1', '2. 定义\nC1'];
    const secs = buildSections(pages);
    assert.ok(secs.length >= 2);
    const s1 = secs.find(s => s.section === '1');
    assert.ok(s1);
    assert.equal(s1.startPage, 1);
    assert.ok(s1.text.includes('总则'));
  });

  test('extractReferences finds standard IDs', () => {
    const txt = '不锈钢元器件需遵守 ABC - 001 与 ISO9001 要求';
    const refs = extractReferences(txt);
    assert.ok(refs.find(r => r.match === 'ABC-001'));
    assert.ok(refs.find(r => r.match === 'ISO9001'));
  });
});
