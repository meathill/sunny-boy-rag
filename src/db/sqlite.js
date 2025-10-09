import Database from 'better-sqlite3';
const DEFAULT_PATH = process.env.SUNNY_SQLITE || ':memory:';

export function initDb(path = DEFAULT_PATH) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      section_code TEXT,
      title TEXT,
      start_page INTEGER,
      end_page INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sections_src_code ON sections(source_id, section_code);

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
  `);
  return db;
}

export function saveChunks(db, chunks) {
  const stmt = db.prepare(`
    INSERT INTO chunks (id, source_id, section_id, part_no, title, start_page, end_page, text)
    VALUES (@id, @sourceId, @sectionId, @partNo, @title, @startPage, @endPage, @text)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      section_id = excluded.section_id,
      part_no = excluded.part_no,
      title = excluded.title,
      start_page = excluded.start_page,
      end_page = excluded.end_page,
      text = excluded.text
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run({ ...r, partNo: r.partNo ?? null }); });
  tx(chunks);
}

export function saveSections(db, sourceId, sections) {
  const stmt = db.prepare(`
    INSERT INTO sections (id, source_id, section_code, title, start_page, end_page)
    VALUES (@id, @sourceId, @section, @title, @startPage, @endPage)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      section_code = excluded.section_code,
      title = excluded.title,
      start_page = excluded.start_page,
      end_page = excluded.end_page
  `);
  const withSrc = sections.map(s => ({ ...s, sourceId }));
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
