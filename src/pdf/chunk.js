import crypto from 'node:crypto';

function hash(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 10);
}

export function chunkSections(sections, opts = {}) {
  const {
    maxChars = 4000, minChars = 1500, overlap = 200, sourceId = 'unknown'
  } = opts;

  const chunks = [];
  for (const sec of sections) {
    const text = sec.text.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length <= maxChars) {
      chunks.push({
        id: `ch: ${hash(`${sourceId}:${sec.id}:${text.slice(0, 64)}`)}`,
        sourceId,
        sectionId: sec.id,
        title: sec.title,
        startPage: sec.startPage,
        endPage: sec.endPage,
        text,
      })
      continue;
    }

    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + maxChars, text.length);
      const slice = text.slice(i, end);

      if (slice.length < minChars && chunks.length > 0) {
        chunks[chunks.length - 1].text += '\n' + slice;
        break;
      }

      chunks.push({
        id: `ch:${hash(`${sourceId}:${sec.id}:${i}`)}`,
        sourceId,
        sectionId: sec.id,
        title: sec.title,
        startPage: sec.startPage,
        endPage: sec.endPage,
        text: slice
      });

      if (end === text.length) break;
      i = end - overlap;
      if (i < 0) i = 0;
    }

  }
  return chunks;
}
