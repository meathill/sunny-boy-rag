export function detectHeadings(textByPage) {
  const headings = [];
  const numberedRe = /^\s*(\d+(?:\.\d+){0,3})[.)]?\s+(.{2,80})$/;
  const sectionRe = /^\s*Section\s+(\d+)\s+(\d+)(?:\s+(\d+))?\s*(?:[-–]\s*(.+))?\s*$/i;
  textByPage.forEach((pageText, pageIndex) => {
    const lines = pageText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m2 = lines[i].match(sectionRe);
      if (m2) {
        const inlineTitle = (m2[4] || '').trim();
        const fallbackTitle = (lines[i+1] || '').trim();
        const title = inlineTitle || fallbackTitle;
        const code = [m2[1], m2[2], m2[3]].filter(Boolean).join(' ');
        headings.push({ kind: 'section', page: pageIndex + 1, line: i + 1, section: code, title });
        continue;
      }
      const m = lines[i].match(numberedRe);
      if (m) {
        headings.push({ kind: 'numbered', page: pageIndex + 1, line: i + 1, section: m[1], title: m[2].trim() });
      }
    }
  });
  return headings;
}

export function extractReferences(text) {
  const refs = [];
  const re = /\b([A-Z]{2,}-\d{2,}|[A-Z]{2,}\d{2,}|[A-Z]{2,}-\d{3,}[A-Z]?)\b/g;
  const norm = text.replace(/\s*-\s*/g, '-');
  let m;
  while ((m = re.exec(norm)) !== null) {
    refs.push({match: m[0], index: m.index});
  }
  return refs;
}

export function buildSections(textByPage) {
  const headings = detectHeadings(textByPage);
  const sections = [];

  const sectionHeadings = headings.filter(h => h.kind === 'section');
  const list = sectionHeadings.length ? sectionHeadings : headings.filter(h => h.kind === 'numbered');
  const sorted = [...list].sort((a, b) => a.page - b.page || a.line - b.line);

  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i];
    const next = sorted[i + 1];
    const startPage = h.page;
    const endPage = next ? Math.max(startPage, next.page) : textByPage.length;

    const parts = [];
    for (let p = startPage; p <= endPage; p++) {
      const lines = (textByPage[p - 1] || '').split(/\r?\n/);
      let from = 0;
      let to = lines.length;
      if (p === startPage) from = Math.max(0, (h.line || 1) - 1);
      if (next && p === next.page) to = Math.max(0, (next.line || 1) - 1);
      if (from < to) parts.push(lines.slice(from, to).join('\n'));
    }
    let text = parts.join('\n');
    // Trim trailing content at END OF SECTION ... marker if present
    const eos = /\n?\s*END OF SECTION\b[\s\S]*$/i;
    text = text.replace(eos, '').trimEnd();

    sections.push({
      id: h.section, // use literal section code 'X Y Z'
      title: h.title,
      section: h.section,
      startPage,
      endPage,
      text,
    })
  }

  if (sections.length === 0) {
    sections.push({
      id: 'sec:document',
      title: 'Document',
      section: '0',
      startPage: 1,
      endPage: textByPage.length,
      text: textByPage.join('\n')
    });
  }
  return sections;
}
export function buildParts(sections) {
  const parts = [];
  const partRe = /^\s*PART\s+([123])\.?\s*(?:[-–]\s*)?(GENERAL|PRODUCT|EXECUTION)?\s*$/i;
  const defaultTitles = { 1: 'GENERAL', 2: 'PRODUCT', 3: 'EXECUTION' };
  for (const sec of sections) {
    const lines = sec.text.split(/\r?\n/);
    const marks = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(partRe);
      if (m) marks.push({ index: i, no: Number(m[1]), title: (m[2] || defaultTitles[Number(m[1])]) });
    }
    if (marks.length === 0) {
      parts.push({ sectionId: sec.id, partNo: 1, title: defaultTitles[1], startPage: sec.startPage, endPage: sec.endPage, text: sec.text });
      continue;
    }
    for (let i = 0; i < marks.length; i++) {
      const cur = marks[i];
      const next = marks[i + 1];
      const slice = lines.slice(cur.index + 1, next ? next.index : lines.length).join('\n').trim();
      parts.push({ sectionId: sec.id, partNo: cur.no, title: cur.title, startPage: sec.startPage, endPage: sec.endPage, text: slice });
    }
  }
  return parts;
}

