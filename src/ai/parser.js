/**
 * AI-powered requirements parser
 * Extracts structured data from Part 2 and Part 3 chunks
 */

/**
 * Extract compliance requirements from chunk text
 * @param {string} text - Chunk text content
 * @param {Object} context - Context information (section_id, chunk_id, etc.)
 * @returns {Promise<Array>} - Array of compliance requirements
 */
export async function extractComplianceRequirements(text, context, aiClient) {
  const prompt = `Analyze the following technical specification text and extract ALL standard compliance requirements.

A standard compliance requirement is any statement that mentions:
- International/industry standard IDs (e.g., IEC, BS, EN, ISO, ASTM, NEMA, UL, DEWA, etc.)
- Certification requirements (e.g., "shall be certified by ASTA/KEMA")
- Accreditation requirements (e.g., "ISO 9001 accredited")

For EACH requirement found, provide:
1. std_ref_id: The standard reference ID (e.g., "IEC 61439-1", "ISO 9001")
   - If multiple standards in one sentence, create separate entries
   - If no specific standard ID, use null
2. requirement_text: The complete original sentence or requirement statement
3. applies_to: What component/product this applies to (if mentioned, otherwise null)
4. is_mandatory: 1 if uses "shall/must", 0 if uses "should/recommended"
5. requirement_type: One of: "standard_compliance", "certification", "accreditation", "test_method"

Return ONLY a valid JSON array. If no compliance requirements found, return empty array [].

Text to analyze:
---
${text}
---

JSON output:`;

  const response = await aiClient.complete(prompt);
  const extracted = parseAIResponse(response);
  
  // Enrich with context
  return extracted.map(req => ({
    sectionId: context.sectionId,
    chunkId: context.chunkId,
    stdRefId: req.std_ref_id,
    requirementText: req.requirement_text,
    appliesTo: req.applies_to,
    isMandatory: req.is_mandatory ?? 1,
    requirementType: req.requirement_type,
  }));
}

/**
 * Extract technical specifications from chunk text
 */
export async function extractTechnicalSpecs(text, context, aiClient) {
  const prompt = `Analyze the following technical specification text and extract ALL technical specifications and performance requirements.

A technical specification is any statement that defines:
- Electrical parameters (voltage, current, frequency, power, etc.)
- Mechanical properties (dimensions, weight, mounting, etc.)
- Environmental conditions (temperature, humidity, IP/IK ratings, etc.)
- Performance metrics (efficiency, capacity, rating, etc.)
- Protection requirements (overload, short-circuit, earth leakage, etc.)

For EACH specification found, provide:
1. spec_category: One of "electrical", "mechanical", "environmental", "protection", "performance", "material"
2. parameter_name: The parameter being specified (e.g., "voltage", "temperature", "IP_rating", "frequency")
3. value: The specific value or range (e.g., "400V", "52°C", "IP54", "50Hz")
4. unit: The unit of measurement (if applicable, e.g., "V", "°C", "Hz", "mm")
5. test_standard: If a test standard is mentioned (e.g., "IEC 62262", "IEC 60529")
6. requirement_text: The complete original sentence
7. applies_to: What component/product this applies to (if mentioned, otherwise null)

Return ONLY a valid JSON array. If no technical specs found, return empty array [].

Text to analyze:
---
${text}
---

JSON output:`;

  const response = await aiClient.complete(prompt);
  const extracted = parseAIResponse(response);
  
  return extracted.map(spec => ({
    sectionId: context.sectionId,
    chunkId: context.chunkId,
    specCategory: spec.spec_category,
    parameterName: spec.parameter_name,
    value: spec.value,
    unit: spec.unit,
    testStandard: spec.test_standard,
    requirementText: spec.requirement_text,
    appliesTo: spec.applies_to,
  }));
}

/**
 * Extract design and installation requirements
 */
