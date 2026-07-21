'use strict';

const MAX_HWPX_TEMPLATES_PER_KIND = 5;
const MAX_LOCAL_HWPX_TEMPLATE_BYTES = 2 * 1024 * 1024;
const MAX_SHARED_HWPX_TEMPLATE_BYTES = 620 * 1024;
const HWPX_SELECTION_KEY_PREFIX = 'ys_aton_calendar_hwpx_selection_v1_';
const DEFAULT_HWPX_TEMPLATE_PATHS = {
  meeting: './templates/meeting_weekly_template.hwpx',
  meetingWeekly: './templates/meeting_weekly_template.hwpx',
  meetingMonthly: './templates/meeting_monthly_template.hwpx',
  trip: './templates/trip_template.hwpx'
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
  alert("템플릿 선택이 완료되었습니다.");
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
    alert("이미 등록된 템플릿입니다.");
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
    saveHwpxTemplatesToCloud().then(() => renderHwpxTemplateStatus());

    if ($('hwpxTemplateFile')) $('hwpxTemplateFile').value = '';

    alert("템플릿 등록이 완료되었습니다.");
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
    await ensureBundledHwpxTemplates();
    const path = DEFAULT_HWPX_TEMPLATE_PATHS[kind];
    const filename = path.split('/').pop();
    const templates = normalizeHwpxTemplates();
    const currentDefault = templates[kind].find(template =>
      template.isDefault && template.name === filename
    );

    if (currentDefault) {
      selectHwpxTemplate(currentDefault.id);
      alert("기본 템플릿 선택이 완료되었습니다.");
      return;
    }

    let buffer;
    if (kind === 'trip' && window.BUNDLED_HWPX_TEMPLATES?.trip) {
      buffer = bundledTemplateBuffer('trip');
    } else if (kind === 'meeting' && window.BUNDLED_HWPX_TEMPLATES?.meetingWeekly) {
      buffer = bundledTemplateBuffer('meetingWeekly');
    } else {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error('기본 초안 파일을 찾지 못했습니다.');
      buffer = await response.arrayBuffer();
    }

    templates[kind] = templates[kind].filter(template => !template.isDefault);
    const file = new File([buffer], filename, {
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
  alert("템플릿 삭제가 완료되었습니다.");
}

