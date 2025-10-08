import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePdf} from '../src/pdf/extract.js';
import {buildSections} from '../src/pdf/analyze.js';
import {chunkSections} from '../src/pdf/chunk.js';

describe('pipeline', () => {
  test('extract -> analyze -> chunk', async () => {
    const fakePdf = Buffer.from('1. 总则\n正文A\n1.1 范围\n正文B\n2. 定义\n正文C', 'utf8');
    const {meta, textByPage} = await parsePdf(fakePdf);
    assert.equal(meta.pageCount, 1);
    assert.equal(textByPage.length, 1);

    const sections = buildSections(textByPage);
    assert.ok(sections.length >= 2);

    const chunks = chunkSections(sections, {maxChars: 1000, sourceId: 'fake.pdf'});
    assert.ok(chunks.length >= 2 || chunks.length === 1);
    assert.ok(chunks.every(c => c.sourceId === 'fake.pdf'));

  });
});
