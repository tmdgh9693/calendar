// js/hwpx.js
// 여러 HWPX 템플릿 등록/선택/삭제 및 공용 기본 초안 사용 담당
// XML을 다시 조립하지 않고, 템플릿에 포함된 표시값만 안전하게 치환합니다.

const HWPX_MAX_TEMPLATES = 4;
const HWPX_MAX_FILE_BYTES = 150 * 1024;

// 처음 사용하는 사람도 파일을 직접 등록하지 않고 바로 사용할 수 있는 공용 기본 초안입니다.
// 실제 HWPX 파일은 templates 폴더에 함께 배포됩니다.
const BUILTIN_HWPX_TEMPLATES = {
  meeting: {
    id: 'builtin-hwpx-meeting-v1',
    name: '공용 기본 회의자료 초안',
    kind: 'meeting',
    url: './templates/회의자료_빈_템플릿.hwpx'
  },
  trip: {
    id: 'builtin-hwpx-trip-v1',
    name: '공용 기본 출장복명서 초안',
    kind: 'trip',
    url: './templates/출장복명서_빈_템플릿.hwpx'
  }
};

const builtInTemplateCache = {};

function bufToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBuf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function templateKindLabel(kind) {
  return ({ meeting: '회의자료용', trip: '출장복명서용', both: '공용' })[kind] || '공용';
}

function getBuiltInTemplateById(templateId) {
  return Object.values(BUILTIN_HWPX_TEMPLATES).find(template => template.id === templateId) || null;
}

function isBuiltInHwpxTemplateId(templateId) {
  return Boolean(getBuiltInTemplateById(templateId));
}

function getSelectedHwpxTemplateRaw() {
  const builtIn = getBuiltInTemplateById(data.selectedHwpxTemplateId);
  if (builtIn) return { ...builtIn, isBuiltIn: true, size: 0 };
  return (data.hwpxTemplates || []).find(template => template.id === data.selectedHwpxTemplateId) || null;
}

function getSelectedHwpxTemplate(kind) {
  const template = getSelectedHwpxTemplateRaw();
  if (!template) return null;
  if (template.kind !== 'both' && template.kind !== kind) return null;
  return template;
}

async function loadBuiltInHwpxTemplate(kind) {
  const info = BUILTIN_HWPX_TEMPLATES[kind];
  if (!info) throw new Error('공용 기본 초안 정보를 찾지 못했습니다.');

  if (builtInTemplateCache[kind]) return builtInTemplateCache[kind];

  const response = await fetch(info.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`공용 기본 초안을 불러오지 못했습니다. (${response.status})`);

  const buffer = await response.arrayBuffer();
  const template = {
    ...info,
    isBuiltIn: true,
    size: buffer.byteLength,
    b64: bufToB64(buffer)
  };

  builtInTemplateCache[kind] = template;
  return template;
}

function renderSharedDraftStatus() {
  const status = $('sharedDraftStatus');
  if (!status) return;
  status.innerText = '공용 기본 초안은 누구나 사용할 수 있습니다. 저장된 템플릿이 없거나 용도가 맞지 않아도 HWPX 저장 시 회의자료·출장복명서에 맞는 기본 초안이 자동 적용됩니다.';
}

function renderHwpxTemplateControls() {
  const select = $('hwpxTemplateSelect');
  if (!select) return;

  normalizeData();
  const builtInOptions = Object.values(BUILTIN_HWPX_TEMPLATES)
    .map(template => `<option value="${template.id}" ${template.id === data.selectedHwpxTemplateId ? 'selected' : ''}>[공용 기본 초안] ${esc(template.name)}</option>`)
    .join('');

  const savedOptions = (data.hwpxTemplates || []).length
    ? data.hwpxTemplates.map(template => `<option value="${template.id}" ${template.id === data.selectedHwpxTemplateId ? 'selected' : ''}>[${templateKindLabel(template.kind)}] ${esc(template.name)}</option>`).join('')
    : '<option value="" disabled>등록한 템플릿 없음</option>';

  select.innerHTML = `<optgroup label="처음 사용자를 위한 공용 기본 초안">${builtInOptions}</optgroup><optgroup label="등록한 템플릿">${savedOptions}</optgroup>`;

  if (!data.selectedHwpxTemplateId) {
    data.selectedHwpxTemplateId = BUILTIN_HWPX_TEMPLATES.meeting.id;
    select.value = data.selectedHwpxTemplateId;
  }

  const selected = getSelectedHwpxTemplateRaw();
  if ($('hwpxStatus')) {
    $('hwpxStatus').innerText = selected
      ? (selected.isBuiltIn
        ? `선택됨: ${selected.name} · ${templateKindLabel(selected.kind)} · 공용 제공 초안`
        : `선택됨: ${selected.name} · ${templateKindLabel(selected.kind)} · ${Math.round((selected.size || 0) / 1024)}KB`)
      : '선택된 템플릿이 없습니다. HWPX 저장 시 알맞은 공용 기본 초안이 자동 적용됩니다.';
  }

  renderSharedDraftStatus();
}

