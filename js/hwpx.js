const MAX_HWPX_TEMPLATES_PER_KIND = 5;
const MAX_LOCAL_HWPX_TEMPLATE_BYTES = 2 * 1024 * 1024;
const MAX_SHARED_HWPX_TEMPLATE_BYTES = 620 * 1024;
const HWPX_SELECTION_KEY_PREFIX = 'ys_aton_calendar_hwpx_selection_v1_';
const DEFAULT_HWPX_TEMPLATE_PATHS = {
  meeting: './templates/회의자료_서식초안.hwpx',
  trip: './templates/출장복명서(양식).hwpx'
};

let hwpxCloudStatus = '';

function bufToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }

  return btoa(binary);
}

function b64ToBuf(base64) {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }

  return buffer.buffer;
}

function templateId() {
  return 'hwpx_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

function hwpxSelectionStorageKey() {
  return HWPX_SELECTION_KEY_PREFIX + (auth?.currentUser?.uid || data.uid || 'guest');
}

function readStoredHwpxSelections() {
  try {
    const saved = JSON.parse(localStorage.getItem(hwpxSelectionStorageKey()) || '{}');
    return {
      meeting: String(saved.meeting || ''),
      trip: String(saved.trip || '')
    };
  } catch (error) {
    return { meeting: '', trip: '' };
  }
}

function saveStoredHwpxSelections() {
  try {
    localStorage.setItem(
      hwpxSelectionStorageKey(),
      JSON.stringify(data.hwpxTemplateSelections || { meeting: '', trip: '' })
    );
  } catch (error) {
    console.warn('템플릿 선택 상태 저장 실패:', error);
  }
}

function asTemplateList(value, kind) {
  if (Array.isArray(value)) {
    return value
      .filter(item => item && typeof item === 'object' && item.b64)
      .map(item => ({
        ...item,
        id: item.id || templateId(),
        kind: item.kind || kind
      }));
  }

  if (value && typeof value === 'object' && value.b64) {
    return [{
      ...value,
      id: value.id || templateId(),
      kind: value.kind || kind
    }];
  }

  return [];
}

function normalizeHwpxTemplates() {
  const raw = data.hwpxTemplates && typeof data.hwpxTemplates === 'object'
    ? data.hwpxTemplates
    : {};

  const deleted = new Set((data.deletedHwpxTemplateIds || []).map(String));
  data.hwpxTemplates = {
    meeting: asTemplateList(raw.meeting, 'meeting').filter(item => !deleted.has(String(item.id))),
    trip: asTemplateList(raw.trip, 'trip').filter(item => !deleted.has(String(item.id)))
  };

  const storedSelections = readStoredHwpxSelections();
  const currentSelections = data.hwpxTemplateSelections || {};

  data.hwpxTemplateSelections = {
    meeting: storedSelections.meeting || String(currentSelections.meeting || ''),
    trip: storedSelections.trip || String(currentSelections.trip || '')
  };

  for (const kind of ['meeting', 'trip']) {
    const list = data.hwpxTemplates[kind];
    const selectedId = data.hwpxTemplateSelections[kind];

    if (!list.some(item => item.id === selectedId)) {
      data.hwpxTemplateSelections[kind] = list[0]?.id || '';
    }
  }

  saveStoredHwpxSelections();
  return data.hwpxTemplates;
}

function mergeHwpxTemplateLists(localTemplates, remoteTemplates) {
  const local = {
    meeting: asTemplateList(localTemplates?.meeting, 'meeting'),
    trip: asTemplateList(localTemplates?.trip, 'trip')
  };
  const remote = {
    meeting: asTemplateList(remoteTemplates?.meeting, 'meeting'),
    trip: asTemplateList(remoteTemplates?.trip, 'trip')
  };

  const merged = { meeting: [], trip: [] };
  const deleted = new Set((data.deletedHwpxTemplateIds || []).map(String));

  for (const kind of ['meeting', 'trip']) {
    const byId = new Map();

    // 내 브라우저에서 방금 추가한 초안이 서버 응답 때문에 사라지지 않게 먼저 보관합니다.
    [...local[kind], ...remote[kind]].forEach(template => {
      if (deleted.has(String(template.id))) return;
      if (!byId.has(template.id)) byId.set(template.id, template);
    });

    merged[kind] = [...byId.values()]
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, MAX_HWPX_TEMPLATES_PER_KIND);
  }

  return merged;
}

