/**
 * AI client interface and implementations
 * Using Vercel AI SDK with Gateway support
 * Supports multiple AI providers (OpenAI, Anthropic, etc.)
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

/**
 * Base AI client interface
 */
export class AIClient {
  async generateStructured(prompt, schema, options = {}) {
    return { items: [] };
  }
}

/**
 * Vercel AI SDK client with Gateway support
 * Supports OpenAI and Anthropic through unified interface
 */
export class VercelAIClient extends AIClient {
  #model;

  constructor(config = {}) {
    super();

    const {
      provider = 'openai',
      model = null,
    } = config;

    switch (provider) {
      case 'openai': this.#model = openai(model); break;
      case 'anthropic': this.#model = anthropic(model); break;
      case 'google': this.#model = google(model); break;
      default: this.#model = openai('gpt-5');
    }
  }

  async generateStructured(prompt, schema, options = {}) {
    try {
      const { object } = await generateObject({
        model: this.#model,
        schema,
        system: 'You are a technical specification analyzer. Extract structured data from technical documents accurately.',
        prompt,
      });
      return object;
    } catch (error) {
      throw new Error(`AI API error: ${error.message}`);
    }
  }
}

export class MockAIClient extends AIClient {
  async generateStructured(prompt, schema, options = {}) {
    await new Promise(resolve => setTimeout(resolve, 100));

    if (prompt.includes('standard compliance requirements')) {
      return this.mockComplianceResponse(prompt);
    } else if (prompt.includes('technical specifications')) {
      return this.mockTechnicalResponse(prompt);
    } else if (prompt.includes('design and installation requirements')) {
      return this.mockDesignResponse(prompt);
    } else if (prompt.includes('testing and acceptance requirements')) {
      return this.mockTestingResponse(prompt);
    }

    return { items: [] };
  }

  mockComplianceResponse(prompt) {
    const textMatch = prompt.match(/Text to analyze:\s*---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return { items: [] };

    const text = textMatch[1];
    const items = [];

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
        const sentences = text.split(/[.!?]+/);
        const sentence = sentences.find(s => s.includes(stdRef));
        if (sentence) {
          items.push({
            std_ref_id: stdRef,
            requirement_text: sentence.trim(),
            applies_to: null,
            is_mandatory: sentence.includes('shall') ? 1 : 0,
            requirement_type: 'standard_compliance',
          });
        }
      }
    });

    return { items };
  }

  mockTechnicalResponse(prompt) {
    const textMatch = prompt.match(/Text to analyze:\s*---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return { items: [] };

    const text = textMatch[1];
    const items = [];

    const voltageMatch = text.match(/(\d+)V/);
    if (voltageMatch) {
      items.push({
        spec_category: 'electrical',
        parameter_name: 'voltage',
        value: voltageMatch[1],
        unit: 'V',
        test_standard: null,
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(voltageMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    const tempMatch = text.match(/(\d+)°C/);
    if (tempMatch) {
      items.push({
        spec_category: 'environmental',
        parameter_name: 'temperature',
        value: tempMatch[1],
        unit: '°C',
        test_standard: null,
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(tempMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    const ipMatch = text.match(/IP\s*(\d+)/);
    if (ipMatch) {
      items.push({
        spec_category: 'protection',
        parameter_name: 'IP_rating',
        value: `IP${ipMatch[1]}`,
        unit: null,
        test_standard: 'IEC 60529',
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(ipMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    const ikMatch = text.match(/IK\s*(\d+)/);
    if (ikMatch) {
      items.push({
        spec_category: 'protection',
        parameter_name: 'IK_rating',
        value: `IK${ikMatch[1]}`,
        unit: null,
        test_standard: 'IEC 62262',
        requirement_text: text.split(/[.!?]+/).find(s => s.includes(ikMatch[0]))?.trim() || '',
        applies_to: null,
      });
    }

    return { items };
  }

  mockDesignResponse(prompt) {
    const textMatch = prompt.match(/Text to analyze:\s*---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return { items: [] };

    const text = textMatch[1];
    const items = [];

    if (text.match(/mount|install|height/i)) {
      const sentences = text.split(/[.!?]+/);
      sentences.forEach(sentence => {
        if (sentence.match(/shall.*mount|shall.*install|height/i)) {
          items.push({
            requirement_category: 'installation',
            requirement_text: sentence.trim(),
            applies_to: null,
            is_mandatory: sentence.includes('shall') ? 1 : 0,
          });
        }
      });
    }

    return { items };
  }

  mockTestingResponse(prompt) {
    const textMatch = prompt.match(/Text to analyze:\s*---\s*([\s\S]*?)\s*---/);
    if (!textMatch) return { items: [] };

    const text = textMatch[1];
    const items = [];

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
          items.push({
            test_type: type,
            requirement_text: sentence.trim(),
            applies_to: null,
            is_mandatory: sentence.includes('shall') ? 1 : 0,
          });
        }
      }
    });

    return { items };
  }
}

/**
 * Factory function to create AI client based on environment
 */
export function createAIClient(options = {}) {
  const {
    provider = process.env.AI_PROVIDER || 'mock',
    model = process.env.AI_MODEL,
  } = options;

  switch (provider.toLowerCase()) {
    case 'openai':
      return new VercelAIClient({
        provider: 'openai',
        model,
      });

    case 'anthropic':
    case 'claude':
      return new VercelAIClient({
        provider: 'anthropic',
        model,
      });

    case 'google':
    case 'gemini':
      return new VercelAIClient({
        provider: 'google',
        model,
      });

    case 'mock':
    default:
      return new MockAIClient();
  }
}