export function buildSubsections(parts) {
  const items = [];
  // Match up to 4 levels: X.Y.Z.W
  const re = /^\s*(\d{1,2}(?:\.\d{1,2}){0,3})\b\s*(.*)$/;

  // Check if any part has explicit PART markers (meaning it's a structured PDF)
  const hasExplicitParts = parts.some(p => {
    const lines = p.text.split(/\r?\n/);
    return lines.some(line => /^\s*PART\s+[123]/i.test(line));
  });

  for (const p of parts) {
    // Only filter Part 1 if we have explicitly marked Parts
    // Otherwise (simple text files), include everything
    if (hasExplicitParts && p.partNo < 2) continue;

    const lines = p.text.split(/\r?\n/);
    const marks = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) {
        // Clean title: remove leading dots, spaces, and trim
        const rawTitle = (m[2] || '').trim();
        const cleanTitle = rawTitle.replace(/^[\.\s]+/, '').trim();
        marks.push({ index: i, code: m[1], title: cleanTitle });
      }
    }
    if (marks.length === 0) {
      items.push({
        ...p,
        partNo: p.partNo,
        sectionLocal: null,
        level2Code: null,
        level3Code: null,
        level2Title: null,
        level3Title: null
      });
      continue;
    }

    // Only create chunks for level 3 headings (X.Y.Z) not level 4 (X.Y.Z.W)
    // Level 3 chunks should include all level 4 content beneath them
    const level3Marks = marks.filter(m => {
      const parts = m.code.split('.');
      return parts.length === 3;
    });

    // If no level 3 marks, fall back to all marks (for simple documents)
    const targetMarks = level3Marks.length > 0 ? level3Marks : marks;

    for (let i = 0; i < targetMarks.length; i++) {
      const cur = targetMarks[i];
      const next = targetMarks[i + 1];

      // Find the index range for this section (including all subsections)
      const startIdx = cur.index + 1;
      const endIdx = next ? next.index : lines.length;

      const slice = lines.slice(startIdx, endIdx).join('\n').trim();
      const seg = {
        sectionId: p.sectionId,
        partNo: p.partNo,
        startPage: p.startPage,
        endPage: p.endPage,
        text: slice
      };

      const partsCode = cur.code.split('.');
      seg.level2Code = partsCode.length >= 2 ? partsCode.slice(0,2).join('.') : null;
      seg.level3Code = partsCode.length >= 3 ? partsCode.slice(0,3).join('.') : null;

      // Find level2 title by looking for the matching level 2 heading
      seg.level2Title = null;
      if (seg.level2Code) {
        const level2Mark = marks.find(m => m.code === seg.level2Code);
        seg.level2Title = level2Mark ? level2Mark.title : null;
      }

      // Level3 title is from the current mark
      seg.level3Title = cur.title;

      // title should be the level3 title (most specific)
      seg.title = seg.level3Title || cur.title;

      items.push(seg);
    }
  }
  return items;
}

