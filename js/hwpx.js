const MAX_HWPX_TEMPLATES_PER_KIND = 5;
const MAX_LOCAL_HWPX_TEMPLATE_BYTES = 2 * 1024 * 1024;
const MAX_SHARED_HWPX_TEMPLATE_BYTES = 620 * 1024;
const HWPX_SELECTION_KEY_PREFIX = 'ys_aton_calendar_hwpx_selection_v1_';
const DEFAULT_HWPX_TEMPLATE_PATHS = {
  meeting: './templates/회의자료_서식초안.hwpx',
  trip: './templates/출장복명서_서식초안.hwpx'
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

  data.hwpxTemplates = {
    meeting: asTemplateList(raw.meeting, 'meeting'),
    trip: asTemplateList(raw.trip, 'trip')
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

  for (const kind of ['meeting', 'trip']) {
    const byId = new Map();

    // 내 브라우저에서 방금 추가한 초안이 서버 응답 때문에 사라지지 않게 먼저 보관합니다.
    [...local[kind], ...remote[kind]].forEach(template => {
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
  const existingDefault = normalizeHwpxTemplates()[kind].find(template => template.isDefault);

  if (existingDefault) {
    selectHwpxTemplate(existingDefault.id);
    alert('기본 서식 초안이 이미 등록되어 있어 해당 초안을 선택했습니다.');
    return;
  }

  try {
    const path = DEFAULT_HWPX_TEMPLATE_PATHS[kind];
    const response = await fetch(path, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error('기본 초안 파일을 찾지 못했습니다. templates 폴더가 사이트에 올라갔는지 확인하세요.');
    }

    const blob = await response.blob();
    const filename = path.split('/').pop();
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
  data.hwpxTemplateSelections[kind] = templates[kind][0]?.id || '';
  saveStoredHwpxSelections();
  localSave();
  renderHwpxTemplateStatus();

  saveHwpxTemplatesToCloud().then(() => renderHwpxTemplateStatus());
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

    const zip = await JSZip.loadAsync(b64ToBuf(template.b64));
    const sectionNames = Object.keys(zip.files).filter(name =>
      /^Contents\/section\d+\.xml$/i.test(name)
    );

    if (!sectionNames.length) {
      alert('템플릿에서 Contents/section*.xml을 찾지 못했습니다. 다른 HWPX 템플릿을 등록해 주세요.');
      return;
    }

    const map = hwpxMap(kind, sourceId);
    let replacedAny = false;

    for (const sectionName of sectionNames) {
      const xml = await zip.file(sectionName).async('string');
      const replaced = replacePlaceholders(xml, map);

      validateHwpxXml(replaced, sectionName);

      if (replaced !== xml) {
        replacedAny = true;
      }

      zip.file(sectionName, replaced);
    }

    if (!replacedAny) {
      alert(
        '이 템플릿에는 필요한 표시값이 없습니다.\n' +
        '회의자료용 또는 출장복명서용 서식 초안을 등록해 주세요.'
      );
      return;
    }

    if (zip.file('Preview/PrvText.txt')) {
      zip.file('Preview/PrvText.txt', compactHwpxLines(sourceId).join('\n'));
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE'
    });

    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);

    a.href = objectUrl;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    alert(`${hwpxKindLabel(kind)} HWPX 저장이 완료되었습니다.`);
  } catch (error) {
    console.error(error);
    alert('HWPX 생성 오류: ' + error.message);
  }
}