function selectedHwpxKind() {
  return $('hwpxTemplateKind')?.value === 'trip' ? 'trip' : 'meeting';
}

function hwpxKindLabel(kind) {
  return kind === 'trip' ? '출장복명서' : '회의자료';
}

function selectedHwpxTemplate(kind) {
  const templates = normalizeHwpxTemplates();
  const selectedId = data.hwpxTemplateSelections?.[kind] || '';

  return templates[kind].find(item => item.id === selectedId) || templates[kind][0] || null;
}

function templateBytes(template) {
  if (!template?.b64) return 0;

  const base64 = String(template.b64);
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);

  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function totalTemplateBytes(templates = normalizeHwpxTemplates()) {
  return ['meeting', 'trip']
    .flatMap(kind => templates[kind] || [])
    .reduce((total, template) => total + templateBytes(template), 0);
}

function optionText(template) {
  const date = template.updatedAt
    ? new Date(template.updatedAt).toLocaleDateString()
    : '';
  const source = template.isDefault ? '기본 초안' : '내 파일';

  return `${template.name || '이름 없는 템플릿'}${date ? ' · ' + date : ''} · ${source}`;
}

function renderHwpxTemplateStatus() {
  const templates = normalizeHwpxTemplates();
  const kind = selectedHwpxKind();
  const list = templates[kind];
  const selected = selectedHwpxTemplate(kind);
  const selector = $('hwpxTemplateSelect');

  if (selector) {
    selector.innerHTML = list.length
      ? list.map(template => `<option value="${esc(template.id)}">${esc(optionText(template))}</option>`).join('')
      : '<option value="">등록된 템플릿이 없습니다.</option>';
    selector.value = selected?.id || '';
    selector.disabled = !list.length;
  }

  if ($('hwpxStatus')) {
    const selectionNotice = selected
      ? `현재 선택: ${selected.name}`
      : `현재 ${hwpxKindLabel(kind)}용 템플릿이 없습니다.`;
    const cloudNotice = hwpxCloudStatus || (
      USE_FIREBASE
        ? '템플릿은 이 브라우저에 먼저 저장됩니다. 서버 공유는 자동으로 시도합니다.'
        : 'Firebase를 쓰지 않는 상태라 이 브라우저에만 저장됩니다.'
    );

    $('hwpxStatus').innerText =
      `회의자료용 ${templates.meeting.length}개 / 출장복명서용 ${templates.trip.length}개 저장됨\n` +
      `${selectionNotice}\n${cloudNotice}`;
  }
}

function onHwpxTemplateKindChange() {
  renderHwpxTemplateStatus();
}

function selectHwpxTemplate(id) {
  const kind = selectedHwpxKind();
  const templates = normalizeHwpxTemplates();

  if (!templates[kind].some(template => template.id === id)) {
    renderHwpxTemplateStatus();
    return;
  }

  data.hwpxTemplateSelections[kind] = id;
  saveStoredHwpxSelections();
  localSave();
  renderHwpxTemplateStatus();
}

