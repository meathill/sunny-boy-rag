/**
 * AI client interface and implementations
 * Supports multiple AI providers (OpenAI, Anthropic, local models, etc.)
 */

/**
 * Base AI client interface
 */
export class AIClient {
  async complete(prompt, options = {}) {
    throw new Error('Not implemented');
  }
}

/**
 * OpenAI client implementation
 */
export class OpenAIClient extends AIClient {
  constructor(apiKey, model = 'gpt-4-turbo-preview') {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://api.openai.com/v1';
  }

  async complete(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a technical specification analyzer. Extract structured data from technical documents and return ONLY valid JSON responses.' },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 4000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

/**
 * Anthropic Claude client implementation
 */
export class AnthropicClient extends AIClient {
  constructor(apiKey, model = 'claude-3-sonnet-20240229') {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://api.anthropic.com/v1';
  }

  async complete(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 4000,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature ?? 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }
}

/**
 * Mock AI client for testing
 * Returns deterministic responses based on input patterns
 */
export class MockAIClient extends AIClient {
  async complete(prompt, options = {}) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Analyze prompt to determine what to extract
    if (prompt.includes('standard compliance requirements')) {
      return this.mockComplianceResponse(prompt);
    } else if (prompt.includes('technical specifications')) {
      return this.mockTechnicalResponse(prompt);
    } else if (prompt.includes('design and installation requirements')) {
      return this.mockDesignResponse(prompt);
    } else if (prompt.includes('testing and acceptance requirements')) {
      return this.mockTestingResponse(prompt);
    }

    return '[]';
  }

  mockComplianceResponse(prompt) {
    // Extract text between --- markers
    const textMatch = prompt.match(/---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return '[]';
    
    const text = textMatch[1];
    const results = [];

    // Look for standard references
    const standardPatterns = [
      /IEC\s+\d+[-\d]*/gi,
      /BS\s+(?:EN\s+)?\d+[-\d]*/gi,
      /EN\s+\d+[-\d]*/gi,
      /ISO\s+\d+/gi,
      /ASTM\s+[A-Z]\d+/gi,
    ];

    standardPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const stdRef = match[0];
        // Find the sentence containing this standard
        const sentences = text.split(/[.!?]+/);
        const sentence = sentences.find(s => s.includes(stdRef));
        if (sentence) {
          results.push({
            std_ref_id: stdRef,
            requirement_text: sentence.trim(),
            applies_to: null,
            is_mandatory: sentence.includes('shall') ? 1 : 0,
            requirement_type: 'standard_compliance',
          });
        }
      }
    });

    return JSON.stringify(results);
  }

  mockTechnicalResponse(prompt) {
    const textMatch = prompt.match(/---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return '[]';
    
    const text = textMatch[1];
    const results = [];

    // Look for voltage specs
    const voltageMatch = text.match(/(\d+)V/);
    if (voltageMatch) {
      results.push({
        spec_category: 'electrical',
        parameter_name: 'voltage',
        value: voltageMatch[1],
        unit: 'V',
        test_standard: null,
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(voltageMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    // Look for temperature specs
    const tempMatch = text.match(/(\d+)°C/);
    if (tempMatch) {
      results.push({
        spec_category: 'environmental',
        parameter_name: 'temperature',
        value: tempMatch[1],
        unit: '°C',
        test_standard: null,
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(tempMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    // Look for IP ratings
    const ipMatch = text.match(/IP\s*(\d+)/);
    if (ipMatch) {
      results.push({
        spec_category: 'protection',
        parameter_name: 'IP_rating',
        value: `IP${ipMatch[1]}`,
        unit: null,
        test_standard: 'IEC 60529',
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(ipMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    // Look for IK ratings
    const ikMatch = text.match(/IK\s*(\d+)/);
    if (ikMatch) {
      results.push({
        spec_category: 'protection',
        parameter_name: 'IK_rating',
        value: `IK${ikMatch[1]}`,
        unit: null,
        test_standard: 'IEC 62262',
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(ikMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    return JSON.stringify(results);
  }

  mockDesignResponse(prompt) {
    const textMatch = prompt.match(/---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return '[]';
    
    const text = textMatch[1];
    const results = [];

    // Look for installation requirements
    if (text.match(/mount|install|height/i)) {
      const sentences = text.split(/[.!?]+/);
      sentences.forEach(sentence => {
        if (sentence.match(/shall.*mount|shall.*install|height/i)) {
          results.push({
            requirement_category: 'installation',
            requirement_text: sentence.trim(),
            applies_to: null,
            is_mandatory: sentence.includes('shall') ? 1 : 0,
          });
        }
      });
    }

    return JSON.stringify(results);
  }

  mockTestingResponse(prompt) {
    const textMatch = prompt.match(/---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return '[]';
    
    const text = textMatch[1];
    const results = [];

    // Look for test requirements
    const testPatterns = [
      { pattern: /FAT/i, type: 'FAT' },
      { pattern: /SAT/i, type: 'SAT' },
      { pattern: /type test/i, type: 'type_test' },
      { pattern: /routine test/i, type: 'routine_test' },
    ];

    testPatterns.forEach(({ pattern, type }) => {
      if (text.match(pattern)) {
        const sentences = text.split(/[.!?]+/);
        const sentence = sentences.find(s => s.match(pattern));
        if (sentence) {
          results.push({
            test_type: type,
            requirement_text: sentence.trim(),
            applies_to: null,
            is_mandatory: sentence.includes('shall') ? 1 : 0,
          });
        }
      }
    });

    return JSON.stringify(results);
  }
}

/**
 * Factory function to create AI client based on environment
 */
export function createAIClient(options = {}) {
  const {
    provider = process.env.AI_PROVIDER || 'mock',
    apiKey = process.env.AI_API_KEY,
    model = process.env.AI_MODEL,
  } = options;

  switch (provider.toLowerCase()) {
    case 'openai':
      if (!apiKey) throw new Error('OpenAI API key required');
      return new OpenAIClient(apiKey, model);
    
    case 'anthropic':
    case 'claude':
      if (!apiKey) throw new Error('Anthropic API key required');
      return new AnthropicClient(apiKey, model);
    
    case 'mock':
    default:
      return new MockAIClient();
  }
}
