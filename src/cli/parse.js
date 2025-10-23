#!/usr/bin/env node
import 'dotenv/config';
import { initDb, getUnprocessedChunks, saveComplianceRequirements, saveTechnicalSpecs, saveDesignRequirements, saveTestingRequirements, updateAIProcessingStatus, getProcessingStats, saveStdRefs, saveSectionStdRefRelations } from '../db/sqlite.js';
import { batchProcessChunks } from '../ai/parser.js';
import { createAIClient } from '../ai/client.js';

const DEFAULT_PATH = process.env.SUNNY_SQLITE || ':memory:';

async function parseCommand(args) {
  const options = {
    limit: 100,
    offset: 0,
    concurrency: 1,
    delayMs: 0,
    dbPath: DEFAULT_PATH,
    sectionId: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') options.limit = parseInt(args[++i]);
    else if (args[i] === '--offset') options.offset = parseInt(args[++i]);
    else if (args[i] === '--concurrency') options.concurrency = parseInt(args[++i]);
    else if (args[i] === '--delay') options.delayMs = parseInt(args[++i]);
    else if (args[i] === '--db') options.dbPath = args[++i];
    else if (args[i] === '--section-id') options.sectionId = args[++i];
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
AI Parse - Extract structured requirements from PDF chunks

Usage:
  parse [options]

Commands:
  parse              Process unprocessed chunks
  stats              Show processing statistics
  
Options:
  --limit N          Number of chunks to process (default: 100)
  --offset N         Skip first N chunks (default: 0)
  --concurrency N    Number of parallel AI requests (default: 1)
  --delay N          Delay in milliseconds between AI requests (default: 0)
                     Note: Each chunk makes 4 AI requests (compliance, technical, 
                     design, testing). With delay>0, they run serially with delay 
                     between each. E.g., --delay 5000 = ~15s per chunk.
  --section-id "X Y Z"  Process only chunks from specific section (e.g., "26 24 13")
  --db PATH          Database file path (default: $SUNNY_SQLITE or :memory:)
  --help             Show this help

Environment Variables:
  SUNNY_SQLITE       Database file path
  AI_PROVIDER        AI provider: openai, anthropic, mock (default: mock)
  AI_API_KEY         API key for AI provider
  AI_MODEL           Model name (optional)

Examples:
  # Process first 10 chunks
  ./src/cli/parse.js parse --limit 10
  
  # Process only chunks from a specific section
  ./src/cli/parse.js parse --section-id "26 24 13"
  
  # Show processing stats
  ./src/cli/parse.js stats
  
  # Use OpenAI with rate limiting (5s delay = ~15s per chunk)
  # Each chunk = 4 AI requests (serial when delay>0)
  AI_PROVIDER=openai ./src/cli/parse.js parse --concurrency 1 --delay 5000
  
  # Process with custom concurrency (parallel requests, fast)
  ./src/cli/parse.js parse --concurrency 3
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'stats') {
    const db = initDb(DEFAULT_PATH);
    const stats = getProcessingStats(db);
    console.log(JSON.stringify(stats, null, 2));
    db.close();
    return;
  }

  if (command === 'parse' || !command) {
    const options = await parseCommand(args.slice(command ? 1 : 0));
    const db = initDb(options.dbPath);

    console.error('Fetching unprocessed chunks...');
    const chunks = getUnprocessedChunks(db, {
      limit: options.limit,
      offset: options.offset,
      sectionId: options.sectionId,
    });

    if (chunks.length === 0) {
      console.error('No unprocessed chunks found.');
      db.close();
      return;
    }

    const sectionInfo = options.sectionId ? ` from section ${options.sectionId}` : '';
    const delayInfo = options.delayMs > 0 ? ` (${options.delayMs}ms delay between batches)` : '';
    console.error(`Processing ${chunks.length} chunks${sectionInfo} with concurrency ${options.concurrency}${delayInfo}...`);

    const aiClient = createAIClient();
    let processed = 0;
    let errors = 0;

    const { results } = await batchProcessChunks(chunks, aiClient, {
      concurrency: options.concurrency,
      delayMs: options.delayMs,
      onProgress: ({ chunk, result }) => {
        processed++;
        console.error(`[${processed}/${chunks.length}] Processed chunk ${chunk.id}`);

        // Save results to database
        try {
          const now = new Date().toISOString();

          if (result.compliance.length > 0) {
            // Extract new standard references
            const newStdRefs = result.compliance
              .filter(c => c.stdRefId)
              .map(c => ({ id: c.stdRefId, title: null }));

            if (newStdRefs.length > 0) {
              saveStdRefs(db, newStdRefs);

              // Create relations
              const relations = newStdRefs.map(ref => ({
                sectionId: chunk.section_id,
                referenceId: ref.id,
              }));
              saveSectionStdRefRelations(db, relations);
            }

            saveComplianceRequirements(db, result.compliance);
          }

          if (result.technical.length > 0) {
            saveTechnicalSpecs(db, result.technical);
          }

          if (result.design.length > 0) {
            saveDesignRequirements(db, result.design);
          }

          if (result.testing.length > 0) {
            saveTestingRequirements(db, result.testing);
          }

          // Mark as processed
          updateAIProcessingStatus(db, chunk.id, {
            processed: 1,
            completedAt: now,
            errorMessage: null,
          });
        } catch (error) {
          console.error(`Error saving results for chunk ${chunk.id}:`, error.message);
          updateAIProcessingStatus(db, chunk.id, {
            processed: 0,
            errorMessage: error.message,
            retryCount: 1,
          });
          errors++;
        }
      },
      onError: ({ chunk, error }) => {
        errors++;
        console.error(`Error processing chunk ${chunk.id}:`, error.message);
        updateAIProcessingStatus(db, chunk.id, {
          processed: 0,
          errorMessage: error.message,
          retryCount: 1,
        });
      },
    });

    console.error(`\nProcessing complete: ${processed} processed, ${errors} errors`);

    const stats = getProcessingStats(db);
    console.log(JSON.stringify(stats, null, 2));

    db.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
