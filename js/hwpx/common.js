let jsZipLoadPromise = null;

function ensureJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (jsZipLoadPromise) return jsZipLoadPromise;

  jsZipLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/jszip.min.js';
    script.async = true;
    script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip 초기화 실패'));
    script.onerror = () => reject(new Error('JSZip 파일을 불러오지 못했습니다.'));
    document.head.appendChild(script);
  }).catch(error => {
    jsZipLoadPromise = null;
    throw error;
  });

  return jsZipLoadPromise;
}

'use strict';

function xmlTextEscape(text) {
  return String(text ?? '')
    .replace(/[&<>]/g, match => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    }[match]))
    .replace(/\r?\n/g, '<hp:lineBreak/>');
}

function stripHtmlText(id) {
  const target = $(id);

  if (!target) return [];

  return target.innerText
    .replace(/\u00a0/g, ' ')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function textAfterHeading(heading) {
  const lines = [];
  let current = heading?.nextElementSibling;

  while (current && current.tagName !== 'H2') {
    const text = String(current.innerText || '').trim();

    if (text) lines.push(text);

    current = current.nextElementSibling;
  }

  return lines.join('\n') || 'ㅇ 해당사항 없음';
}

function meetingHwpxParts(sourceId = 'meetingReport', forcedType = '') {
  const report = $(sourceId);
  const fallbackType = forcedType || report?.dataset?.meetingType || $('mType')?.value || window.lastDeptMeetingType || 'weekly';
  const fallbackHeadings = fallbackType === 'monthly'
    ? ['󰊱 지난달 주요 성과', '󰊲 이번 달 주요 계획']
    : ['󰊱 지난주 주요 성과', '󰊲 이번주 주요 계획'];

  if (!report) {
    return {
      department: $('mDept')?.value?.trim() || '항행정보시설과',
      basis: typeof periodInfo === 'function' ? periodInfo().label : '',
      headings: fallbackHeadings,
      bodies: Array(2).fill('① 해당사항 없음')
    };
  }

  const title = report.querySelector('h1')?.innerText?.trim() ||
    $('mDept')?.value?.trim() || '항행정보시설과';

  const firstParagraph = Array
    .from(report.querySelectorAll('p'))
    .find(p => String(p.innerText || '').trim().startsWith('작성기준:'));

  const basis = String(firstParagraph?.innerText || '')
    .replace(/^작성기준:\s*/, '')
    .trim() || (typeof periodInfo === 'function' ? periodInfo().label : '');

  const headingEls = Array.from(report.querySelectorAll('h2'));

  return {
    department: title,
    basis,
    headings: fallbackHeadings.map((fallback, index) =>
      headingEls[index]?.innerText?.trim() || fallback
    ),
    bodies: fallbackHeadings.map((_, index) =>
      textAfterHeading(headingEls[index])
    )
  };
}


function hwpxTripPeople() {
  const people = [];
  const mainRank = $('tRank')?.value.trim() || '';
  const mainName = $('tPerson')?.value.trim() || data.user || '';

  if (mainRank || mainName) {
    people.push({ rank: mainRank || '해양수산', name: mainName });
  }

  document.querySelectorAll('#tripPeopleList .trip-person-row').forEach(row => {
    const rank = row.querySelector('.trip-person-rank')?.value.trim() || '';
    const name = row.querySelector('.trip-person-name')?.value.trim() || '';
    if (rank || name) people.push({ rank, name });
  });

  return people;
}

function hwpxTripPeopleRanks() {
  return hwpxTripPeople().map(person => person.rank || '').join('\n');
}

function hwpxTripPeopleNames() {
  return hwpxTripPeople().map(person => person.name || '').filter(Boolean).join('\n');
}

function hwpxTripPeopleSignatures() {
  return hwpxTripPeople()
    .map(person => `성명  ${person.name || ''}  (인)`.trim())
    .join('\n');
}

function hwpxMap(kind, sourceId, options = {}) {
  const lines = stripHtmlText(sourceId);

  const map = {
    '{{본문}}': lines.join('\n'),
    '{{회의자료}}': lines.join('\n'),
    '{{제목}}': lines[0] || '',
    '{{작성일}}': kdate(today())
  };

  if (kind === 'meeting') {
    const meeting = meetingHwpxParts(sourceId, options.meetingType || '');

    map['{{부서명}}'] = meeting.department;
    map['{{작성기준}}'] = meeting.basis;
    map['{{실적제목}}'] = meeting.headings[0];
    map['{{계획제목}}'] = meeting.headings[1];
    map['{{현안제목}}'] = '';
    map['{{메모제목}}'] = '';
    map['{{금주실적}}'] = meeting.bodies[0];
    map['{{다음주계획}}'] = meeting.bodies[1];
    map['{{현안협조}}'] = '';
    map['{{추가메모}}'] = '';
  }

  if (kind === 'trip') {
    const tripDate = $('tDate')?.value || today();
    const reportDate = $('tReportDate')?.value || tripDate;

    const tripPeople = hwpxTripPeople();
    map['{{출장자}}'] = tripPeople.map(person => person.name).filter(Boolean).join('\n') || data.user || '';
    map['{{성명}}'] = tripPeople.map(person => person.name).filter(Boolean).join('\n') || data.user || '';
    map['{{출장자직급}}'] = tripPeople.map(person => person.rank).filter(Boolean).join('\n');
    map['{{출장자서명}}'] = hwpxTripPeopleSignatures();
    map['{{출장지}}'] = $('tPlace')?.value.trim() || '';
    map['{{출발}}'] = mdate(tripDate) + ' ' + timeText(
      $('tStartH')?.value || 9,
      $('tStartM')?.value || 0
    );
    map['{{귀청}}'] = mdate($('tEndDate')?.value || tripDate) + ' ' + timeText(
      $('tEndH')?.value || 18,
      $('tEndM')?.value || 0
    );
    map['{{복명}}'] = mdate(reportDate);
    map['{{복명일}}'] = kdate(reportDate);
    map['{{직급}}'] = hwpxTripPeopleRanks() || $('tRank')?.value.trim() || '';
    map['{{출장목적}}'] = $('tPurpose')?.value.trim() || 'ㅇ 해당사항 없음';
    map['{{수행상황}}'] = $('tBody')?.value.trim() || 'ㅇ 해당사항 없음';
    map['{{향후계획}}'] = $('tPlan')?.value.trim() || 'ㅇ 해당사항 없음';
    const hasTripPhotos = Array.isArray(photos) && photos.length > 0;
    map['{{붙임}}'] = hasTripPhotos ? `붙임  사진대지 ${Math.ceil(photos.length / 6)}부. 끝.` : '끝.';
  }

  return map;
}

function replacePlaceholders(xml, map) {
  let output = xml;

  for (const [key, value] of Object.entries(map)) {
    output = output.split(key).join(xmlTextEscape(value));
  }

  return output;
}

function compactHwpxLines(sourceId) {
  return stripHtmlText(sourceId)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 120);
}

