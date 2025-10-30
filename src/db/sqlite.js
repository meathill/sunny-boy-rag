import Database from 'better-sqlite3';
import { createAITables } from './ai-schema.js';
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
      level2_title TEXT,
      level3_title TEXT,
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
      title TEXT
    );

    CREATE TABLE IF NOT EXISTS section_std_refs_relations (
      section_id TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      PRIMARY KEY(section_id, reference_id)
    );

    CREATE TABLE IF NOT EXISTS definitions (
      id TEXT PRIMARY KEY,
      definition TEXT
    );

    CREATE TABLE IF NOT EXISTS section_relations (
      section_id TEXT NOT NULL,
      related_section_id TEXT NOT NULL,
      PRIMARY KEY(section_id, related_section_id)
    );

    CREATE TABLE IF NOT EXISTS section_definition_relations (
      section_id TEXT NOT NULL,
      definition_id TEXT NOT NULL,
      PRIMARY KEY(section_id, definition_id)
    );
  `);
  
  // Create AI-related tables
  createAITables(db);
  
  return db;
}

export function saveChunks(db, chunks) {
  const stmt = db.prepare(`
    INSERT INTO chunks (id, source_id, section_id, part_no, level2_code, level3_code, level2_title, level3_title, title, start_page, end_page, text)
    VALUES (@id, @sourceId, @sectionId, @partNo, @level2Code, @level3Code, @level2Title, @level3Title, @title, @startPage, @endPage, @text)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      section_id = excluded.section_id,
      part_no = excluded.part_no,
      level2_code = excluded.level2_code,
      level3_code = excluded.level3_code,
      level2_title = excluded.level2_title,
      level3_title = excluded.level3_title,
      title = excluded.title,
      start_page = excluded.start_page,
      end_page = excluded.end_page,
      text = excluded.text
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run({
    id: r.id,
    sourceId: r.sourceId,
    sectionId: r.sectionId ?? null,
    partNo: r.partNo ?? null,
    level2Code: r.level2Code ?? null,
    level3Code: r.level3Code ?? null,
    level2Title: r.level2Title ?? null,
    level3Title: r.level3Title ?? null,
    title: r.title ?? null,
    startPage: r.startPage ?? null,
    endPage: r.endPage ?? null,
    text: r.text ?? '',
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

export function saveStdRefs(db, refs) {
  const stmt = db.prepare(`
    INSERT INTO std_refs (id, title)
    VALUES (@id, @title)
    ON CONFLICT(id) DO UPDATE SET
      title = COALESCE(excluded.title, std_refs.title)
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run({ id: r.id, title: r.title }); });
  tx(refs);
}

export function saveSectionStdRefRelations(db, relations) {
  const stmt = db.prepare(`
    INSERT INTO section_std_refs_relations (section_id, reference_id)
    VALUES (@sectionId, @referenceId)
    ON CONFLICT(section_id, reference_id) DO NOTHING
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run(r); });
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

export function saveDefinitions(db, definitions) {
  const stmt = db.prepare(`
    INSERT INTO definitions (id, definition)
    VALUES (@id, @definition)
    ON CONFLICT(id) DO UPDATE SET
      definition = COALESCE(excluded.definition, definitions.definition)
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run({ id: r.id, definition: r.definition }); });
  tx(definitions);
}

export function saveSectionDefinitionRelations(db, relations) {
  const stmt = db.prepare(`
    INSERT INTO section_definition_relations (section_id, definition_id)
    VALUES (@sectionId, @definitionId)
    ON CONFLICT(section_id, definition_id) DO NOTHING
  `);
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run(r); });
  tx(relations);
}

// AI Parsing Related Functions

export function saveComplianceRequirements(db, requirements) {
  const stmt = db.prepare(`
    INSERT INTO compliance_requirements (
      section_id, chunk_id, std_ref_id, requirement_text, 
      applies_to, is_mandatory, requirement_type
    )
    VALUES (
      @sectionId, @chunkId, @stdRefId, @requirementText,
      @appliesTo, @isMandatory, @requirementType
    )
  `);
  const tx = db.transaction((rows) => { 
    for (const r of rows) stmt.run({
      sectionId: r.sectionId,
      chunkId: r.chunkId,
      stdRefId: r.stdRefId ?? null,
      requirementText: r.requirementText,
      appliesTo: r.appliesTo ?? null,
      isMandatory: r.isMandatory ?? 1,
      requirementType: r.requirementType ?? null,
    }); 
  });
  tx(requirements);
}

export function saveTechnicalSpecs(db, specs) {
  const stmt = db.prepare(`
    INSERT INTO technical_specs (
      section_id, chunk_id, spec_category, parameter_name,
      value, unit, test_standard, requirement_text, applies_to
    )
    VALUES (
      @sectionId, @chunkId, @specCategory, @parameterName,
      @value, @unit, @testStandard, @requirementText, @appliesTo
    )
  `);
  const tx = db.transaction((rows) => { 
    for (const r of rows) stmt.run({
      sectionId: r.sectionId,
      chunkId: r.chunkId,
      specCategory: r.specCategory ?? null,
      parameterName: r.parameterName ?? null,
      value: r.value ?? null,
      unit: r.unit ?? null,
      testStandard: r.testStandard ?? null,
      requirementText: r.requirementText,
      appliesTo: r.appliesTo ?? null,
    }); 
  });
  tx(specs);
}

export function saveDesignRequirements(db, requirements) {
  const stmt = db.prepare(`
    INSERT INTO design_requirements (
      section_id, chunk_id, requirement_category, requirement_text,
      applies_to, is_mandatory
    )
    VALUES (
      @sectionId, @chunkId, @requirementCategory, @requirementText,
      @appliesTo, @isMandatory
    )
  `);
  const tx = db.transaction((rows) => { 
    for (const r of rows) stmt.run({
      sectionId: r.sectionId,
      chunkId: r.chunkId,
      requirementCategory: r.requirementCategory ?? null,
      requirementText: r.requirementText,
      appliesTo: r.appliesTo ?? null,
      isMandatory: r.isMandatory ?? 1,
    }); 
  });
  tx(requirements);
}

export function saveTestingRequirements(db, requirements) {
  const stmt = db.prepare(`
    INSERT INTO testing_requirements (
      section_id, chunk_id, test_type, requirement_text,
      applies_to, is_mandatory
    )
    VALUES (
      @sectionId, @chunkId, @testType, @requirementText,
      @appliesTo, @isMandatory
    )
  `);
  const tx = db.transaction((rows) => { 
    for (const r of rows) stmt.run({
      sectionId: r.sectionId,
      chunkId: r.chunkId,
      testType: r.testType ?? null,
      requirementText: r.requirementText,
      appliesTo: r.appliesTo ?? null,
      isMandatory: r.isMandatory ?? 1,
    }); 
  });
  tx(requirements);
}

export function updateAIProcessingStatus(db, chunkId, status) {
  db.prepare(`
    INSERT INTO ai_processing_status (
      chunk_id, processed, processing_started_at, 
      processing_completed_at, error_message, retry_count
    )
    VALUES (@chunkId, @processed, @startedAt, @completedAt, @errorMessage, @retryCount)
    ON CONFLICT(chunk_id) DO UPDATE SET
      processed = excluded.processed,
      processing_started_at = COALESCE(excluded.processing_started_at, ai_processing_status.processing_started_at),
      processing_completed_at = excluded.processing_completed_at,
      error_message = excluded.error_message,
      retry_count = excluded.retry_count
  `).run({
    chunkId,
    processed: status.processed ?? 0,
    startedAt: status.startedAt ?? null,
    completedAt: status.completedAt ?? null,
    errorMessage: status.errorMessage ?? null,
    retryCount: status.retryCount ?? 0,
  });
}

export function getUnprocessedChunks(db, { limit = 100, offset = 0, sectionId = null } = {}) {
  const whereClauses = [
    'c.part_no IN (2, 3)',
    '(aps.processed IS NULL OR aps.processed = 0)'
  ];
  
  const params = [];
  
  if (sectionId) {
    whereClauses.push('c.section_id = ?');
    params.push(sectionId);
  }
  
  params.push(limit, offset);
  
  return db.prepare(`
    SELECT c.* FROM chunks c
    LEFT JOIN ai_processing_status aps ON c.id = aps.chunk_id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY c.section_id, c.part_no, c.level2_code, c.level3_code
    LIMIT ? OFFSET ?
  `).all(...params);
}

export function getProcessingStats(db) {
  return db.prepare(`
    SELECT 
      COUNT(*) as total_chunks,
      SUM(CASE WHEN aps.processed = 1 THEN 1 ELSE 0 END) as processed_chunks,
      SUM(CASE WHEN aps.error_message IS NOT NULL THEN 1 ELSE 0 END) as error_chunks
    FROM chunks c
    LEFT JOIN ai_processing_status aps ON c.id = aps.chunk_id
    WHERE c.part_no IN (2, 3)
  `).get();
}

export function getSectionRequirements(db, sectionId) {
  const compliance = db.prepare(`
    SELECT cr.*, sr.title as std_ref_title
    FROM compliance_requirements cr
    LEFT JOIN std_refs sr ON cr.std_ref_id = sr.id
    WHERE cr.section_id = ?
    ORDER BY cr.id
  `).all(sectionId);

  const technical = db.prepare(`
    SELECT * FROM technical_specs
    WHERE section_id = ?
    ORDER BY spec_category, parameter_name
  `).all(sectionId);

  const design = db.prepare(`
    SELECT * FROM design_requirements
    WHERE section_id = ?
    ORDER BY requirement_category
  `).all(sectionId);

  const testing = db.prepare(`
    SELECT * FROM testing_requirements
    WHERE section_id = ?
    ORDER BY test_type
  `).all(sectionId);

  const relatedSections = db.prepare(`
    SELECT related_section_id, s.title
    FROM section_relations sr
    LEFT JOIN sections s ON sr.related_section_id = s.id
    WHERE sr.section_id = ?
  `).all(sectionId);

  return {
    sectionId,
    compliance,
    technical,
    design,
    testing,
    relatedSections,
  };
}

export function getAllSectionRequirementsRecursive(db, sectionId, visited = new Set()) {
  if (visited.has(sectionId)) return {};
  visited.add(sectionId);

  const direct = getSectionRequirements(db, sectionId);
  const result = { ...direct, indirect: {} };

  for (const rel of direct.relatedSections) {
    const relatedReqs = getAllSectionRequirementsRecursive(db, rel.related_section_id, visited);
    result.indirect[rel.related_section_id] = relatedReqs;
  }

  return result;
}

/**
 * Search sections by product name/keyword
 * Case-insensitive partial matching on section title
 * @param {Database} db - SQLite database instance
 * @param {string} keyword - Product name or keyword to search
 * @returns {Array} - Matching sections with id and title
 */
export function searchSectionsByProduct(db, keyword) {
  if (!keyword || keyword.trim() === '') {
    return [];
  }

  // Case-insensitive LIKE search
  const sections = db.prepare(`
    SELECT id, title, start_page, end_page, overview
    FROM sections
    WHERE title LIKE ?
    ORDER BY id
  `).all(`%${keyword}%`);

  return sections;
}

/**
 * Get requirements for a product by name
 * Searches sections by product name and returns all requirements
 * @param {Database} db - SQLite database instance
 * @param {string} productName - Product name or keyword
 * @param {boolean} recursive - Include related sections (default: false)
 * @returns {Object} - Search results with matched sections and their requirements
 */
export function getRequirementsByProduct(db, productName, recursive = false) {
  const matchedSections = searchSectionsByProduct(db, productName);

  if (matchedSections.length === 0) {
    return {
      query: productName,
      matchedSections: [],
      results: [],
    };
  }

  const results = matchedSections.map(section => {
    const requirements = recursive
      ? getAllSectionRequirementsRecursive(db, section.id)
      : getSectionRequirements(db, section.id);

    return {
      section: {
        id: section.id,
        title: section.title,
        startPage: section.start_page,
        endPage: section.end_page,
      },
      requirements,
    };
  });

  return {
    query: productName,
    matchedSections: matchedSections.map(s => ({ id: s.id, title: s.title })),
    results,
  };
}