function applySelectedHwpxTemplate() {
  const id = $('hwpxTemplateSelect')?.value || '';

  if (!id) {
    alert('사용할 템플릿을 먼저 선택하세요.');
    return;
  }

  selectHwpxTemplate(id);
  alert(`${hwpxKindLabel(selectedHwpxKind())}용 템플릿을 선택했습니다.`);
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

async function saveHwpxTemplatesToCloud() {
  if (!USE_FIREBASE || !db || !auth?.currentUser) return false;

  const templates = normalizeHwpxTemplates();
  const bytes = totalTemplateBytes(templates);

  if (bytes > MAX_SHARED_HWPX_TEMPLATE_BYTES) {
    hwpxCloudStatus = '템플릿 용량이 커서 이 브라우저에만 저장했습니다. 공유하려면 사진 없는 작은 HWPX 양식을 사용하세요.';
    return false;
  }

  try {
    await db
      .collection('settings')
      .doc('hwpxTemplates')
      .set({
        templates: cleanForFirestore(templates),
        updatedAt: new Date().toISOString()
      }, { merge: true });

    hwpxCloudStatus = '템플릿 목록을 서버에도 저장했습니다.';
    return true;
  } catch (error) {
    console.warn('템플릿 서버 저장 실패:', error);
    hwpxCloudStatus = '템플릿은 이 브라우저에 저장되었습니다. 서버 공유는 실패했습니다.';
    return false;
  }
}

async function addHwpxTemplateFromFile(file, options = {}) {
  if (!file) {
    alert('등록할 HWPX 파일을 먼저 선택하세요.');
    return false;
  }

  if (!String(file.name || '').toLowerCase().endsWith('.hwpx')) {
    alert('HWPX 파일(.hwpx)만 등록할 수 있습니다.');
    return false;
  }

  if (file.size > MAX_LOCAL_HWPX_TEMPLATE_BYTES) {
    alert('템플릿 파일은 2MB 이하만 등록할 수 있습니다. 사진이 많이 들어간 파일은 줄여서 다시 저장하세요.');
    return false;
  }

  const kind = options.kind || selectedHwpxKind();
  const templates = normalizeHwpxTemplates();
  const list = templates[kind];

  const sameFile = list.find(template =>
    template.name === file.name && Number(template.size || 0) === Number(file.size || 0)
  );

  if (sameFile) {
    data.hwpxTemplateSelections[kind] = sameFile.id;
    saveStoredHwpxSelections();
    localSave();
    renderHwpxTemplateStatus();
    alert('이미 등록된 파일입니다. 해당 템플릿을 선택했습니다.');
    return true;
  }

  if (list.length >= MAX_HWPX_TEMPLATES_PER_KIND) {
    alert(`${hwpxKindLabel(kind)}용 템플릿은 최대 ${MAX_HWPX_TEMPLATES_PER_KIND}개까지 저장할 수 있습니다. 필요 없는 초안을 먼저 삭제하세요.`);
    return false;
  }

  try {
    const base64 = bufToB64(await readFileAsArrayBuffer(file));
    const newTemplate = {
      id: templateId(),
      kind,
      name: file.name,
      size: file.size,
      b64: base64,
      isDefault: !!options.isDefault,
      createdByUid: auth?.currentUser?.uid || data.uid || '',
      createdByName: data.user || '',
      updatedAt: new Date().toISOString()
    };

    list.push(newTemplate);
    unmarkLocalDeleted('deletedHwpxTemplateIds', newTemplate.id);
    data.hwpxTemplateSelections[kind] = newTemplate.id;
    saveStoredHwpxSelections();
    localSave();
    renderHwpxTemplateStatus();

    // 서버 저장 실패와 무관하게 먼저 현재 기기에서는 바로 사용할 수 있어야 합니다.
    saveHwpxTemplatesToCloud().then(() => renderHwpxTemplateStatus());

    if ($('hwpxTemplateFile')) $('hwpxTemplateFile').value = '';

    alert(`${hwpxKindLabel(kind)}용 템플릿을 등록하고 선택했습니다.`);
    return true;
  } catch (error) {
    console.error(error);
    alert('템플릿 등록 실패: ' + error.message);
    return false;
  }
}

function loadHwpxTemplate(file) {
  return addHwpxTemplateFromFile(file);
}

function registerSelectedHwpxTemplate() {
  const file = $('hwpxTemplateFile')?.files?.[0] || null;
  return addHwpxTemplateFromFile(file);
}

async function registerBundledHwpxTemplate() {
  const kind = selectedHwpxKind();

  try {
    const path = DEFAULT_HWPX_TEMPLATE_PATHS[kind];
    const filename = path.split('/').pop();
    const templates = normalizeHwpxTemplates();
    const currentDefault = templates[kind].find(template =>
      template.isDefault && template.name === filename
    );

    if (currentDefault) {
      selectHwpxTemplate(currentDefault.id);
      alert('현재 기본 서식 초안을 선택했습니다.');
      return;
    }

    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('기본 초안 파일을 찾지 못했습니다. templates 폴더가 사이트에 올라갔는지 확인하세요.');
    }

    // 예전에 등록한 다른 기본 초안은 교체합니다. 직접 등록한 파일은 유지됩니다.
    templates[kind] = templates[kind].filter(template => !template.isDefault);
    const blob = await response.blob();
    const file = new File([blob], filename, {
      type: 'application/vnd.hancom.hwp'
    });

    await addHwpxTemplateFromFile(file, { kind, isDefault: true });
  } catch (error) {
    console.error(error);
    alert('기본 초안 등록 실패: ' + error.message);
  }
}

