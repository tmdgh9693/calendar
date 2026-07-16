'use strict';

function bundledTemplateBuffer(key) {
  const base64 = window.BUNDLED_HWPX_TEMPLATES?.[key];
  if (!base64) throw new Error('내장 HWPX 양식 데이터를 찾지 못했습니다.');
  return b64ToBuf(base64);
}

async function loadBundledMeetingTemplateZip(type = 'weekly') {
  await Promise.all([ensureJSZip(), ensureBundledHwpxTemplates()]);
  const key = type === 'monthly' ? 'meetingMonthly' : 'meetingWeekly';
  return JSZip.loadAsync(bundledTemplateBuffer(key));
}

function hwpxParagraphText(paragraph) {
  return Array.from(paragraph?.getElementsByTagNameNS(HWPX_NS.hp, 't') || [])
    .map(node => node.textContent || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function hwpxSetParagraphText(doc, paragraph, text, charPrIdOverride = '') {
  if (!paragraph) return;
  const charPrId = charPrIdOverride || hwpxCharPrId(paragraph);
  hwpxChildren(paragraph, HWPX_NS.hp, 'run').forEach(run => run.remove());

  hwpxChildren(paragraph, HWPX_NS.hp, 'linesegarray').forEach(node => node.remove());
  const run = doc.createElementNS(HWPX_NS.hp, 'hp:run');
  run.setAttribute('charPrIDRef', charPrId);
  const textEl = doc.createElementNS(HWPX_NS.hp, 'hp:t');
  String(text || '').split(/\r?\n/).forEach((line, index) => {
    if (index) textEl.appendChild(doc.createElementNS(HWPX_NS.hp, 'hp:lineBreak'));
    textEl.appendChild(doc.createTextNode(line));
  });
  run.appendChild(textEl);
  paragraph.appendChild(run);
  paragraph.setAttribute('dirty', '1');
}

function meetingCircledNumber(index) {
  const numbers = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  return numbers[index] || `${index + 1}.`;
}

function normalizeMeetingLine(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/^\s*[ㅇ○●•·]\s*/, '')
    .replace(/^\s*[①-⑳]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function meetingElementText(element) {
  if (!element) return '';


  const clone = element.cloneNode(true);
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return String(clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function meetingEntriesAfterHeading(report, headingIndex) {
  const headings = Array.from(report?.querySelectorAll('h2') || []);
  const heading = headings[headingIndex];
  if (!heading) return [{ main: '해당사항 없음', details: [] }];

  const entries = [];
  let current = heading.nextElementSibling;
  while (current && current.tagName !== 'H2') {
    if (current.matches?.('p')) {

      const bold = current.querySelector('b');
      const detailNodes = Array.from(current.querySelectorAll('.indent, span'));
      const mainSource = bold ? meetingElementText(bold) : meetingElementText(current).split(/\n+/)[0];
      const main = normalizeMeetingLine(mainSource);

      let details = detailNodes
        .flatMap(node => meetingElementText(node).split(/\n+/))
        .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean);

      if (!details.length) {
        const lines = meetingElementText(current).split(/\n+/).map(line => line.trim()).filter(Boolean);
        lines.shift();
        details = lines
          .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
          .filter(Boolean);
      }

      if (main) entries.push({ main, details });
    }
    current = current.nextElementSibling;
  }

  return entries.length ? entries : [{ main: '해당사항 없음', details: [] }];
}

function meetingItemsAfterHeading(report, headingIndex) {
  return meetingEntriesAfterHeading(report, headingIndex)
    .map((entry, index) => `${meetingCircledNumber(index)} ${entry.main}` +
      (entry.details.length ? `\n${entry.details.map(line => `- ${line}`).join('\n')}` : ''));
}

function findMeetingParagraphTemplate(paragraphs, matcher, fallback) {
  return paragraphs.find(paragraph => matcher(hwpxParagraphText(paragraph))) || fallback;
}

function prepareMeetingParagraphClone(paragraph) {
  const clone = paragraph.cloneNode(true);

  clone.setAttribute('id', hwpxNewId());
  clone.setAttribute('dirty', '1');
  return clone;
}

function insertMeetingEntries(doc, parent, beforeNode, entries, mainTemplate, detailTemplate) {
  entries.forEach((entry, index) => {
    const mainClone = prepareMeetingParagraphClone(mainTemplate);
    hwpxSetParagraphText(doc, mainClone, ` ${meetingCircledNumber(index)} ${entry.main}`);
    parent.insertBefore(mainClone, beforeNode);

    entry.details.forEach(detail => {
      const detailClone = prepareMeetingParagraphClone(detailTemplate);
      hwpxSetParagraphText(doc, detailClone, `  - ${detail}`);
      parent.insertBefore(detailClone, beforeNode);
    });


    const spacerClone = prepareMeetingParagraphClone(detailTemplate || mainTemplate);
    hwpxSetParagraphText(doc, spacerClone, ' ');
    spacerClone.setAttribute('pageBreak', '0');
    parent.insertBefore(spacerClone, beforeNode);
  });
}

function applyMeetingFormLayout(sectionXml, sourceId, options = {}) {
  const doc = parseHwpxXml(sectionXml, '회의자료');
  const report = $(sourceId);
  const type = options.meetingType || report?.dataset?.meetingType || $('mType')?.value || window.lastDeptMeetingType || 'weekly';
  const paragraphs = Array.from(doc.getElementsByTagNameNS(HWPX_NS.hp, 'p'));
  const firstHeading = paragraphs.find(p => /지난주 주요 성과|지난달 주요 성과/.test(hwpxParagraphText(p)));
  const secondHeading = paragraphs.find(p => /이번주 주요 계획|이번 달 주요 계획/.test(hwpxParagraphText(p)));
  if (!firstHeading || !secondHeading || firstHeading.parentNode !== secondHeading.parentNode) {
    return { xml: sectionXml, applied: false };
  }

  const department = report?.querySelector('h1')?.textContent?.trim() || $('mDept')?.value?.trim() || '항행정보시설과';
  const beforeFirst = paragraphs.slice(0, paragraphs.indexOf(firstHeading));
  const departmentP = [...beforeFirst].reverse().find(p => hwpxParagraphText(p));
  if (departmentP) hwpxSetParagraphText(doc, departmentP, department);

  hwpxSetParagraphText(doc, firstHeading, type === 'monthly' ? '󰊱 지난달 주요 성과' : '󰊱 지난주 주요 성과');
  hwpxSetParagraphText(doc, secondHeading, type === 'monthly' ? '󰊲 이번 달 주요 계획' : '󰊲 이번주 주요 계획');

  const parent = firstHeading.parentNode;
  const all = Array.from(parent.children);
  const firstIndex = all.indexOf(firstHeading);
  const secondIndex = all.indexOf(secondHeading);

  const mainTemplate = findMeetingParagraphTemplate(
    paragraphs,
    text => /^\s*[②-⑳]/.test(text),
    paragraphs.find(p => p.getAttribute('paraPrIDRef') === '26') || firstHeading
  );
  const detailTemplate = findMeetingParagraphTemplate(
    paragraphs,
    text => /^\s*-/.test(text),
    paragraphs.find(p => ['28', '31', '33', '35'].includes(p.getAttribute('paraPrIDRef'))) || mainTemplate
  );

  all.slice(firstIndex + 1, secondIndex).forEach(el => el.remove());
  const trailing = all.slice(secondIndex + 1);
  trailing.forEach(el => {
    if (el.namespaceURI === HWPX_NS.hp && el.localName === 'p' && !el.getElementsByTagNameNS(HWPX_NS.hp, 'secPr').length) {
      el.remove();
    }
  });

  const resultEntries = meetingEntriesAfterHeading(report, 0);
  const planEntries = meetingEntriesAfterHeading(report, 1);
  insertMeetingEntries(doc, parent, secondHeading, resultEntries, mainTemplate, detailTemplate);


  insertMeetingEntries(doc, parent, null, planEntries, mainTemplate, detailTemplate);

  return { xml: serializeHwpxXml(doc), applied: true };
}

