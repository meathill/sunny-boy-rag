#!/usr/bin/env node
import fs from 'node:fs/promises';
import 'dotenv/config';

import { parsePdf } from '../pdf/extract.js';
import { buildSections } from '../pdf/analyze.js';
import { chunkSections } from '../pdf/chunk.js';

async function main() {
  const [, , cmdOrFile, ...rest] = process.argv;
  if (!cmdOrFile) {
    console.error('Usage: ingest <file.pdf> [--max 4000] | ingest list [--source <file>] [--limit N] [--offset N] | ingest get <id>');
    process.exit(1);
  }
  const args = new Map();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] && rest[i].startsWith('--')) args.set(rest[i].slice(2), rest[i + 1]);
  }

  // Query subcommands
  if (cmdOrFile === 'list' || cmdOrFile === 'get') {
    const dbPath = args.get('db') ?? process.env.SUNNY_SQLITE ?? ':memory:';
    try {
      const { initDb, getChunk, getChunksBySource, getAllChunks } = await import('../db/sqlite.js');
      const db = initDb(dbPath);
      if (cmdOrFile === 'get') {
        const id = rest.find(a => !String(a).startsWith('--'));
        if (!id) throw new Error('Missing id');
        const row = getChunk(db, id);
        process.stdout.write(JSON.stringify(row ?? null, null, 2));
        db.close?.();
        return;
      }
      const limit = Number(args.get('limit') ?? 1000);
      const offset = Number(args.get('offset') ?? 0);
      const source = args.get('source');
      const rows = source ? getChunksBySource(db, source, {limit, offset}) : getAllChunks(db, {limit, offset});
      process.stdout.write(JSON.stringify(rows, null, 2));
      db.close?.();
      return;
    } catch (e) {
      console.error('DB query failed:', e.message);
      process.exit(1);
    }
  }

  // Ingest mode
  const file = cmdOrFile;
  const max = Number(args.get('max') ?? 4000);
  const pages = args.has('pages') ? Number(args.get('pages')) : undefined;
  const dbPath = args.get('db') ?? process.env.SUNNY_SQLITE; // if undefined, try in-memory when binding available

  const buf = await fs.readFile(file);
  const { meta, textByPage } = await parsePdf(buf, { maxPages: pages });
  const sections = buildSections(textByPage);
  const chunks = chunkSections(sections, { maxChars: max, sourceId: file });

  // Write to DB if binding available; prefer provided path, else :memory:
  try {
    const { initDb, saveChunks } = await import('../db/sqlite.js');
    const db = initDb(dbPath ?? ':memory:');
    saveChunks(db, chunks);
    db.close?.();
  } catch (e) {
    if (process.env.DEBUG) console.warn('DB disabled:', e.message);
  }

  const out = { meta, sections, chunks };
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
