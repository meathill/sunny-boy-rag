import Database from 'better-sqlite3';
const DEFAULT_PATH = process.env.SUNNY_SQLITE || ':memory:';

export function initDb(path = DEFAULT_PATH) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY, -- section code 'X Y Z'
      source_id TEXT NOT NULL,
      title TEXT,
      start_page INTEGER,
      end_page INTEGER,
      overview TEXT,
      p14 TEXT,
      p15 TEXT,
      p17 TEXT,
      p18 TEXT
    );

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      section_id TEXT,
      part_no INTEGER,
      title TEXT,
      UNIQUE(section_id, part_no)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      section_id TEXT,
      part_no INTEGER,
      level2_code TEXT,
      level3_code TEXT,
      title TEXT,
      start_page INTEGER,
      end_page INTEGER,
      text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);

    CREATE TABLE IF NOT EXISTS documents (
      source_id TEXT PRIMARY KEY,
      page_count INTEGER,
      processed_pages INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS std_refs (
      id TEXT PRIMARY KEY,
      title TEXT,
      raw TEXT
    );

    CREATE TABLE IF NOT EXISTS section_std_refs_relations (
      section_id TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      PRIMARY KEY(section_id, reference_id)
    );

    CREATE TABLE IF NOT EXISTS definitions (
      id TEXT PRIMARY KEY,
      term TEXT,
      raw TEXT
    );

    CREATE TABLE IF NOT EXISTS section_relations (
      section_id TEXT NOT NULL,
      related_section_id TEXT NOT NULL,
      PRIMARY KEY(section_id, related_section_id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      source_id TEXT PRIMARY KEY,
      page_count INTEGER,
      processed_pages INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS section_definition_relations (
      section_id TEXT NOT NULL,
      definition_id TEXT NOT NULL,
      PRIMARY KEY(section_id, definition_id)
    );
  `);
  return db;
}

export function saveChunks(db, chunks) {
  const stmt = db.prepare(`
    INSERT INTO chunks (id, source_id, section_id, part_no, level2_code, level3_code, title, start_page, end_page, text)
    VALUES (@id, @sourceId, @sectionId, @partNo, @level2Code, @level3Code, @title, @startPage, @endPage, @text)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      section_id = excluded.section_id,
      part_no = excluded.part_no,
      level2_code = excluded.level2_code,
      level3_code = excluded.level3_code,
      title = excluded.title,
      start_page = excluded.start_page,
      end_page = excluded.end_page,
      text = excluded.text
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run({
    ...r,
    partNo: r.partNo ?? null,
    level2Code: r.level2Code ?? null,
    level3Code: r.level3Code ?? null,
  }); });
  tx(chunks);
}

export function saveSections(db, sourceId, sections) {
  const stmt = db.prepare(`
    INSERT INTO sections (id, source_id, title, start_page, end_page, overview, p14, p15, p17, p18)
    VALUES (@id, @sourceId, @title, @startPage, @endPage, @overview, @p14, @p15, @p17, @p18)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      title = excluded.title,
      start_page = excluded.start_page,
      end_page = excluded.end_page,
      overview = excluded.overview,
      p14 = excluded.p14,
      p15 = excluded.p15,
      p17 = excluded.p17,
      p18 = excluded.p18
  `);
  const withSrc = sections.map(s => ({
    id: s.id,
    sourceId,
    title: s.title,
    startPage: s.startPage,
    endPage: s.endPage,
    overview: s.overview ?? null,
    p14: s.p14 ?? null,
    p15: s.p15 ?? null,
    p17: s.p17 ?? null,
    p18: s.p18 ?? null,
  }));
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run(r); });
  tx(withSrc);
}


export function getChunk(db, id) {
  return db.prepare('SELECT * FROM chunks WHERE id = ?').get(id);
}

export function getChunksBySource(db, sourceId, { limit = 1000, offset = 0 } = {}) {
  return db.prepare('SELECT * FROM chunks WHERE source_id = ? LIMIT ? OFFSET ?').all(sourceId, limit, offset);
}

export function getAllChunks(db, { limit = 1000, offset = 0 } = {}) {
  return db.prepare('SELECT * FROM chunks LIMIT ? OFFSET ?').all(limit, offset);
}

export function refreshDocument(db, sourceId, { pageCount = null, processedPages = 0 } = {}) {
  const now = new Date().toISOString();
  const total = db.prepare('SELECT COUNT(*) AS n FROM chunks WHERE source_id = ?').get(sourceId).n;
  db.prepare(`
    INSERT INTO documents (source_id, page_count, processed_pages, chunk_count, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      page_count = COALESCE(excluded.page_count, documents.page_count),
      processed_pages = MAX(documents.processed_pages, excluded.processed_pages),
      chunk_count = excluded.chunk_count,
      updated_at = excluded.updated_at
  `).run(sourceId, pageCount, processedPages, total, now);
}

export function saveSectionRelations(db, relations) {
  const stmt = db.prepare(`
    INSERT INTO section_relations (section_id, related_section_id)
    VALUES (@sectionId, @relatedSectionId)
    ON CONFLICT(section_id, related_section_id) DO NOTHING
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run({
    sectionId: r.sectionId,
    relatedSectionId: r.relatedSectionId,
  }); });
  tx(relations);
}

export function saveParts(db, sourceId, parts) {
  const stmt = db.prepare(`
    INSERT INTO parts (source_id, section_id, part_no, title)
    VALUES (@sourceId, @sectionId, @partNo, @title)
    ON CONFLICT(section_id, part_no) DO UPDATE SET
      title = excluded.title
  `);
  const withSrc = parts.map(p => ({ ...p, sourceId }));
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run(r); });
  tx(withSrc);
}

export function getDocuments(db, { limit = 100, offset = 0 } = {}) {
  return db.prepare('SELECT * FROM documents ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

export function getDocument(db, sourceId) {
  return db.prepare('SELECT * FROM documents WHERE source_id = ?').get(sourceId);
}
