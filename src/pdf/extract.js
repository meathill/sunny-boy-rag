import fs from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

function isPdf(buffer) {
  return buffer && buffer.length >= 4 && buffer.slice(0, 4).toString('utf8') === '%PDF';
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

  return { meta: { pageCount }, textByPage };
}

export async function parsePdf(input, opts = {}) {
  const buffer = typeof input === 'string' ? await fs.readFile(input) : input;
  return parsePdfBuffer(buffer, opts);
}
