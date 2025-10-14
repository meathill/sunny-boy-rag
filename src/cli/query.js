#!/usr/bin/env node
import 'dotenv/config';
import { initDb, getSectionRequirements, getAllSectionRequirementsRecursive } from '../db/sqlite.js';

const DEFAULT_PATH = process.env.SUNNY_SQLITE || ':memory:';

function formatRequirements(data, options = {}) {
  const { format = 'json', recursive = false } = options;

  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  if (format === 'text') {
    let output = '';
    
    output += `\n=== Section ${data.sectionId} Requirements ===\n`;
    
    if (data.relatedSections && data.relatedSections.length > 0) {
      output += `\nRelated Sections (${data.relatedSections.length}):\n`;
      data.relatedSections.forEach(rel => {
        output += `  - ${rel.related_section_id}: ${rel.title || '(no title)'}\n`;
      });
    }
    
    if (data.compliance && data.compliance.length > 0) {
      output += `\nCompliance Requirements (${data.compliance.length}):\n`;
      data.compliance.forEach((req, i) => {
        output += `  ${i + 1}. [${req.std_ref_id || 'N/A'}] ${req.requirement_text}\n`;
        if (req.applies_to) output += `     Applies to: ${req.applies_to}\n`;
      });
    }
    
    if (data.technical && data.technical.length > 0) {
      output += `\nTechnical Specifications (${data.technical.length}):\n`;
      const byCategory = {};
      data.technical.forEach(spec => {
        const cat = spec.spec_category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(spec);
      });
      
      Object.entries(byCategory).forEach(([category, specs]) => {
        output += `  ${category}:\n`;
        specs.forEach(spec => {
          const valueStr = spec.value + (spec.unit ? spec.unit : '');
          output += `    - ${spec.parameter_name}: ${valueStr}\n`;
          if (spec.test_standard) output += `      Test: ${spec.test_standard}\n`;
        });
      });
    }
    
    if (data.design && data.design.length > 0) {
      output += `\nDesign & Installation Requirements (${data.design.length}):\n`;
      const byCategory = {};
      data.design.forEach(req => {
        const cat = req.requirement_category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(req);
      });
      
      Object.entries(byCategory).forEach(([category, reqs]) => {
        output += `  ${category}:\n`;
        reqs.forEach(req => {
          output += `    - ${req.requirement_text}\n`;
        });
      });
    }
    
    if (data.testing && data.testing.length > 0) {
      output += `\nTesting & Acceptance Requirements (${data.testing.length}):\n`;
      const byType = {};
      data.testing.forEach(req => {
        const type = req.test_type || 'Other';
        if (!byType[type]) byType[type] = [];
        byType[type].push(req);
      });
      
      Object.entries(byType).forEach(([type, reqs]) => {
        output += `  ${type}:\n`;
        reqs.forEach(req => {
          output += `    - ${req.requirement_text}\n`;
        });
      });
    }

    if (recursive && data.indirect) {
      Object.entries(data.indirect).forEach(([sectionId, indirectData]) => {
        output += `\n${formatRequirements(indirectData, { format: 'text', recursive: false })}`;
      });
    }
    
    return output;
  }

  return JSON.stringify(data);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Query Requirements - Search and retrieve requirements from database

Usage:
  query <section_id> [options]

Arguments:
  section_id         Section code (e.g., "26 24 13", "26 25 13")

Options:
  --recursive        Include requirements from related sections
  --format FORMAT    Output format: json, text (default: json)
  --db PATH          Database file path (default: $SUNNY_SQLITE)
  --help             Show this help

Examples:
  # Get requirements for section "26 24 13"
  ./src/cli/query.js "26 24 13"
  
  # Get requirements with related sections in text format
  ./src/cli/query.js "26 24 13" --recursive --format text
  
  # Query specific database
  ./src/cli/query.js "26 25 13" --db ./data.sqlite
`);
    process.exit(0);
  }

  const sectionId = args[0];
  const options = {
    recursive: args.includes('--recursive'),
    format: 'json',
    dbPath: DEFAULT_PATH,
  };

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format') options.format = args[++i];
    else if (args[i] === '--db') options.dbPath = args[++i];
  }

  const db = initDb(options.dbPath);
  
  try {
    const data = options.recursive
      ? getAllSectionRequirementsRecursive(db, sectionId)
      : getSectionRequirements(db, sectionId);
    
    const output = formatRequirements(data, options);
    console.log(output);
  } catch (error) {
    console.error('Error querying requirements:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
