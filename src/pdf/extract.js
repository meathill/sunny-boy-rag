import fs from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

function isPdf(buffer) {
  return buffer && buffer.length >= 4 && buffer.slice(0, 4).toString('utf8') === '%PDF';
}

async function parsePdfBuffer(buffer) {
  if (!isPdf(buffer)) {
    return { meta: { pageCount: 1 }, textByPage: [buffer.toString('utf8')] };
  }

  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = doc.numPages;
  const textByPage = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items) {
      // Prefer adding line breaks when the engine hints an EOL
      pageText += item.str;
      // @ts-ignore pdfjs text item sometimes has hasEOL
      if (item.hasEOL) {
        pageText += '\n';
      } else {
        pageText += ' ';
      }
    }
    textByPage.push(pageText.trim());
  }

  return { meta: { pageCount }, textByPage };
}

export async function parsePdf(input) {
  const buffer = typeof input === 'string' ? await fs.readFile(input) : input;
  return parsePdfBuffer(buffer);
}
