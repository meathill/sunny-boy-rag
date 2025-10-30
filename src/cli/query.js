#!/usr/bin/env node
import 'dotenv/config';
import { 
  initDb, 
  getSectionRequirements, 
  getAllSectionRequirementsRecursive,
  getRequirementsByProduct 
} from '../db/sqlite.js';

const DEFAULT_PATH = process.env.SUNNY_SQLITE || ':memory:';

/**
 * Check if input looks like a Section ID (format: "X Y Z" or "X.Y.Z")
 */
function isSectionId(input) {
  return /^\d+[\s.]\d+[\s.]\d+$/.test(input.trim());
}

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

function formatProductSearchResults(results, options = {}) {
  const { format = 'json' } = options;

  if (format === 'json') {
    return JSON.stringify(results, null, 2);
  }

  if (format === 'text') {
    let output = `\n=== Search Results for "${results.query}" ===\n`;
    
    if (results.matchedSections.length === 0) {
      output += '\nNo matching products/sections found.\n';
      return output;
    }

    output += `\nFound ${results.matchedSections.length} matching section(s):\n`;
    results.matchedSections.forEach(s => {
      output += `  - ${s.id}: ${s.title}\n`;
    });

    results.results.forEach(result => {
      output += `\n${'='.repeat(60)}\n`;
      output += formatRequirements(result.requirements, options);
    });

    return output;
  }

  return JSON.stringify(results);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Query Requirements - Search requirements by Section ID or Product Name

Usage:
  query <search_term> [options]

Arguments:
  search_term        Section ID (e.g., "26 24 13") or Product name (e.g., "switchboard")
                     The tool automatically detects the format:
                     - Pattern "X Y Z" or "X.Y.Z" → Section ID search
                     - Any other text → Product name search

Options:
  --recursive        Include requirements from related sections
  --format FORMAT    Output format: json, text (default: json)
  --db PATH          Database file path (default: $SUNNY_SQLITE)
  --help             Show this help

Examples:
  # Search by Section ID
  ./src/cli/query.js "26 24 13"
  
  # Search by product name (case-insensitive, partial match)
  ./src/cli/query.js "switchboard"
  ./src/cli/query.js "motor control"
  
  # Get requirements with related sections in text format
  ./src/cli/query.js "switchboard" --recursive --format text
  
  # Query specific database
  ./src/cli/query.js "busway" --db ./data.sqlite
`);
    process.exit(0);
  }

  const searchTerm = args[0];
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
    let output;

    if (isSectionId(searchTerm)) {
      // Search by Section ID
      const sectionId = searchTerm.replace(/\./g, ' '); // Normalize "26.24.13" to "26 24 13"
      const data = options.recursive
        ? getAllSectionRequirementsRecursive(db, sectionId)
        : getSectionRequirements(db, sectionId);
      
      output = formatRequirements(data, options);
    } else {
      // Search by product name
      const results = getRequirementsByProduct(db, searchTerm, options.recursive);
      
      if (results.matchedSections.length === 0) {
        console.error(`No sections found matching "${searchTerm}"`);
        console.error('Try a different search term or use Section ID (e.g., "26 24 13")');
        process.exit(1);
      }

      output = formatProductSearchResults(results, options);
    }
    
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
