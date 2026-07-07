// js/utils.js
// 앱 공통 상태, 날짜/문자열 함수, 화면 탭/테마 처리

const KEY = 'ys_aton_calendar_v13_firebase';
const LEGACY_KEYS = ['ys_aton_calendar_v12_firebase'];

let data = {
  users: [],
  userColors: {},
  user: '',
  uid: '',
  events: [],
  docs: [],
  hwpxTemplates: [],
  selectedHwpxTemplateId: ''
};

let month = new Date();
let photos = [];

const $ = id => document.getElementById(id);

function uid() {
  return 'id_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

function localDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function today() {
  return localDate(new Date());
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function nl(value) {
  return esc(value).replace(/\n/g, '<br>');
}

function normalizeData() {
  data = data && typeof data === 'object' ? data : {};
  data.users = Array.isArray(data.users) ? data.users : [];
  data.userColors = data.userColors && typeof data.userColors === 'object' ? data.userColors : {};
  data.user = data.user || '';
  data.uid = data.uid || '';
  data.events = Array.isArray(data.events) ? data.events : [];
  data.docs = Array.isArray(data.docs) ? data.docs : [];

  // 이전 버전의 단일 템플릿을 여러 템플릿 구조로 자동 이전합니다.
  if (!Array.isArray(data.hwpxTemplates)) {
    data.hwpxTemplates = [];
  }

  if (data.hwpxTemplate && data.hwpxTemplate.b64 && !data.hwpxTemplates.length) {
    data.hwpxTemplates.push({
      id: uid(),
      name: data.hwpxTemplate.name || '기존 HWPX 템플릿',
      kind: 'both',
      size: data.hwpxTemplate.size || 0,
      b64: data.hwpxTemplate.b64,
      createdAt: new Date().toISOString(),
      createdByUid: data.uid || '',
      createdByName: data.user || ''
    });
  }

  data.hwpxTemplates = data.hwpxTemplates
    .filter(template => template && template.id && template.name && template.b64)
    .slice(0, 4);

  const builtInSelection = /^builtin-hwpx-(meeting|trip)-v1$/.test(String(data.selectedHwpxTemplateId || ''));
  if (!data.selectedHwpxTemplateId || (!builtInSelection && !data.hwpxTemplates.some(template => template.id === data.selectedHwpxTemplateId))) {
    data.selectedHwpxTemplateId = data.hwpxTemplates[0]?.id || 'builtin-hwpx-meeting-v1';
  }

  // 호환성용 값: 예전 코드가 참조해도 현재 선택 템플릿을 반환하도록 유지합니다.
  data.hwpxTemplate = getSelectedHwpxTemplateRaw() || null;
}

function localSave() {
  normalizeData();
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('브라우저 저장 실패:', error);
  }
}

function load() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_KEYS) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }

    if (raw) {
      data = { ...data, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.warn('로컬 저장 데이터 불러오기 실패:', error);
  }

  normalizeData();
}

function ownerKey() {
  return data.uid || data.user;
}

function getCurrentUserColor() {
  const inputColor = $('userColor')?.value;
  return inputColor || data.userColors?.[ownerKey()] || '#2563eb';
}

function getEventOwnerColor(event) {
  const ownerUid = event.sourceOwnerUid || event.createdByUid || event.ownerUid;
  return (
    event.sourceOwnerColor ||
    event.createdByColor ||
    event.ownerColor ||
    data.userColors?.[ownerUid] ||
    '#64748b'
  );
}

function mine(event) {
  return (
    event.scope === '과' ||
    event.ownerUid === ownerKey() ||
    event.createdByUid === ownerKey() ||
    event.owner === data.user ||
    (!event.owner && event.person === data.user)
  );
}

function inR(value, start, end) {
  return (!start || value >= start) && (!end || value <= end);
}

function sortEv(a, b) {
  const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCompare) return dateCompare;

  const timeA = String(a.startH ?? 0).padStart(2, '0') + String(a.startM ?? 0).padStart(2, '0');
  const timeB = String(b.startH ?? 0).padStart(2, '0') + String(b.startM ?? 0).padStart(2, '0');
  return timeA.localeCompare(timeB);
}

function opts(start, end, selectedValue) {
  let html = '';
  for (let i = start; i < end; i++) {
    html += `<option value="${i}" ${Number(selectedValue) === i ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`;
  }
  return html;
}

function setHM(prefix, hour = 9, minute = 0) {
  const hourEl = $(prefix + 'H');
  const minuteEl = $(prefix + 'M');
  if (!hourEl || !minuteEl) return;
  hourEl.innerHTML = opts(0, 24, hour);
  minuteEl.innerHTML = opts(0, 60, minute);
}

function getHM(prefix) {
  return {
    h: Number($(prefix + 'H')?.value || 0),
    m: Number($(prefix + 'M')?.value || 0)
  };
}

function hm(event) {
  return `${String(event.startH ?? 0).padStart(2, '0')}:${String(event.startM ?? 0).padStart(2, '0')}`;
}

function timeText(hour, minute) {
  return `${Number(hour)}시 ${String(Number(minute)).padStart(2, '0')}분`;
}

function kdate(value) {
  if (!value) return '';
  const [year, monthValue, day] = String(value).split('-');
  return `${year}년 ${Number(monthValue)}월 ${Number(day)}일`;
}

function mdate(value) {
  if (!value) return '';
  const [, monthValue, day] = String(value).split('-');
  return `${Number(monthValue)}월 ${Number(day)}일`;
}

function normForKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function setTheme(tabId) {
  document.body.classList.remove('theme-personal', 'theme-dept', 'theme-meeting', 'theme-trip', 'theme-archive', 'theme-settings');
  document.body.classList.add(`theme-${tabId || 'personal'}`);
}

function tab(id, button) {
  document.querySelectorAll('.tab').forEach(section => section.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(navButton => navButton.classList.remove('active'));
  button?.classList.add('active');
  setTheme(id);
  render();
}
