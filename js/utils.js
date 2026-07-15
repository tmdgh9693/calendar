const KEY = 'ys_aton_calendar_v12_firebase';

let data = {
  users: [],
  userColors: {},
  user: '',
  uid: '',
  events: [],
  docs: [],
  hwpxTemplates: { meeting: [], trip: [] },
  hwpxTemplateSelections: { meeting: '', trip: '' },
  deletedEventIds: [],
  deletedDocIds: [],
  deletedHwpxTemplateIds: [],
  hwpxTemplate: null
};

let month = new Date();
let photos = [];

const $ = id => document.getElementById(id);

function uid() {
  return 'id_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

function localDate(date) {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

function today() {
  return localDate(new Date());
}

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[match]));
}

function nl(value) {
  return esc(value).replace(/\n/g, '<br>');
}

function localSave() {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      users: data.users,
      user: data.user,
      uid: data.uid,
      userColors: data.userColors,
      userRanks: data.userRanks,
      events: data.events,
      docs: data.docs,
      hwpxTemplates: data.hwpxTemplates,
      hwpxTemplateSelections: data.hwpxTemplateSelections,
      deletedEventIds: data.deletedEventIds,
      deletedDocIds: data.deletedDocIds,
      deletedHwpxTemplateIds: data.deletedHwpxTemplateIds,
      hwpxTemplate: data.hwpxTemplate
    })
  );
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};

    data.users = saved.users || data.users || [];
    data.user = saved.user || data.user || '';
    data.uid = saved.uid || data.uid || '';
    data.userColors = saved.userColors || data.userColors || {};
    data.userRanks = saved.userRanks || data.userRanks || {};
    data.events = saved.events || data.events || [];
    data.docs = saved.docs || data.docs || [];
    data.hwpxTemplates = saved.hwpxTemplates || data.hwpxTemplates || { meeting: [], trip: [] };
    data.hwpxTemplateSelections = saved.hwpxTemplateSelections || data.hwpxTemplateSelections || { meeting: '', trip: '' };
    data.deletedEventIds = saved.deletedEventIds || data.deletedEventIds || [];
    data.deletedDocIds = saved.deletedDocIds || data.deletedDocIds || [];
    data.deletedHwpxTemplateIds = saved.deletedHwpxTemplateIds || data.deletedHwpxTemplateIds || [];
    data.hwpxTemplate = saved.hwpxTemplate || data.hwpxTemplate || null;
  } catch (error) {
    console.warn('로컬 저장 데이터 불러오기 실패:', error);
  }

  data.users = data.users || [];
  data.userRanks = data.userRanks || {};
  data.events = data.events || [];
  data.docs = data.docs || [];
  data.hwpxTemplates = data.hwpxTemplates || { meeting: [], trip: [] };
  data.hwpxTemplateSelections = data.hwpxTemplateSelections || { meeting: '', trip: '' };
  data.deletedEventIds = Array.isArray(data.deletedEventIds) ? data.deletedEventIds : [];
  data.deletedDocIds = Array.isArray(data.deletedDocIds) ? data.deletedDocIds : [];
  data.deletedHwpxTemplateIds = Array.isArray(data.deletedHwpxTemplateIds) ? data.deletedHwpxTemplateIds : [];
  data.hwpxTemplate = data.hwpxTemplate || null;
}

function ownerKey() {
  return data.uid || data.user;
}

function mine(event) {
  return (
    event.scope === '과' ||
    event.ownerUid === ownerKey() ||
    event.owner === data.user ||
    (!event.owner && event.person === data.user)
  );
}

function inR(value, start, end) {
  return (!start || value >= start) && (!end || value <= end);
}

function sortEv(a, b) {
  const dateCompare = (a.date || '').localeCompare(b.date || '');

  if (dateCompare !== 0) return dateCompare;

  const aTime =
    String(a.startH || 0).padStart(2, '0') +
    String(a.startM || 0).padStart(2, '0');

  const bTime =
    String(b.startH || 0).padStart(2, '0') +
    String(b.startM || 0).padStart(2, '0');

  return aTime.localeCompare(bTime);
}

function opts(start, end, selectedValue) {
  let html = '';

  for (let i = start; i < end; i++) {
    html += `
      <option value="${i}" ${Number(selectedValue) === i ? 'selected' : ''}>
        ${String(i).padStart(2, '0')}
      </option>
    `;
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
  return (
    String(event.startH || 0).padStart(2, '0') +
    ':' +
    String(event.startM || 0).padStart(2, '0')
  );
}

function timeText(hour, minute) {
  return (
    Number(hour) +
    '시 ' +
    String(Number(minute)).padStart(2, '0') +
    '분'
  );
}

function kdate(value) {
  if (!value) return '';

  const [year, month, day] = value.split('-');

  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function mdate(value) {
  if (!value) return '';

  const [year, month, day] = value.split('-');

  return `${Number(month)}월 ${Number(day)}일`;
}

function normForKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function setTheme(tabId) {
  document.body.classList.remove(
    'theme-personal',
    'theme-dept',
    'theme-meeting',
    'theme-trip',
    'theme-archive',
    'theme-settings'
  );

  switch (tabId) {
    case 'personal':
      document.body.classList.add('theme-personal');
      break;
    case 'dept':
      document.body.classList.add('theme-dept');
      break;
    case 'meeting':
      document.body.classList.add('theme-meeting');
      break;
    case 'trip':
      document.body.classList.add('theme-trip');
      break;
    case 'archive':
      document.body.classList.add('theme-archive');
      break;
    case 'settings':
      document.body.classList.add('theme-settings');
      break;
    default:
      document.body.classList.add('theme-personal');
  }
}

const VALID_TABS = new Set(['personal', 'dept', 'monthlySchedule', 'meeting', 'trip', 'archive', 'settings']);

function requestedTab() {
  return 'personal';
}

function tab(id, button, options = {}) {
  const targetId = VALID_TABS.has(id) && $(id) ? id : 'personal';

  document.querySelectorAll('.tab').forEach(section => {
    section.classList.toggle('hidden', section.id !== targetId);
  });

  document.querySelectorAll('[data-tab]').forEach(tabButton => {
    const active = tabButton.dataset.tab === targetId;
    tabButton.classList.toggle('active', active);
    tabButton.setAttribute('aria-current', active ? 'page' : 'false');
    if (tabButton.classList.contains('nav-link')) {
      tabButton.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });

  if (!options.skipHash && location.hash !== `#${targetId}`) {
    history.replaceState(null, '', `#${targetId}`);
  }

  setTheme(targetId);
  if (typeof render === 'function') render(targetId);

  if (options.scrollTop !== false) {
    window.scrollTo({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
  }
}

function markLocalDeleted(listName, ids) {
  const current = Array.isArray(data[listName]) ? data[listName] : [];
  const unique = new Set(current);
  (Array.isArray(ids) ? ids : [ids]).filter(Boolean).forEach(id => unique.add(String(id)));
  data[listName] = [...unique].slice(-500);
}

function unmarkLocalDeleted(listName, ids) {
  const remove = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String));
  data[listName] = (Array.isArray(data[listName]) ? data[listName] : [])
    .filter(id => !remove.has(String(id)));
}