export function enrichSectionsForDb(sections, parts) {
  function sliceBy(startCode, endCode) {
    const reStart = new RegExp('^\\s*' + startCode.replace('.', '\\s*\\.\\s*') + '(?!\\d)\\b', 'm');
    const reEnd = endCode ? new RegExp('^\\s*' + endCode.replace('.', '\\s*\\.\\s*') + '(?!\\d)\\b', 'm') : null;
    const reNextPart = /^\s*PART\s+2\b[\s\S]*/m;
    const reEndOfSec = /\n?\s*END OF SECTION\b[\s\S]*$/i;
    return (txt) => {
      const s = txt || '';
      const ms = s.match(reStart);
      if (!ms || ms.index === undefined) return null;
      const start = ms.index;
      let end = s.length;
      const tail = s.slice(start + 1);
      const candidates = [];
      if (reEnd) {
        const me = tail.match(reEnd);
        if (me && me.index !== undefined) candidates.push(start + 1 + me.index);
      }
      const mp = tail.match(reNextPart);
      if (mp && mp.index !== undefined) candidates.push(start + 1 + mp.index);
      const meos = s.match(reEndOfSec);
      if (meos && meos.index !== undefined) candidates.push(meos.index);
      if (candidates.length) end = Math.min(...candidates.filter(i => i > start));
      return s.slice(start, end).trimEnd();
    };
  }

  const pMap = new Map();
  const re12 = /^\s*1\s*\.\s*2(?!\d)(?:\s*[\.\-–])?\s+/m;
  for (const p of parts) {
    if (p.partNo !== 1) continue;
    const subs = buildSubsections([p]);
    // overview = content before 1.2 heading within Part 1
    let overview = p.text || '';
    const m = overview.match(re12);
    if (m && m.index !== undefined) {
      overview = overview.slice(0, m.index).trimEnd();
    }
    const bucket = { overview: overview || null, p14: null, p15: null, p17: null, p18: null };
    const pick14 = sliceBy('1.4', '1.5');
    const pick15 = sliceBy('1.5', '1.6');
    const pick17 = sliceBy('1.7', '1.8');
    const pick18 = sliceBy('1.8', '1.9');
    bucket.p14 = pick14(p.text);
    bucket.p15 = pick15(p.text);
    bucket.p17 = pick17(p.text);
    bucket.p18 = pick18(p.text);
    // fallback by parsed subsections if direct slice missed
    for (const it of subs) {
      if (!bucket.p14 && it.level2Code === '1.4') bucket.p14 = it.text;
      if (!bucket.p15 && it.level2Code === '1.5') bucket.p15 = it.text;
      if (!bucket.p17 && it.level2Code === '1.7') bucket.p17 = it.text;
      if (!bucket.p18 && it.level2Code === '1.8') bucket.p18 = it.text;
    }
    pMap.set(p.sectionId, bucket);
  }
  return sections.map(s => ({
    id: s.id,
    sourceId: s.sourceId,
    title: s.title,
    startPage: s.startPage,
    endPage: s.endPage,
    section: s.section,
    ...(pMap.get(s.id) ?? { overview: s.text || null, p14: null, p15: null, p17: null, p18: null }),
  }));
}


