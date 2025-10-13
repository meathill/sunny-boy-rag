import crypto from 'node:crypto';

function hash(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 10);
}

export function chunkSections(sections, opts = {}) {
  const {
    maxChars = 4000, minChars = 1500, sourceId = 'unknown'
  } = opts;

  const chunks = [];
  
  for (const sec of sections) {
    const text = sec.text.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length <= maxChars) {
      chunks.push({
        id: hash(`${sourceId}:${sec.sectionId}:${sec.level2Code}:${sec.level3Code}:${text.slice(0, 64)}`),
        sourceId,
        sectionId: sec.sectionId ?? sec.id,
        partNo: sec.partNo,
        level2Code: sec.level2Code ?? null,
        level3Code: sec.level3Code ?? null,
        level2Title: sec.level2Title ?? null,
        level3Title: sec.level3Title ?? null,
        title: sec.title,
        startPage: sec.startPage,
        endPage: sec.endPage,
        text,
      })
      continue;
    }

    // Section is longer than maxChars, need to split it
    // Split by level 4 subsections (X.Y.Z.W) to avoid breaking them
    const lines = text.split(/\r?\n/);
    const level4Re = /^\s*(\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,2})\b\s*(.*)$/;
    const subsectionMarks = [];
    
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(level4Re);
      if (m) {
        subsectionMarks.push({ lineIndex: i, code: m[1], title: m[2].trim() });
      }
    }
    
    // If no level 4 subsections found, fall back to character-based splitting
    if (subsectionMarks.length === 0) {
      let i = 0;
      while (i < text.length) {
        const end = Math.min(i + maxChars, text.length);
        const slice = text.slice(i, end);

        if (slice.length < minChars && chunks.length > 0) {
          chunks[chunks.length - 1].text += '\n' + slice;
          break;
        }

        chunks.push({
          id: hash(`${sourceId}:${sec.sectionId}:${sec.level2Code}:${sec.level3Code}:${i}`),
          sourceId,
          sectionId: sec.sectionId ?? sec.id,
          partNo: sec.partNo,
          level2Code: sec.level2Code ?? null,
          level3Code: sec.level3Code ?? null,
          level2Title: sec.level2Title ?? null,
          level3Title: sec.level3Title ?? null,
          title: sec.title,
          startPage: sec.startPage,
          endPage: sec.endPage,
          text: slice
        });

        if (end === text.length) break;
        i = end;
      }
      continue;
    }
    
    // Split at level 4 subsection boundaries, grouping them into chunks
    let currentChunkLines = [];
    let currentCharCount = 0;
    
    for (let i = 0; i < subsectionMarks.length; i++) {
      const cur = subsectionMarks[i];
      const next = subsectionMarks[i + 1];
      
      const startIdx = cur.lineIndex;
      const endIdx = next ? next.lineIndex : lines.length;
      const subsectionLines = lines.slice(startIdx, endIdx);
      const subsectionText = subsectionLines.join('\n');
      const subsectionLength = subsectionText.length;
      
      // If adding this subsection would exceed maxChars, save current chunk first
      if (currentChunkLines.length > 0 && currentCharCount + subsectionLength > maxChars) {
        const chunkText = currentChunkLines.join('\n').trim();
        chunks.push({
          id: hash(`${sourceId}:${sec.sectionId}:${sec.level2Code}:${sec.level3Code}:${chunks.length}`),
          sourceId,
          sectionId: sec.sectionId ?? sec.id,
          partNo: sec.partNo,
          level2Code: sec.level2Code ?? null,
          level3Code: sec.level3Code ?? null,
          level2Title: sec.level2Title ?? null,
          level3Title: sec.level3Title ?? null,
          title: sec.title,
          startPage: sec.startPage,
          endPage: sec.endPage,
          text: chunkText
        });
        
        currentChunkLines = [];
        currentCharCount = 0;
      }
      
      // Add current subsection to the chunk
      currentChunkLines.push(...subsectionLines);
      currentCharCount += subsectionLength;
    }
    
    // Save the last chunk
    if (currentChunkLines.length > 0) {
      const chunkText = currentChunkLines.join('\n').trim();
      chunks.push({
        id: hash(`${sourceId}:${sec.sectionId}:${sec.level2Code}:${sec.level3Code}:${chunks.length}`),
        sourceId,
        sectionId: sec.sectionId ?? sec.id,
        partNo: sec.partNo,
        level2Code: sec.level2Code ?? null,
        level3Code: sec.level3Code ?? null,
        level2Title: sec.level2Title ?? null,
        level3Title: sec.level3Title ?? null,
        title: sec.title,
        startPage: sec.startPage,
        endPage: sec.endPage,
        text: chunkText
      });
    }
  }
  return chunks;
}