async function clearHwpxTemplate() {
  const kind = selectedHwpxKind();
  const templates = normalizeHwpxTemplates();
  const selected = selectedHwpxTemplate(kind);

  if (!selected) {
    alert('삭제할 템플릿을 먼저 선택하세요.');
    return;
  }

  if (!confirm(`“${selected.name}” 템플릿을 삭제할까요?`)) return;

  templates[kind] = templates[kind].filter(template => template.id !== selected.id);
  markLocalDeleted('deletedHwpxTemplateIds', selected.id);
  data.hwpxTemplateSelections[kind] = templates[kind][0]?.id || '';
  saveStoredHwpxSelections();
  localSave();
  renderHwpxTemplateStatus();

  const shared = await saveHwpxTemplatesToCloud();
  renderHwpxTemplateStatus();
  alert(shared
    ? '선택한 템플릿을 삭제했습니다.'
    : '이 기기에서는 템플릿을 삭제했습니다. 서버 삭제가 실패하면 다른 기기에는 남아 있을 수 있습니다.');
}

function xmlTextEscape(text) {
  return String(text ?? '')
    .replace(/[&<>]/g, match => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    }[match]))
    // HWPX의 hp:t 안 줄바꿈은 lineBreak 요소로 넣어야 한글에서 줄이 유지됩니다.
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