export function buildStdRefs(parts) {
  const refs = new Map();
  const relations = [];
  const slice = (txt, start, end) => {
    const s = txt || '';
    const startRe = new RegExp('^\\s*' + start.replace('.', '\\s*\\.\\s*') + '(?!\\d)\\b', 'm');
    const ms = s.match(startRe);
    if (!ms || ms.index === undefined) return '';
    const sIdx = ms.index;
    const tail = s.slice(sIdx + 1);
    const ends = [];
    const endRe = end ? new RegExp('^\\s*' + end.replace('.', '\\s*\\.\\s*') + '(?!\\d)\\b', 'm') : null;
    if (endRe) { const me = tail.match(endRe); if (me && me.index !== undefined) ends.push(sIdx + 1 + me.index); }
    const mPart2 = tail.match(/^\\s*PART\\s+2\\b/m); if (mPart2 && mPart2.index !== undefined) ends.push(sIdx + 1 + mPart2.index);
    const mEos = s.match(/\\n?\\s*END OF SECTION\\b[\\s\\S]*$/i); if (mEos && mEos.index !== undefined) ends.push(mEos.index);
    const eIdx = ends.length ? Math.min(...ends.filter(i => i > sIdx)) : s.length;
    return s.slice(sIdx, eIdx).trim();
  };

  // Match line starting with standard ID, capture ID and optional title on same line
  // Support: IEC/EN prefix, DEWA Regulations, short codes like IEC 51
  // Also match lines with just ID and no title (title will be null)
  // Use [ \t]+ instead of \s+ to avoid matching newlines
  // Allow trailing colon after code (e.g., "IEC 337-2:") - strip it from ID
  const lineRe = /^([A-Z]+(?:[ \t]*\/[ \t]*[A-Z]+)*)[ \t]+(Regulations|[A-Z0-9][A-Z0-9\-\/: ]*(?:\d|Regulations)):?(?:[ \t]+([^\n]+))?$/gm;

  const normalize = (prefix, rest) => {
    if (!prefix) return rest.replace(/\s+/g, ' ').trim();
    const pfx = prefix.replace(/\s+/g, '').replace(/\//g, '/');
    let r = rest.replace(/\s*[–-]\s*/g, '-').replace(/\s+/g, ' ').trim();
    r = r.replace(/\s*-\s*/g, '-').replace(/\s*\/\s*/g, '/');
    return `${pfx} ${r}`;
  };

  for (const p of parts) {
    if (p.partNo !== 1) continue;
    let block = slice(p.text || '', '1.3', '1.4');
    if (!block) continue;

    // Handle multi-standard lines like "IEC 60947-2 / \n BS EN 60898-2 ..."
    // The line with "/" has no title, but shares title with next line
    const lines = block.split('\n');
    const sharedTitleMap = new Map(); // lineIdx => title from next line

    // First pass: identify lines ending with "/" and extract next line's title
    for (let i = 0; i < lines.length - 1; i++) {
      if (/\/\s*$/.test(lines[i])) {
        // Remove slash from current line
        lines[i] = lines[i].replace(/\s*\/\s*$/, '');
        // Extract title from next line if it matches pattern
        const nextLine = lines[i + 1];
        const m = nextLine.match(/^[A-Z]+(?:[ \t]*\/[ \t]*[A-Z]+)*[ \t]+(?:Regulations|[A-Z0-9][A-Z0-9\-\/: ]*(?:\d|Regulations)):?(?:[ \t]+([^\n]+))?$/);
        if (m && m[1]) {
          sharedTitleMap.set(i, m[1].trim());
        }
      }
    }

    block = lines.join('\n');

    const seen = new Set();
    let m;
    lineRe.lastIndex = 0;
    let currentLineIdx = 0;
    let lastMatchEnd = 0;

    while ((m = lineRe.exec(block)) !== null) {
      // Calculate which line this match is on
      const textBefore = block.slice(lastMatchEnd, m.index);
      currentLineIdx += (textBefore.match(/\n/g) || []).length;

      const prefix = m[1];
      const code = m[2];
      let title = m[3] ? m[3].trim() : null;

      // Check if this line should use shared title
      if (!title && sharedTitleMap.has(currentLineIdx)) {
        title = sharedTitleMap.get(currentLineIdx);
      }

      const id = normalize(prefix, code);
      if (!refs.has(id)) refs.set(id, { id, title });
      if (!seen.has(id)) {
        relations.push({ sectionId: p.sectionId, referenceId: id });
        seen.add(id);
      }

      lastMatchEnd = m.index + m[0].length;
    }
  }
  return { stdRefs: Array.from(refs.values()), relations };
}

export function buildSectionRelations(parts) {
  const rels = [];
  const re = /\bSection\s+(\d+)\s+(\d+)\s+(\d+)\b/gi;
  for (const p of parts) {
    if (p.partNo !== 1) continue;
    const s = p.text || '';
    const mStart = s.match(/^\s*1\s*\.\s*2(?!\d)\b/m);
    if (!mStart || mStart.index === undefined) continue;
    const start = mStart.index;
    const tail = s.slice(start + 1);
    const candidates = [];
    const mNext = tail.match(/^\s*1\s*\.\s*3(?!\d)\b/m);
    if (mNext && mNext.index !== undefined) candidates.push(start + 1 + mNext.index);
    const mPart2 = tail.match(/^\s*PART\s+2\b/m);
    if (mPart2 && mPart2.index !== undefined) candidates.push(start + 1 + mPart2.index);
    const mEos = s.match(/\n?\s*END OF SECTION\b[\s\S]*$/i);
    if (mEos && mEos.index !== undefined) candidates.push(mEos.index);
    const end = candidates.length ? Math.min(...candidates.filter(i => i > start)) : s.length;
    const text = s.slice(start, end);

    let m;
    while ((m = re.exec(text)) !== null) {
      const code = `${m[1]} ${m[2]} ${m[3]}`;
      if (code !== p.sectionId) rels.push({ sectionId: p.sectionId, relatedSectionId: code });
    }
  }
  // dedupe
  const uniq = new Set();
  return rels.filter(r => {
    const k = r.sectionId + '->' + r.relatedSectionId;
    if (uniq.has(k)) return false;
    uniq.add(k);
    return true;
  });
}

export function buildDefinitions(parts) {
  const defs = new Map();
  const relations = [];

  const slice = (txt, start, end) => {
    const s = txt || '';
    const startRe = new RegExp('^\\s*' + start.replace('.', '\\s*\\.\\s*') + '(?!\\d)\\b', 'm');
    const ms = s.match(startRe);
    if (!ms || ms.index === undefined) return '';
    const sIdx = ms.index;
    const tail = s.slice(sIdx + 1);
    const ends = [];
    const endRe = end ? new RegExp('^\\s*' + end.replace('.', '\\s*\\.\\s*') + '(?!\\d)\\b', 'm') : null;
    if (endRe) { const me = tail.match(endRe); if (me && me.index !== undefined) ends.push(sIdx + 1 + me.index); }
    const mPart2 = tail.match(/^\s*PART\s+2\b/m); if (mPart2 && mPart2.index !== undefined) ends.push(sIdx + 1 + mPart2.index);
    const mEos = s.match(/\n?\s*END OF SECTION\b[\s\S]*$/i); if (mEos && mEos.index !== undefined) ends.push(mEos.index);
    const eIdx = ends.length ? Math.min(...ends.filter(i => i > sIdx)) : s.length;
    return s.slice(sIdx, eIdx).trim();
  };

  // Helper: does token look like an abbreviation?
  // Abbreviations are typically: all uppercase, or contain (MV), or short AND uppercase
  const isAbbrToken = (token) => {
    if (/^\([A-Z]+\)$/.test(token)) return true; // (MV), (LV), etc.
    if (token.length <= 3 && /^[A-Z]+$/.test(token)) return true; // ETP, Cu, etc. (short AND uppercase)
    if (token.length > 3 && /^[A-Z]+$/.test(token)) return true; // KEMA, etc. (longer all-uppercase)
    return false;
  };

  // Match lines with format: ABBREVIATION   Definition text
  // All tokens separated by 3+ spaces in PDF
  // Special case: "O - C - O" has space-hyphen-space within, treat as single token
  // Strategy:
  //   - First token is always part of abbreviation, may contain " - " pattern
  //   - Second token is part of abbreviation IF it looks like one (short, uppercase, or has parens)
  //   - Otherwise, second token starts the definition
  // Definition must have at least 2 words
  // Token pattern: allows "X - Y - Z" format by matching sequences of chars separated by " - "
  const lineRe = /^([A-Za-z][A-Za-z0-9\/\-\(\)]*(?:\s+-\s+[A-Za-z0-9\/\-\(\)]+)*)(?:\s{3,}([A-Za-z0-9\/\-\(\)]+(?:\s+-\s+[A-Za-z0-9\/\-\(\)]+)*))?\s{3,}(.+?)$/gm;

  for (const p of parts) {
    if (p.partNo !== 1) continue;
    let block = slice(p.text || '', '1.6', '1.7');
    if (!block) continue;

    const seen = new Set();
    let m;
    lineRe.lastIndex = 0;

    while ((m = lineRe.exec(block)) !== null) {
      const token1 = m[1].trim();
      const token2 = m[2] ? m[2].trim() : '';
      let restText = m[3].trim();

      let abbr;
      let definition;

      if (token2 && isAbbrToken(token2)) {
        // token2 is part of abbreviation
        abbr = `${token1} ${token2}`;
        definition = restText;
      } else if (token2) {
        // token2 is start of definition
        abbr = token1;
        definition = `${token2}   ${restText}`;
      } else {
        // no token2, just token1 and definition
        abbr = token1;
        definition = restText;
      }

      // Normalize definition spacing
      definition = definition.replace(/\s+/g, ' ');

      if (!defs.has(abbr)) {
        defs.set(abbr, { id: abbr, definition });
      }
      if (!seen.has(abbr)) {
        relations.push({ sectionId: p.sectionId, definitionId: abbr });
        seen.add(abbr);
      }
    }
  }

  return { definitions: Array.from(defs.values()), relations };
}
