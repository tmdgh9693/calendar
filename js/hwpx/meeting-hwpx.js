'use strict';
// 주간·월간 회의자료 HWPX 레이아웃
function bundledTemplateBuffer(key) {
  const base64 = window.BUNDLED_HWPX_TEMPLATES?.[key];
  if (!base64) throw new Error('내장 HWPX 양식 데이터를 찾지 못했습니다.');
  return b64ToBuf(base64);
}

async function loadBundledMeetingTemplateZip(type = 'weekly') {
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
  // 기존 양식의 줄 배치 정보가 남으면 새 문장이 작게 보이거나 잘릴 수 있으므로 제거합니다.
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

  // innerText는 display:none 상태(보관함 임시 영역 등)에서 빈 문자열이 될 수 있습니다.
  // textContent를 기본으로 사용하고, <br>은 줄바꿈으로 변환해 화면 표시 여부와 관계없이 읽습니다.
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
      // makeMeeting()/makeDeptMeetingCustom()이 만든 항목 구조를 우선 정확하게 읽습니다.
      const bold = current.querySelector('b');
      const detailNodes = Array.from(current.querySelectorAll('.indent, span'));
      const mainSource = bold ? meetingElementText(bold) : meetingElementText(current).split(/\n+/)[0];
      const main = normalizeMeetingLine(mainSource);

      let details = detailNodes
        .flatMap(node => meetingElementText(node).split(/\n+/))
        .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean);

      // 일반 문단이나 보관함에서 복원한 HTML도 처리합니다.
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
  // HWPX 문단 id가 중복되면 한글에서 추가 문단이 사라지거나 문서가 비정상적으로 열릴 수 있습니다.
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

    // 번호가 붙은 한 항목이 끝날 때마다 빈 문단을 한 줄 넣어 항목끼리 붙어 보이지 않게 합니다.
    // 마지막 항목 뒤에도 여백을 유지해 다음 구역 제목과 자연스럽게 구분합니다.
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

  // 사용자가 보내준 원본 양식에서 제목·보조문장 스타일을 각각 찾아 그대로 복제합니다.
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

  // secPr 문단은 양식의 첫 문단에 있으므로 그 앞에 계획을 넣으면 순서가 뒤집힙니다.
  // 두 번째 제목 뒤, 즉 본문 끝에 계획 항목을 순서대로 추가합니다.
  insertMeetingEntries(doc, parent, null, planEntries, mainTemplate, detailTemplate);

  return { xml: serializeHwpxXml(doc), applied: true };
}

