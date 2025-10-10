import fs from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

function isPdf(buffer) {
  return buffer && buffer.length >= 4 && buffer.slice(0, 4).toString('utf8') === '%PDF';
}

function stripHeadersFooters(textByPage) {
  const first = new Map();
  const last = new Map();
  const pages = textByPage.map(t => (t || '').split(/\r?\n/));
  for (const lines of pages) {
    if (lines.length === 0) continue;
    const a = lines[0]?.trim();
    const b = lines[lines.length - 1]?.trim();
    if (a) first.set(a, (first.get(a) || 0) + 1);
    if (b) last.set(b, (last.get(b) || 0) + 1);
  }
  const n = pages.length || 1;
  const header = [...first.entries()].find(([k, c]) => c >= 2 && c / n >= 0.3)?.[0];
  const footer = [...last.entries()].find(([k, c]) => c >= 2 && c / n >= 0.3)?.[0];
  const pageFooterRe = /^\s*Pages?:\s*\d+\s+of\s+\d+\s*$/i;
  return pages.map(lines => {
    if (header && lines[0]?.trim() === header) lines = lines.slice(1);
    // Trim ending page count line (common case)
    const last = lines[lines.length - 1]?.trim();
    if (footer && last === footer) lines = lines.slice(0, -1);
    else if (pageFooterRe.test(last || '')) lines = lines.slice(0, -1);
    let raw = lines.join('\n');
    // Remove footer block: 'DMBLP - RTA - N0001 ... Pages?: X of Y' only when at end of page
    const footerBlockRe = /(?:^|\n)\s*DMBLP\s*-\s*RTA\s*-\s*N0001[\s\S]*?Pages?:\s*\d+\s*of\s*\d+\s*(?:$|\n)/i;
    const cleaned = raw.replace(footerBlockRe, '').trim();
    if (cleaned.length === 0 && raw.length > 50) {
      // avoid catastrophic removal; fallback to only last-line trimming
      return raw.trim();
    }
    return cleaned;
  });
}

async function parsePdfBuffer(buffer, opts = {}) {
  if (!isPdf(buffer)) {
    return { meta: { pageCount: 1 }, textByPage: [buffer.toString('utf8')] };
  }

  // Ensure pure Uint8Array (pdfjs rejects Buffer subclass)
  const data = Buffer.isBuffer(buffer) ? Uint8Array.from(buffer) : (buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));

  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;
  const textByPage = [];

  const maxPages = Math.min(pageCount, opts.maxPages || pageCount);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items) {
      pageText += item.str;
      // @ts-ignore pdfjs text item sometimes has hasEOL
      pageText += item.hasEOL ? '\n' : ' ';
    }
    textByPage.push(pageText.trim());
  }

  return { meta: { pageCount }, textByPage: stripHeadersFooters(textByPage) };
}

export async function parsePdf(input, opts = {}) {
  const buffer = typeof input === 'string' ? await fs.readFile(input) : input;
  return parsePdfBuffer(buffer, opts);
}