function validateHwpxXml(xml, sectionName) {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');

  if (parsed.querySelector('parsererror')) {
    throw new Error(`${sectionName} XML 형식이 올바르지 않습니다.`);
  }
}


const HWPX_NS = {
  hp: 'http://www.hancom.co.kr/hwpml/2011/paragraph',
  hh: 'http://www.hancom.co.kr/hwpml/2011/head',
  hc: 'http://www.hancom.co.kr/hwpml/2011/core',
  opf: 'http://www.idpf.org/2007/opf/'
};

function parseHwpxXml(xml, label) {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) {
    throw new Error(`${label} XML 형식이 올바르지 않습니다.`);
  }
  return parsed;
}

function serializeHwpxXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

function hwpxChildren(element, namespace, localName) {
  return Array.from(element?.children || []).filter(child =>
    child.namespaceURI === namespace && child.localName === localName
  );
}

function hwpxFirstChild(element, namespace, localName) {
  return hwpxChildren(element, namespace, localName)[0] || null;
}

function hwpxCell(table, row, col) {
  return Array.from(table?.getElementsByTagNameNS(HWPX_NS.hp, 'tc') || []).find(cell => {
    const addr = hwpxFirstChild(cell, HWPX_NS.hp, 'cellAddr');
    return addr && Number(addr.getAttribute('rowAddr')) === row && Number(addr.getAttribute('colAddr')) === col;
  }) || null;
}

