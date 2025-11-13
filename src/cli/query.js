#!/usr/bin/env node
import 'dotenv/config';
import { 
  initDb, 
  getSectionRequirements, 
  getAllSectionRequirementsRecursive,
  getRequirementsByProduct,
  searchSectionsWithSynonyms,
  smartSearch,
  syncFTSTable
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
Query Requirements - Advanced search with synonyms and full-text search

Usage:
  query <search_term> [options]

Arguments:
  search_term        Search query:
                     - Section ID: "26 24 13" or "26.24.13"
                     - Product name: "switchboard", "配电柜", "MCC"
                     - FTS5 query: "motor AND control", "switch*", "panel OR board"

Search Modes (automatic):
  1. Section ID      - Direct lookup by section code
  2. Synonym Search  - Matches keywords (synonyms, translations, abbreviations)
  3. FTS5 Full-text  - Boolean operators (AND, OR, NOT), phrase ("..."), prefix (*)
  4. Basic Search    - Fallback to title LIKE search

Options:
  --recursive        Include requirements from related sections
  --format FORMAT    Output format: json, text (default: json)
  --search-mode MODE Force search mode: synonym, fts, basic, auto (default: auto)
  --db PATH          Database file path (default: $SUNNY_SQLITE)
  --sync-fts         Sync FTS5 table before search
  --help             Show this help

Examples:
  # Section ID
  ./src/cli/query.js "26 24 13"
  
  # Synonym search (English, Chinese, abbreviations)
  ./src/cli/query.js "panel board"
  ./src/cli/query.js "配电柜"
  ./src/cli/query.js "MCC"
  
  # FTS5 Boolean search
  ./src/cli/query.js "motor AND control"
  ./src/cli/query.js "switchboard OR busway"
  ./src/cli/query.js '"low voltage"'
  
  # Prefix search
  ./src/cli/query.js "switch*"
  
  # Force specific search mode
  ./src/cli/query.js "switchboard" --search-mode fts
  
  # Sync FTS table and search
  ./src/cli/query.js "voltage" --sync-fts
  
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
    syncFTS: args.includes('--sync-fts'),
    format: 'json',
    searchMode: 'auto',
    dbPath: DEFAULT_PATH,
  };

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format') options.format = args[++i];
    else if (args[i] === '--db') options.dbPath = args[++i];
    else if (args[i] === '--search-mode') options.searchMode = args[++i];
  }

  const db = initDb(options.dbPath);
  
  // Sync FTS table if requested
  if (options.syncFTS) {
    console.error('Syncing FTS table...');
    syncFTSTable(db);
    console.error('✓ FTS table synced\n');
  }
  
  try {
    let output;
    let searchResults;

    // Use smart search based on mode
    if (options.searchMode === 'auto') {
      // Automatic mode - smartSearch decides
      searchResults = smartSearch(db, searchTerm, {
        useFTS: true,
        useSynonyms: true,
        limit: 50,
      });
      
      if (options.format === 'json') {
        // Add strategy info in JSON mode
        console.error(`Search strategy: ${searchResults.strategy}`);
      }
    } else if (options.searchMode === 'synonym') {
      // Force synonym search
      searchResults = {
        results: searchSectionsWithSynonyms(db, searchTerm),
        strategy: 'synonym_forced',
      };
    } else if (options.searchMode === 'fts') {
      // Force FTS5 search
      const { searchSectionsFullText } = await import('../db/sqlite.js');
      searchResults = {
        results: searchSectionsFullText(db, searchTerm, { limit: 50 }),
        strategy: 'fts5_forced',
      };
    } else if (options.searchMode === 'basic') {
      // Force basic search
      searchResults = {
        results: db.prepare(`
          SELECT id, title, start_page, end_page, overview
          FROM sections
          WHERE title LIKE ?
          ORDER BY id
        `).all(`%${searchTerm}%`),
        strategy: 'basic_forced',
      };
    }

    // Handle results
    if (!searchResults || searchResults.results.length === 0) {
      console.error(`No sections found matching "${searchTerm}"`);
      console.error('Try a different search term or use Section ID (e.g., "26 24 13")');
      process.exit(1);
    }

    // If Section ID was detected, get full requirements
    if (searchResults.strategy === 'section_id') {
      const sectionId = searchResults.results[0].id;
      const data = options.recursive
        ? getAllSectionRequirementsRecursive(db, sectionId)
        : getSectionRequirements(db, sectionId);
      
      output = formatRequirements(data, options);
    } else {
      // For other searches, format as product search results
      const matchedSections = searchResults.results;
      
      const fullResults = {
        query: searchTerm,
        strategy: searchResults.strategy,
        matchedSections: matchedSections.map(s => ({ 
          id: s.id, 
          title: s.title,
          relevance: s.relevance,
        })),
        results: matchedSections.map(section => {
          const requirements = options.recursive
            ? getAllSectionRequirementsRecursive(db, section.id)
            : getSectionRequirements(db, section.id);

          return {
            section: {
              id: section.id,
              title: section.title,
              startPage: section.start_page,
              endPage: section.end_page,
              relevance: section.relevance,
              title_snippet: section.title_snippet,
              overview_snippet: section.overview_snippet,
            },
            requirements,
          };
        }),
      };

      output = formatProductSearchResults(fullResults, options);
    }
    
    console.log(output);
  } catch (error) {
    console.error('Error querying requirements:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