function selectHwpxTemplate(templateId) {
  const valid = Boolean(getBuiltInTemplateById(templateId)) || (data.hwpxTemplates || []).some(template => template.id === templateId);
  if (!valid) return;
  data.selectedHwpxTemplateId = templateId;
  localSave();
  renderHwpxTemplateControls();
}

function useBuiltInHwpxTemplate(kind) {
  const template = BUILTIN_HWPX_TEMPLATES[kind];
  if (!template) return;
  data.selectedHwpxTemplateId = template.id;
  localSave();
  renderHwpxTemplateControls();
  alert(`${template.name}을(를) 선택했습니다. 이제 ${kind === 'meeting' ? '회의자료' : '출장복명서'}에서 HWPX 저장을 누르면 바로 사용할 수 있습니다.`);
}

async function addHwpxTemplate() {
  const file = $('hwpxTemplateFile')?.files?.[0];
  const kind = $('hwpxTemplateKind')?.value || 'both';

  if (!file) return alert('등록할 HWPX 파일을 선택하세요.');
  if (!file.name.toLowerCase().endsWith('.hwpx')) return alert('HWPX 파일만 등록할 수 있습니다.');
  if (file.size > HWPX_MAX_FILE_BYTES) {
    return alert(`템플릿 파일은 ${Math.round(HWPX_MAX_FILE_BYTES / 1024)}KB 이하만 등록할 수 있습니다. 여러 템플릿을 안전하게 저장하기 위한 제한입니다.`);
  }
  if ((data.hwpxTemplates || []).length >= HWPX_MAX_TEMPLATES) {
    return alert(`직접 등록한 템플릿은 최대 ${HWPX_MAX_TEMPLATES}개까지 저장할 수 있습니다. 사용하지 않는 템플릿을 삭제한 뒤 등록하세요.`);
  }

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const template = {
        id: uid(),
        name: file.name,
        kind,
        size: file.size,
        b64: bufToB64(reader.result),
        createdAt: new Date().toISOString(),
        createdByUid: ownerKey(),
        createdByName: data.user || ''
      };

      data.hwpxTemplates.push(template);
      data.selectedHwpxTemplateId = template.id;
      normalizeData();
      localSave();
      await saveHwpxTemplatesToCloud();
      renderHwpxTemplateControls();
      $('hwpxTemplateFile').value = '';
      alert('HWPX 템플릿을 등록했습니다. 등록한 템플릿은 같은 서비스 사용자도 공용 목록에서 사용할 수 있습니다.');
    } catch (error) {
      console.error(error);
      alert(`템플릿 저장 실패: ${error.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function deleteSelectedHwpxTemplate() {
  const template = getSelectedHwpxTemplateRaw();
  if (!template) return alert('삭제할 템플릿을 선택하세요.');
  if (template.isBuiltIn) return alert('공용 기본 초안은 프로젝트에 기본 포함되어 있어 삭제할 수 없습니다. 다른 템플릿을 선택하거나 직접 등록한 템플릿을 삭제하세요.');
  if (!confirm(`'${template.name}' 템플릿을 삭제할까요?`)) return;

  data.hwpxTemplates = data.hwpxTemplates.filter(item => item.id !== template.id);
  data.selectedHwpxTemplateId = BUILTIN_HWPX_TEMPLATES.meeting.id;
  normalizeData();
  localSave();
  await saveHwpxTemplatesToCloud();
  renderHwpxTemplateControls();
}

// 이전 HTML 버튼과의 호환 함수
function loadHwpxTemplate(file) {
  const input = $('hwpxTemplateFile');
  if (input && file) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
  }
  addHwpxTemplate();
}

function clearHwpxTemplate() {
  deleteSelectedHwpxTemplate();
}

function xmlTextEscape(text) {
  return String(text ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[char])).replace(/\n/g, '&#10;');
}

function stripHtmlText(id) {
  const target = $(id);
  if (!target) return [];
  return target.innerText.replace(/\u00a0/g, ' ').split(/\n+/).map(line => line.trim()).filter(Boolean);
}

function hwpxMap(kind, sourceId) {
  const lines = stripHtmlText(sourceId);
  const map = {
    '{{본문}}': lines.join('\n'),
    '{{회의자료}}': lines.join('\n'),
    '{{제목}}': lines[0] || '',
    '{{작성일}}': kdate(today())
  };

  if (kind === 'trip') {
    const date = $('tDate')?.value || today();
    const reportDate = $('tReportDate')?.value || date;
    map['{{출장자}}'] = $('tPerson')?.value || data.user || '';
    map['{{성명}}'] = $('tPerson')?.value || data.user || '';
    map['{{직급}}'] = $('tRank')?.value || '';
    map['{{출장지}}'] = $('tPlace')?.value || '';
    map['{{출발}}'] = `${mdate(date)} ${timeText($('tStartH')?.value || 9, $('tStartM')?.value || 0)}`;
    map['{{귀청}}'] = `${mdate(date)} ${timeText($('tEndH')?.value || 18, $('tEndM')?.value || 0)}`;
    map['{{복명}}'] = mdate(reportDate);
    map['{{복명일}}'] = kdate(reportDate);
    map['{{출장목적}}'] = $('tPurpose')?.value || '';
    map['{{수행상황}}'] = $('tBody')?.value || '';
    map['{{향후계획}}'] = $('tPlan')?.value || '';
  }

  return map;
}

function replacePlaceholders(xml, map) {
  let result = xml;
  for (const [placeholder, value] of Object.entries(map)) {
    result = result.split(placeholder).join(xmlTextEscape(value));
  }
  return result;
}

function templateHasRequiredPlaceholder(xmlText, kind) {
  const meetingPlaceholders = ['{{본문}}', '{{회의자료}}'];
  const tripPlaceholders = ['{{본문}}', '{{출장자}}', '{{성명}}', '{{출장지}}', '{{출장목적}}', '{{수행상황}}', '{{향후계획}}'];
  return (kind === 'meeting' ? meetingPlaceholders : tripPlaceholders).some(placeholder => xmlText.includes(placeholder));
}

function ensureValidXml(xml, sectionName) {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) {
    throw new Error(`${sectionName} XML 형식이 올바르지 않습니다.`);
  }
}

async function downloadHwpx(sourceId, filename, kind) {
  try {
    if (!window.JSZip) return alert('HWPX 저장에 필요한 JSZip을 불러오지 못했습니다.');

    // 선택한 템플릿이 없거나 용도가 맞지 않으면, 처음 사용자를 위해 공용 기본 초안을 자동 사용합니다.
    let template = getSelectedHwpxTemplate(kind);
    if (!template || template.isBuiltIn) template = await loadBuiltInHwpxTemplate(kind);

    const zip = await JSZip.loadAsync(b64ToBuf(template.b64));
    const sectionNames = Object.keys(zip.files).filter(name => /^Contents\/section\d+\.xml$/i.test(name));
    if (!sectionNames.length) return alert('템플릿에서 Contents/section*.xml을 찾지 못했습니다.');

    const sourceXml = await Promise.all(sectionNames.map(name => zip.file(name).async('string')));
    if (!templateHasRequiredPlaceholder(sourceXml.join('\n'), kind)) {
      alert('선택한 템플릿에 필요한 표시값이 없습니다. 손상 방지를 위해 HWPX 파일을 만들지 않았습니다. 공용 기본 초안을 선택하거나 표시값을 넣어 주세요.');
      return;
    }

    const map = hwpxMap(kind, sourceId);
    let replacementCount = 0;

    for (let index = 0; index < sectionNames.length; index++) {
      const sectionName = sectionNames[index];
      const xml = sourceXml[index];
      const replaced = replacePlaceholders(xml, map);
      ensureValidXml(replaced, sectionName);
      if (replaced !== xml) replacementCount++;
      zip.file(sectionName, replaced);
    }

    if (!replacementCount) {
      alert('표시값을 찾지 못했습니다. 템플릿의 표시값이 글자 단위로 나뉘지 않았는지 확인하세요.');
      return;
    }

    if (zip.file('Preview/PrvText.txt')) {
      zip.file('Preview/PrvText.txt', stripHtmlText(sourceId).join('\n'));
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    alert(`HWPX 저장이 완료되었습니다. 사용 템플릿: ${template.name}`);
  } catch (error) {
    console.error(error);
    alert(`HWPX 생성 오류: ${error.message}`);
  }
}