function hwpxEnsureParagraph(doc, cell) {
  let subList = hwpxFirstChild(cell, HWPX_NS.hp, 'subList');
  if (!subList) {
    subList = doc.createElementNS(HWPX_NS.hp, 'hp:subList');
    subList.setAttribute('id', '');
    subList.setAttribute('textDirection', 'HORIZONTAL');
    subList.setAttribute('lineWrap', 'BREAK');
    subList.setAttribute('vertAlign', 'CENTER');
    subList.setAttribute('linkListIDRef', '0');
    subList.setAttribute('linkListNextIDRef', '0');
    subList.setAttribute('textWidth', '0');
    subList.setAttribute('textHeight', '0');
    subList.setAttribute('hasTextRef', '0');
    subList.setAttribute('hasNumRef', '0');
    cell.insertBefore(subList, cell.firstChild);
  }

  let paragraph = hwpxFirstChild(subList, HWPX_NS.hp, 'p');
  if (!paragraph) {
    paragraph = doc.createElementNS(HWPX_NS.hp, 'hp:p');
    paragraph.setAttribute('id', String(Math.floor(Math.random() * 2000000000) + 1));
    paragraph.setAttribute('paraPrIDRef', '1');
    paragraph.setAttribute('styleIDRef', '0');
    paragraph.setAttribute('pageBreak', '0');
    paragraph.setAttribute('columnBreak', '0');
    paragraph.setAttribute('merged', '0');
    subList.appendChild(paragraph);
  }

  return paragraph;
}

function hwpxCharPrId(paragraph) {
  const run = hwpxFirstChild(paragraph, HWPX_NS.hp, 'run');
  return run?.getAttribute('charPrIDRef') || '5';
}

function hwpxInsertRunBeforeLineSeg(paragraph, run) {
  const lineSeg = hwpxFirstChild(paragraph, HWPX_NS.hp, 'linesegarray');
  if (lineSeg) paragraph.insertBefore(run, lineSeg);
  else paragraph.appendChild(run);
}

function hwpxSetCellText(doc, cell, text) {
  if (!cell) return;

  const paragraph = hwpxEnsureParagraph(doc, cell);
  const subList = hwpxFirstChild(cell, HWPX_NS.hp, 'subList');

  if (subList) {
    hwpxChildren(subList, HWPX_NS.hp, 'p').forEach(p => {
      if (p !== paragraph) p.remove();
    });
  }

  const charPrId = hwpxCharPrId(paragraph);
  hwpxChildren(paragraph, HWPX_NS.hp, 'run').forEach(run => run.remove());

  const run = doc.createElementNS(HWPX_NS.hp, 'hp:run');
  run.setAttribute('charPrIDRef', charPrId);

  const textEl = doc.createElementNS(HWPX_NS.hp, 'hp:t');
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (index) textEl.appendChild(doc.createElementNS(HWPX_NS.hp, 'hp:lineBreak'));
    textEl.appendChild(doc.createTextNode(line));
  });

  run.appendChild(textEl);
  hwpxInsertRunBeforeLineSeg(paragraph, run);
  cell.setAttribute('dirty', '1');
}

function hwpxSetCellParagraphStyle(cell, paraPrIDRef) {
  if (!cell) return;
  const subList = hwpxFirstChild(cell, HWPX_NS.hp, 'subList');
  if (!subList) return;
  hwpxChildren(subList, HWPX_NS.hp, 'p').forEach(p => {
    p.setAttribute('paraPrIDRef', String(paraPrIDRef));
  });
}

function hwpxNewId() {
  return String(Math.floor(Math.random() * 2000000000) + 1);
}

function hwpxAppendElement(doc, parent, namespace, qname, attrs = {}) {
  const element = doc.createElementNS(namespace, qname);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  parent.appendChild(element);
  return element;
}

function hwpxCellContentBox(cell) {
  const size = hwpxFirstChild(cell, HWPX_NS.hp, 'cellSz');
  const margin = hwpxFirstChild(cell, HWPX_NS.hp, 'cellMargin');

  const width = Number(size?.getAttribute('width') || 22000);
  const height = Number(size?.getAttribute('height') || 16000);
  const left = Number(margin?.getAttribute('left') || 0);
  const right = Number(margin?.getAttribute('right') || 0);
  const top = Number(margin?.getAttribute('top') || 0);
  const bottom = Number(margin?.getAttribute('bottom') || 0);

  return {
    width: Math.max(3000, width - left - right),
    height: Math.max(3000, height - top - bottom)
  };
}