function meetingHwpxParts() {
  const report = $('meetingReport');
  const fallbackType = $('mType')?.value || 'weekly';
  const fallbackHeadings = fallbackType === 'monthly'
    ? ['Ⅰ. 현재월 주요 실적', 'Ⅱ. 다음월 주요 계획', 'Ⅲ. 주요 현안 및 협조사항', 'Ⅳ. 추가 메모']
    : ['Ⅰ. 금주 주요 실적', 'Ⅱ. 다음주 주요 계획', 'Ⅲ. 주요 현안 및 협조사항', 'Ⅳ. 추가 메모'];

  if (!report) {
    return {
      department: $('mDept')?.value?.trim() || '항행정보시설과',
      basis: typeof periodInfo === 'function' ? periodInfo().label : '',
      headings: fallbackHeadings,
      bodies: Array(4).fill('ㅇ 해당사항 없음')
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

function hwpxMap(kind, sourceId) {
  const lines = stripHtmlText(sourceId);

  const map = {
    '{{본문}}': lines.join('\n'),
    '{{회의자료}}': lines.join('\n'),
    '{{제목}}': lines[0] || '',
    '{{작성일}}': kdate(today())
  };

  if (kind === 'meeting') {
    const meeting = meetingHwpxParts();

    map['{{부서명}}'] = meeting.department;
    map['{{작성기준}}'] = meeting.basis;
    map['{{실적제목}}'] = meeting.headings[0];
    map['{{계획제목}}'] = meeting.headings[1];
    map['{{현안제목}}'] = meeting.headings[2];
    map['{{메모제목}}'] = meeting.headings[3];
    map['{{금주실적}}'] = meeting.bodies[0];
    map['{{다음주계획}}'] = meeting.bodies[1];
    map['{{현안협조}}'] = meeting.bodies[2];
    map['{{추가메모}}'] = meeting.bodies[3];
  }

  if (kind === 'trip') {
    const tripDate = $('tDate')?.value || today();
    const reportDate = $('tReportDate')?.value || tripDate;

    map['{{출장자}}'] = $('tPerson')?.value.trim() || data.user || '';
    map['{{성명}}'] = $('tPerson')?.value.trim() || data.user || '';
    map['{{출장지}}'] = $('tPlace')?.value.trim() || '';
    map['{{출발}}'] = mdate(tripDate) + ' ' + timeText(
      $('tStartH')?.value || 9,
      $('tStartM')?.value || 0
    );
    map['{{귀청}}'] = mdate(tripDate) + ' ' + timeText(
      $('tEndH')?.value || 18,
      $('tEndM')?.value || 0
    );
    map['{{복명}}'] = mdate(reportDate);
    map['{{복명일}}'] = kdate(reportDate);
    map['{{직급}}'] = $('tRank')?.value.trim() || '';
    map['{{출장목적}}'] = $('tPurpose')?.value.trim() || 'ㅇ 해당사항 없음';
    map['{{수행상황}}'] = $('tBody')?.value.trim() || 'ㅇ 해당사항 없음';
    map['{{향후계획}}'] = $('tPlan')?.value.trim() || 'ㅇ 해당사항 없음';
    map['{{붙임}}'] = typeof tripAttachmentText === 'function'
      ? tripAttachmentText()
      : '끝.';
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
    horzAlign: 'LEFT',
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

async function buildTripPhotoAssets() {
  const picked = (photos || []).slice(0, 6);
  const assets = [];

  for (let index = 0; index < picked.length; index++) {
    const photo = picked[index];
    const dimensions = await hwpxImageDimensions(photo.data);
    const { bytes, format } = hwpxDataUrlToBytes(photo.data);

    assets.push({
      bytes,
      format,
      pixelWidth: dimensions.width,
      pixelHeight: dimensions.height,
      caption: String(photo.cap || `사진 ${index + 1}`),
      binaryId: ''
    });
  }

  return assets;
}

function hasTripPhotoLayout(sectionXml) {
  try {
    const doc = parseHwpxXml(sectionXml, '출장복명서 양식');
    const tables = Array.from(doc.getElementsByTagNameNS(HWPX_NS.hp, 'tbl'));
    const [main, attachment, photoTable] = tables;
    return Boolean(
      main?.getAttribute('rowCnt') === '5' && main?.getAttribute('colCnt') === '6' &&
      attachment?.getAttribute('rowCnt') === '1' && attachment?.getAttribute('colCnt') === '3' &&
      photoTable?.getAttribute('rowCnt') === '6' && photoTable?.getAttribute('colCnt') === '2'
    );
  } catch (error) {
    return false;
  }
}

function applyTripFormLayout(sectionXml, map, assets) {
  const doc = parseHwpxXml(sectionXml, '출장복명서');
  const tables = Array.from(doc.getElementsByTagNameNS(HWPX_NS.hp, 'tbl'));
  const [main, attachment, photoTable] = tables;

  if (!hasTripPhotoLayout(sectionXml)) {
    return { xml: sectionXml, applied: false };
  }

  const by = key => String(map[key] || '');

  hwpxSetCellText(doc, hwpxCell(main, 1, 0), by('{{출장자}}'));
  hwpxSetCellText(doc, hwpxCell(main, 0, 1), `출발: ${by('{{출발}}')}\n귀청: ${by('{{귀청}}')}`);
  hwpxSetCellText(doc, hwpxCell(main, 0, 3), `복명: ${by('{{복명}}')}`);
  hwpxSetCellText(doc, hwpxCell(main, 1, 5), by('{{출장지}}'));
  hwpxSetCellText(doc, hwpxCell(main, 2, 0), [
    '1. 출장목적', by('{{출장목적}}'), '',
    '2. 출장목적 수행상황', by('{{수행상황}}'), '',
    '3. 향후계획', by('{{향후계획}}'), '',
    '붙임  사진대지 1부. 끝.', '',
    '위와 같이 복명함', by('{{복명일}}')
  ].join('\n'));
  hwpxSetCellText(doc, hwpxCell(main, 4, 0), by('{{직급}}'));
  hwpxSetCellText(doc, hwpxCell(main, 4, 2), `성명  ${by('{{성명}}')}  (인)`);

  // 사진이 없어도 첨부 페이지와 "붙임 사진대지 1부. 끝." 표기는 유지합니다.
  hwpxSetCellText(doc, hwpxCell(attachment, 0, 0), '붙임');
  hwpxSetCellText(doc, hwpxCell(attachment, 0, 1), '사진대지 1부');
  hwpxSetCellText(doc, hwpxCell(attachment, 0, 2), '끝.');

  const imageSlots = [[0, 0], [0, 1], [2, 0], [2, 1], [4, 0], [4, 1]];
  const captionSlots = [[1, 0], [1, 1], [3, 0], [3, 1], [5, 0], [5, 1]];

  imageSlots.forEach((slot, index) => {
    const asset = assets[index];
    const imageCell = hwpxCell(photoTable, slot[0], slot[1]);
    const captionCell = hwpxCell(photoTable, captionSlots[index][0], captionSlots[index][1]);

    if (asset) {
      hwpxSetCellPicture(doc, imageCell, asset);
      hwpxSetCellText(doc, captionCell, asset.caption);
    } else {
      hwpxSetCellText(doc, imageCell, '');
      hwpxSetCellText(doc, captionCell, '');
    }
  });

  return { xml: serializeHwpxXml(doc), applied: true };
}

function addTripImagesToPackage(zip, headerXml, contentHpfXml, assets) {
  if (!assets.length) return { headerXml, contentHpfXml };

  const header = parseHwpxXml(headerXml, 'HWPX 헤더');
  const content = parseHwpxXml(contentHpfXml, 'HWPX 목록');
  const refList = header.getElementsByTagNameNS(HWPX_NS.hh, 'refList')[0];
  if (!refList) throw new Error('템플릿 헤더에서 refList를 찾지 못했습니다.');

  let binDataList = refList.getElementsByTagNameNS(HWPX_NS.hh, 'binDataList')[0];
  if (!binDataList) {
    binDataList = header.createElementNS(HWPX_NS.hh, 'hh:binDataList');
    binDataList.setAttribute('itemCnt', '0');
    refList.appendChild(binDataList);
  }

  const manifest = content.getElementsByTagNameNS(HWPX_NS.opf, 'manifest')[0];
  if (!manifest) throw new Error('템플릿 목록에서 manifest를 찾지 못했습니다.');

  const usedIds = new Set();
  Array.from(binDataList.getElementsByTagNameNS(HWPX_NS.hh, 'binItem')).forEach(item => {
    const name = item.getAttribute('BinData');
    if (name) usedIds.add(name.replace(/\.[^.]+$/, ''));
  });
  Array.from(manifest.getElementsByTagNameNS(HWPX_NS.opf, 'item')).forEach(item => {
    const id = item.getAttribute('id');
    if (id) usedIds.add(id);
  });

  let nextImageNumber = 1;
  const nextBinaryId = () => {
    while (usedIds.has(`image${nextImageNumber}`)) nextImageNumber++;
    const id = `image${nextImageNumber}`;
    usedIds.add(id);
    nextImageNumber++;
    return id;
  };

  let binItemId = Array.from(binDataList.getElementsByTagNameNS(HWPX_NS.hh, 'binItem'))
    .reduce((max, item) => Math.max(max, Number(item.getAttribute('id')) || 0), -1) + 1;

  assets.forEach(asset => {
    asset.binaryId = nextBinaryId();
    const binName = `${asset.binaryId}.${asset.format}`;
    zip.file(`BinData/${binName}`, asset.bytes);

    const manifestItem = content.createElementNS(HWPX_NS.opf, 'opf:item');
    manifestItem.setAttribute('id', asset.binaryId);
    manifestItem.setAttribute('href', `BinData/${binName}`);
    manifestItem.setAttribute('media-type', asset.format === 'png' ? 'image/png' : 'image/jpeg');
    manifestItem.setAttribute('isEmbeded', '1');
    manifest.appendChild(manifestItem);

    const binItem = header.createElementNS(HWPX_NS.hh, 'hh:binItem');
    binItem.setAttribute('id', String(binItemId++));
    binItem.setAttribute('Type', 'Embedding');
    binItem.setAttribute('BinData', binName);
    binItem.setAttribute('Format', asset.format);
    binDataList.appendChild(binItem);
  });

  binDataList.setAttribute('itemCnt', String(binDataList.getElementsByTagNameNS(HWPX_NS.hh, 'binItem').length));
  return { headerXml: serializeHwpxXml(header), contentHpfXml: serializeHwpxXml(content) };
}

async function loadBundledTripTemplateZip() {
  const response = await fetch(DEFAULT_HWPX_TEMPLATE_PATHS.trip, { cache: 'no-store' });
  if (!response.ok) throw new Error('기본 출장복명서 양식을 찾지 못했습니다. templates 폴더를 확인하세요.');
  return JSZip.loadAsync(await response.arrayBuffer());
}

async function downloadHwpx(sourceId, filename, kind) {
  try {
    if (!window.JSZip) {
      alert('HWPX 저장에 필요한 JSZip을 불러오지 못했습니다. 인터넷 연결 상태를 확인하세요.');
      return;
    }

    if (kind === 'meeting' && !$('meetingReport')?.querySelector('h2')) {
      alert('먼저 회의자료 생성 버튼을 눌러 내용을 만든 뒤 저장하세요.');
      return;
    }

    const template = selectedHwpxTemplate(kind) || data.hwpxTemplate || null;
    if (!template?.b64) {
      alert(`${hwpxKindLabel(kind)}용 HWPX 템플릿을 먼저 등록하세요.`);
      return;
    }

    let zip = await JSZip.loadAsync(b64ToBuf(template.b64));
    let sectionNames = Object.keys(zip.files).filter(name => /^Contents\/section\d+\.xml$/i.test(name));
    if (!sectionNames.length) {
      alert('템플릿에서 Contents/section*.xml을 찾지 못했습니다. 다른 HWPX 템플릿을 등록해 주세요.');
      return;
    }

    let usedBundledTripForm = false;
    if (kind === 'trip') {
      const currentSections = await Promise.all(sectionNames.map(name => zip.file(name).async('string')));
      const isPhotoForm = currentSections.some(hasTripPhotoLayout);

      // 예전에 등록한 일반 HWPX가 선택돼 있어도 사진대지가 깨지지 않게 기관 양식으로 자동 보정합니다.
      if (!isPhotoForm) {
        zip = await loadBundledTripTemplateZip();
        sectionNames = Object.keys(zip.files).filter(name => /^Contents\/section\d+\.xml$/i.test(name));
        usedBundledTripForm = true;
      }
    }

    const map = hwpxMap(kind, sourceId);
    const photoAssets = kind === 'trip' ? await buildTripPhotoAssets() : [];
    let replacedAny = false;
    let tripLayoutApplied = false;

    if (kind === 'trip' && (photos || []).length > 6) {
      alert('현재 출장복명서 사진대지는 6칸입니다. HWPX에는 앞 6장만 넣습니다.');
    }

    if (kind === 'trip' && photoAssets.length) {
      const headerFile = zip.file('Contents/header.xml');
      const contentFile = zip.file('Contents/content.hpf');
      if (!headerFile || !contentFile) throw new Error('사진을 넣을 HWPX 헤더 파일을 찾지 못했습니다.');

      const packageUpdate = addTripImagesToPackage(
        zip,
        await headerFile.async('string'),
        await contentFile.async('string'),
        photoAssets
      );
      zip.file('Contents/header.xml', packageUpdate.headerXml);
      zip.file('Contents/content.hpf', packageUpdate.contentHpfXml);
    }

    for (const sectionName of sectionNames) {
      const original = await zip.file(sectionName).async('string');
      let replaced = replacePlaceholders(original, map);

      if (kind === 'trip') {
        const applied = applyTripFormLayout(replaced, map, photoAssets);
        replaced = applied.xml;
        tripLayoutApplied = tripLayoutApplied || applied.applied;
      }

      validateHwpxXml(replaced, sectionName);
      if (replaced !== original) replacedAny = true;
      zip.file(sectionName, replaced);
    }

    if (!replacedAny && !(kind === 'trip' && tripLayoutApplied)) {
      alert('이 템플릿에는 필요한 표시값이 없습니다. 회의자료용 또는 출장복명서용 서식 초안을 등록해 주세요.');
      return;
    }

    if (zip.file('Preview/PrvText.txt')) {
      const photoNote = kind === 'trip' ? `\n사진대지 ${photoAssets.length}장 첨부` : '';
      zip.file('Preview/PrvText.txt', compactHwpxLines(sourceId).join('\n') + photoNote);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    const fallbackNotice = usedBundledTripForm
      ? '\n선택된 기존 템플릿에 사진대지 틀이 없어 기본 출장복명서 양식으로 저장했습니다.'
      : '';
    alert(`${hwpxKindLabel(kind)} HWPX 저장이 완료되었습니다.${kind === 'trip' ? ` 사진 ${photoAssets.length}장과 사진대지 페이지를 반영했습니다.` : ''}${fallbackNotice}`);
  } catch (error) {
    console.error(error);
    alert('HWPX 생성 오류: ' + error.message);
  }
}
