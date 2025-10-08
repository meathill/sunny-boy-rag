#!/usr/bin/env node
import fs from 'node:fs/promises';
import { parsePdf } from '../pdf/extract.js';
import { buildSections } from '../pdf/analyze.js';
import { chunkSections } from '../pdf/chunk.js';

async function main() {
  const [, , file, ...rest] = process.argv;
  if (!file) {
    console.error('Usage: ingest <file.pdf> [--max 4000] [--overlap 200]');
    process.exit(1);
  }
  const args = new Map();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) args.set(rest[i].slice(2), rest[i + 1]);
  }
  const max = Number(args.get('max') ?? 4000);
  const overlap = Number(args.get('overlap') ?? 200);

  const buf = await fs.readFile(file);
  const { meta, textByPage } = await parsePdf(buf);
  const sections = buildSections(textByPage);
  const chunks = chunkSections(sections, { maxChars: max, overlap, sourceId: file });

  const out = { meta, sections, chunks };
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