function hwpxFitPictureToCell(cell, asset) {
  const box = hwpxCellContentBox(cell);
  const sourceWidth = Math.max(1, Number(asset.pixelWidth || 1));
  const sourceHeight = Math.max(1, Number(asset.pixelHeight || 1));
  const fitScale = Math.min(box.width / sourceWidth, box.height / sourceHeight) * 0.98;

  return {
    width: Math.max(1200, Math.floor(sourceWidth * fitScale)),
    height: Math.max(1200, Math.floor(sourceHeight * fitScale)),
    rawWidth: sourceWidth * 100,
    rawHeight: sourceHeight * 100
  };
}

function hwpxNextZOrder(doc) {
  const max = Array.from(doc.getElementsByTagNameNS(HWPX_NS.hp, 'pic'))
    .reduce((value, picture) => Math.max(value, Number(picture.getAttribute('zOrder')) || 0), 0);
  return String(max + 1);
}

function hwpxPictureElement(doc, asset, box) {
  const pictureId = hwpxNewId();
  const pic = doc.createElementNS(HWPX_NS.hp, 'hp:pic');

  Object.entries({
    id: pictureId,
    zOrder: hwpxNextZOrder(doc),
    numberingType: 'PICTURE',
    textWrap: 'TOP_AND_BOTTOM',
    textFlow: 'BOTH_SIDES',
    lock: '0',
    dropcapstyle: 'None',
    href: '',
    groupLevel: '0',
    instid: pictureId,
    reverse: '0'
  }).forEach(([key, value]) => pic.setAttribute(key, value));

  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:offset', { x: 0, y: 0 });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:orgSz', { width: box.rawWidth, height: box.rawHeight });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:curSz', { width: box.width, height: box.height });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:flip', { horizontal: 0, vertical: 0 });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:rotationInfo', {
    angle: 0,
    centerX: Math.floor(box.width / 2),
    centerY: Math.floor(box.height / 2),
    rotateimage: 1
  });

  const renderingInfo = hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:renderingInfo');
  hwpxAppendElement(doc, renderingInfo, HWPX_NS.hc, 'hc:transMatrix', {
    e1: 1, e2: 0, e3: 0, e4: 0, e5: 1, e6: 0
  });
  hwpxAppendElement(doc, renderingInfo, HWPX_NS.hc, 'hc:scaMatrix', {
    e1: (box.width / box.rawWidth).toFixed(6), e2: 0, e3: 0,
    e4: 0, e5: (box.height / box.rawHeight).toFixed(6), e6: 0
  });
  hwpxAppendElement(doc, renderingInfo, HWPX_NS.hc, 'hc:rotMatrix', {
    e1: 1, e2: 0, e3: 0, e4: 0, e5: 1, e6: 0
  });

  hwpxAppendElement(doc, pic, HWPX_NS.hc, 'hc:img', {
    binaryItemIDRef: asset.binaryId,
    bright: 0,
    contrast: 0,
    effect: 'REAL_PIC',
    alpha: 0
  });

  const imgRect = hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:imgRect');
  hwpxAppendElement(doc, imgRect, HWPX_NS.hc, 'hc:pt0', { x: 0, y: 0 });
  hwpxAppendElement(doc, imgRect, HWPX_NS.hc, 'hc:pt1', { x: box.rawWidth, y: 0 });
  hwpxAppendElement(doc, imgRect, HWPX_NS.hc, 'hc:pt2', { x: box.rawWidth, y: box.rawHeight });
  hwpxAppendElement(doc, imgRect, HWPX_NS.hc, 'hc:pt3', { x: 0, y: box.rawHeight });

  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:imgClip', {
    left: 0, right: box.rawWidth, top: 0, bottom: box.rawHeight
  });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:inMargin', { left: 0, right: 0, top: 0, bottom: 0 });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:imgDim', {
    dimwidth: box.rawWidth,
    dimheight: box.rawHeight
  });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:effects');
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:sz', {
    width: box.width,
    height: box.height,
    widthRelTo: 'ABSOLUTE',
    heightRelTo: 'ABSOLUTE',
    protect: 0
  });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:pos', {
    treatAsChar: 1,
    affectLSpacing: 0,
    flowWithText: 1,
    allowOverlap: 0,
    holdAnchorAndSO: 0,
    vertRelTo: 'PARA',
    horzRelTo: 'PARA',
    vertAlign: 'TOP',
    horzAlign: 'CENTER',
    vertOffset: 0,
    horzOffset: 0
  });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:outMargin', { left: 0, right: 0, top: 0, bottom: 0 });
  hwpxAppendElement(doc, pic, HWPX_NS.hp, 'hp:shapeComment').textContent = '출장 사진';

  return pic;
}

