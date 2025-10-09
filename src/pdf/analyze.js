export function detectHeadings(textByPage) {
  const headings = [];
  const headingRe = /^\s*(\d+(?:\.\d+){0,3})[.)]?\s+(.{2,80})$/;
  textByPage.forEach((pageText, pageIndex) => {
    const lines = pageText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(headingRe);
      if (m) {
        headings.push({ page: pageIndex + 1, line: i + 1, section: m[1], title: m[2].trim() });
        continue;
      }
      const m2 = lines[i].match(/^\s*Section\s+(\d+)(?:\s+(\d+))(?:\s+(\d+))?\s*$/i);
      if (m2) {
        const title = (lines[i+1] || '').trim();
        const code = [m2[1], m2[2], m2[3]].filter(Boolean).join('.');
        headings.push({ page: pageIndex + 1, line: i + 1, section: code, title });
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

  function sectionSortKey(s) {
    return s.section.split('.').map(n => Number(n));
  }

  const sorted = [...headings].sort((a, b) => {
    const A = sectionSortKey(a);
    const B = sectionSortKey(b);
    const len = Math.max(A.length, B.length);
    for (let i = 0; i < len; i++) {
      const ai = A[i] ?? 0;
      const bi = B[i] ?? 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  });

  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i];
    const next = sorted[i + 1];
    const startPage = h.page;
    const endPage = next ? Math.max(startPage, next.page) : textByPage.length;
    let text = textByPage.slice(startPage - 1, endPage).join('\n');
    // Trim trailing content at END OF SECTION ... marker if present
    const eos = /\n?\s*END OF SECTION\b[\s\S]*$/i;
    text = text.replace(eos, '').trimEnd();
    sections.push({
      id: `sec: ${h.section}, ${h.title}`,
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
  const partRe = /^\s*PART\s+(1|2|3)\s*[-–]\s*(GENERAL|PRODUCT|EXECUTION)?\s*$/i;
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