export async function extractDesignRequirements(text, context, aiClient) {
  const prompt = `Analyze the following technical specification text and extract ALL design and installation requirements.

A design/installation requirement is any statement about:
- Physical design (color, finish, enclosure type, cable entry, etc.)
- Construction requirements (materials, assembly, internal components)
- Installation specifications (mounting height, location, clearances)
- Configuration requirements (spare capacity, accessories, labeling)
- Safety features (emergency buttons, interlocks, grounding)

For EACH requirement found, provide:
1. requirement_category: One of "design", "construction", "installation", "configuration", "safety", "accessibility"
2. requirement_text: The complete original sentence
3. applies_to: What component/product this applies to (if mentioned, otherwise null)
4. is_mandatory: 1 if uses "shall/must", 0 if uses "should/recommended"

Return ONLY a valid JSON array. If no design requirements found, return empty array [].

Text to analyze:
---
${text}
---

JSON output:`;

  const response = await aiClient.complete(prompt);
  const extracted = parseAIResponse(response);
  
  return extracted.map(req => ({
    sectionId: context.sectionId,
    chunkId: context.chunkId,
    requirementCategory: req.requirement_category,
    requirementText: req.requirement_text,
    appliesTo: req.applies_to,
    isMandatory: req.is_mandatory ?? 1,
  }));
}

/**
 * Extract testing and acceptance requirements
 */
export async function extractTestingRequirements(text, context, aiClient) {
  const prompt = `Analyze the following technical specification text and extract ALL testing and acceptance requirements.

A testing/acceptance requirement is any statement about:
- Factory acceptance tests (FAT)
- Site acceptance tests (SAT)
- Type testing requirements
- Routine testing requirements
- Inspection requirements
- Documentation and deliverables
- Training requirements
- Warranty and spare parts

For EACH requirement found, provide:
1. test_type: One of "FAT", "SAT", "type_test", "routine_test", "inspection", "documentation", "training", "warranty"
2. requirement_text: The complete original sentence
3. applies_to: What component/product this applies to (if mentioned, otherwise null)
4. is_mandatory: 1 if uses "shall/must", 0 if uses "should/recommended"

Return ONLY a valid JSON array. If no testing requirements found, return empty array [].

Text to analyze:
---
${text}
---

JSON output:`;

  const response = await aiClient.complete(prompt);
  const extracted = parseAIResponse(response);
  
  return extracted.map(req => ({
    sectionId: context.sectionId,
    chunkId: context.chunkId,
    testType: req.test_type,
    requirementText: req.requirement_text,
    appliesTo: req.applies_to,
    isMandatory: req.is_mandatory ?? 1,
  }));
}

/**
 * Parse AI response and handle errors
 */
function parseAIResponse(response) {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      [null, response];
    const jsonStr = jsonMatch[1] || response;
    const parsed = JSON.parse(jsonStr.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse AI response:', error.message);
    console.error('Response was:', response);
    return [];
  }
}

/**
 * Process a single chunk through all extractors
 */
export async function processChunk(chunk, aiClient) {
  const context = {
    sectionId: chunk.section_id,
    chunkId: chunk.id,
    partNo: chunk.part_no,
  };

  const results = {
    compliance: [],
    technical: [],
    design: [],
    testing: [],
  };

  try {
    // Run all extractors in parallel for efficiency
    const [compliance, technical, design, testing] = await Promise.all([
      extractComplianceRequirements(chunk.text, context, aiClient),
      extractTechnicalSpecs(chunk.text, context, aiClient),
      extractDesignRequirements(chunk.text, context, aiClient),
      extractTestingRequirements(chunk.text, context, aiClient),
    ]);

    results.compliance = compliance;
    results.technical = technical;
    results.design = design;
    results.testing = testing;

    return results;
  } catch (error) {
    console.error(`Error processing chunk ${chunk.id}:`, error);
    throw error;
  }
}

/**
 * Batch process multiple chunks
 */
export async function batchProcessChunks(chunks, aiClient, options = {}) {
  const {
    concurrency = 3,
    onProgress = null,
    onError = null,
  } = options;

  const results = [];
  const errors = [];

  // Process in batches to control concurrency
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const promises = batch.map(async chunk => {
      try {
        const result = await processChunk(chunk, aiClient);
        if (onProgress) {
          onProgress({ chunk, result, processed: i + 1, total: chunks.length });
        }
        return { chunk, result, error: null };
      } catch (error) {
        if (onError) {
          onError({ chunk, error });
        }
        return { chunk, result: null, error };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  return { results, errors };
}
