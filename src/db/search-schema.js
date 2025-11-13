/**
 * Advanced search schema and functions
 * Supports synonyms, translations, and full-text search
 */

/**
 * Create product_keywords table for synonym search
 * @param {Database} db - SQLite database instance
 */
export function createKeywordsTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_keywords (
      section_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      keyword_type TEXT NOT NULL,  -- 'primary', 'synonym', 'translation', 'abbreviation'
      language TEXT NOT NULL,       -- 'en', 'zh', 'ar', etc.
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(section_id, keyword)
    );

    CREATE INDEX IF NOT EXISTS idx_product_keywords_keyword 
      ON product_keywords(keyword);
    
    CREATE INDEX IF NOT EXISTS idx_product_keywords_section 
      ON product_keywords(section_id);
  `);
}

/**
 * Insert product keywords
 * @param {Database} db - SQLite database instance
 * @param {Array} keywords - Array of {sectionId, keyword, type, language}
 */
export function insertProductKeywords(db, keywords) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO product_keywords (section_id, keyword, keyword_type, language)
    VALUES (@sectionId, @keyword, @type, @language)
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      stmt.run({
        sectionId: item.sectionId,
        keyword: item.keyword.toLowerCase(), // 小写存储
        type: item.type,
        language: item.language,
      });
    }
  });

  tx(keywords);
}

/**
 * Search sections with synonym support
 * Searches product_keywords table first, falls back to title search
 * @param {Database} db - SQLite database instance
 * @param {string} keyword - Search keyword
 * @returns {Array} - Matching sections
 */
export function searchSectionsWithSynonyms(db, keyword) {
  if (!keyword || keyword.trim() === '') {
    return [];
  }

  const normalizedKeyword = keyword.toLowerCase().trim();

  // 1. Search in product_keywords table
  const matchedSectionIds = db.prepare(`
    SELECT DISTINCT section_id 
    FROM product_keywords 
    WHERE keyword LIKE ?
  `).all(`%${normalizedKeyword}%`).map(r => r.section_id);

  // 2. If found in keywords, return those sections
  if (matchedSectionIds.length > 0) {
    const placeholders = matchedSectionIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT id, title, start_page, end_page, overview
      FROM sections
      WHERE id IN (${placeholders})
      ORDER BY id
    `).all(...matchedSectionIds);
  }

  // 3. Fallback to title search (case-insensitive)
  return db.prepare(`
    SELECT id, title, start_page, end_page, overview
    FROM sections
    WHERE title LIKE ?
    ORDER BY id
  `).all(`%${keyword}%`);
}

/**
 * Get all keywords for a section
 * @param {Database} db - SQLite database instance
 * @param {string} sectionId - Section ID
 * @returns {Array} - Keywords
 */
export function getKeywordsForSection(db, sectionId) {
  return db.prepare(`
    SELECT keyword, keyword_type, language
    FROM product_keywords
    WHERE section_id = ?
    ORDER BY 
      CASE keyword_type
        WHEN 'primary' THEN 1
        WHEN 'synonym' THEN 2
        WHEN 'translation' THEN 3
        WHEN 'abbreviation' THEN 4
        ELSE 5
      END,
      keyword
  `).all(sectionId);
}

/**
 * Delete all keywords for a section
 * @param {Database} db - SQLite database instance
 * @param {string} sectionId - Section ID
 */
export function deleteKeywordsForSection(db, sectionId) {
  db.prepare(`
    DELETE FROM product_keywords WHERE section_id = ?
  `).run(sectionId);
}
