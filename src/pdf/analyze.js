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
  const re = /^\s*(\d{1,2}(?:\.\d{1,2}){0,2})\b\s*(.*)$/;
  for (const p of parts) {
    const lines = p.text.split(/\r?\n/);
    const marks = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) marks.push({ index: i, code: m[1], title: (m[2]||'').trim() });
    }
    if (marks.length === 0) {
      items.push({ ...p, partNo: p.partNo, sectionLocal: null, level2Code: null, level3Code: null });
      continue;
    }
    for (let i = 0; i < marks.length; i++) {
      const cur = marks[i];
      const next = marks[i+1];
      const slice = lines.slice(cur.index + 1, next ? next.index : lines.length).join('\n').trim();
      const seg = { sectionId: p.sectionId, partNo: p.partNo, title: p.title, startPage: p.startPage, endPage: p.endPage, text: slice };
      const partsCode = cur.code.split('.');
      seg.level2Code = partsCode.length >= 2 ? partsCode.slice(0,2).join('.') : null;
      seg.level3Code = partsCode.length >= 3 ? partsCode.slice(0,3).join('.') : null;
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

export function buildSectionRelations(parts, sections) {
  const rels = [];
  const re = /\bSection\s+(\d+)\s+(\d+)\s+(\d+)\b/gi;
  const codeToId = new Map(sections.map(s => [s.section, s.id]));
  for (const p of parts) {
    if (p.partNo !== 1) continue;
    const subs = buildSubsections([p]);
    const sec12 = subs.find(it => it.level2Code === '1.2');
    const text = sec12 ? sec12.text : '';
    let m;
    while ((m = re.exec(text)) !== null) {
      const code = `${m[1]} ${m[2]} ${m[3]}`;
      const target = codeToId.get(code);
      if (target && target !== p.sectionId) rels.push({ sectionId: p.sectionId, relatedSectionId: target });
    }
  }
  return rels;
}
