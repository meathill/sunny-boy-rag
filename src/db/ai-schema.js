/**
 * Extended schema for AI-extracted structured data
 * Supports storing compliance requirements and technical specs
 */

export function createAITables(db) {
  // 标准合规要求表
  db.exec(`
    CREATE TABLE IF NOT EXISTS compliance_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      std_ref_id TEXT,
      requirement_text TEXT NOT NULL,
      applies_to TEXT,
      is_mandatory INTEGER DEFAULT 1,
      requirement_type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_compliance_section ON compliance_requirements(section_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_compliance_chunk ON compliance_requirements(chunk_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_compliance_std_ref ON compliance_requirements(std_ref_id)`);

  // 技术规格表
  db.exec(`
    CREATE TABLE IF NOT EXISTS technical_specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      spec_category TEXT,
      parameter_name TEXT,
      value TEXT,
      unit TEXT,
      test_standard TEXT,
      requirement_text TEXT NOT NULL,
      applies_to TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_technical_section ON technical_specs(section_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_technical_chunk ON technical_specs(chunk_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_technical_category ON technical_specs(spec_category)`);

  // 设计与安装要求表
  db.exec(`
    CREATE TABLE IF NOT EXISTS design_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      requirement_category TEXT,
      requirement_text TEXT NOT NULL,
      applies_to TEXT,
      is_mandatory INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_design_section ON design_requirements(section_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_design_chunk ON design_requirements(chunk_id)`);

  // 测试与验收要求表
  db.exec(`
    CREATE TABLE IF NOT EXISTS testing_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      test_type TEXT,
      requirement_text TEXT NOT NULL,
      applies_to TEXT,
      is_mandatory INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_testing_section ON testing_requirements(section_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_testing_chunk ON testing_requirements(chunk_id)`);

  // AI处理状态跟踪表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_processing_status (
      chunk_id TEXT PRIMARY KEY,
      processed INTEGER DEFAULT 0,
      processing_started_at TEXT,
      processing_completed_at TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0
    )
  `);
}