function hwpxUpdatePictureLineSeg(doc, paragraph, width, height) {
  let lineSegArray = hwpxFirstChild(paragraph, HWPX_NS.hp, 'linesegarray');
  if (!lineSegArray) {
    lineSegArray = doc.createElementNS(HWPX_NS.hp, 'hp:linesegarray');
    paragraph.appendChild(lineSegArray);
  }

  let lineSeg = hwpxFirstChild(lineSegArray, HWPX_NS.hp, 'lineseg');
  if (!lineSeg) {
    lineSeg = doc.createElementNS(HWPX_NS.hp, 'hp:lineseg');
    lineSegArray.appendChild(lineSeg);
  }

  Object.entries({
    textpos: 0,
    vertpos: 0,
    vertsize: height,
    textheight: height,
    baseline: Math.floor(height * 0.85),
    spacing: 600,
    horzpos: 0,
    horzsize: width,
    flags: 393216
  }).forEach(([key, value]) => lineSeg.setAttribute(key, String(value)));
}

function hwpxSetCellPicture(doc, cell, asset) {
  if (!cell || !asset) return;

  const paragraph = hwpxEnsureParagraph(doc, cell);
  const subList = hwpxFirstChild(cell, HWPX_NS.hp, 'subList');
  if (subList) {
    hwpxChildren(subList, HWPX_NS.hp, 'p').forEach(p => {
      if (p !== paragraph) p.remove();
    });
  }
  const charPrId = hwpxCharPrId(paragraph);
  const box = hwpxFitPictureToCell(cell, asset);
  hwpxChildren(paragraph, HWPX_NS.hp, 'run').forEach(run => run.remove());

  const run = doc.createElementNS(HWPX_NS.hp, 'hp:run');
  run.setAttribute('charPrIDRef', charPrId);
  run.appendChild(hwpxPictureElement(doc, asset, box));
  run.appendChild(doc.createElementNS(HWPX_NS.hp, 'hp:t'));
  hwpxInsertRunBeforeLineSeg(paragraph, run);
  hwpxUpdatePictureLineSeg(doc, paragraph, box.width, box.height);
  cell.setAttribute('dirty', '1');
}

function hwpxDataUrlToBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/);
  if (!match) throw new Error('사진 데이터를 읽지 못했습니다.');

  const type = match[1].toLowerCase();
  const format = type === 'jpeg' ? 'jpg' : type;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);

  return { bytes, format };
}

function hwpxImageDimensions(dataUrl) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || image.width || 1,
      height: image.naturalHeight || image.height || 1
    });
    image.onerror = () => resolve({ width: 4, height: 3 });
    image.src = dataUrl;
  });
}


let bundledTemplatesLoadPromise = null;

function ensureBundledHwpxTemplates() {
  if (window.BUNDLED_HWPX_TEMPLATES) return Promise.resolve(window.BUNDLED_HWPX_TEMPLATES);
  if (bundledTemplatesLoadPromise) return bundledTemplatesLoadPromise;

  bundledTemplatesLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './js/bundled-hwpx-templates.js';
    script.async = true;
    script.onload = () => window.BUNDLED_HWPX_TEMPLATES
      ? resolve(window.BUNDLED_HWPX_TEMPLATES)
      : reject(new Error('내장 HWPX 템플릿 초기화 실패'));
    script.onerror = () => reject(new Error('내장 HWPX 템플릿을 불러오지 못했습니다.'));
    document.head.appendChild(script);
  }).catch(error => {
    bundledTemplatesLoadPromise = null;
    throw error;
  });

  return bundledTemplatesLoadPromise;
}
