const KEY = 'ys_aton_calendar_v12_firebase';

let data = {
  users: [],
  user: '',
  uid: '',
  events: [],
  docs: [],
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
      user: data.user,
      uid: data.uid
    })
  );
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};

    data.user = saved.user || data.user || '';
    data.uid = saved.uid || data.uid || '';
  } catch (error) {
    console.warn('로컬 저장 데이터 불러오기 실패:', error);
  }

  data.users = data.users || [];
  data.events = data.events || [];
  data.docs = data.docs || [];
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

function tab(id, button) {
  document.querySelectorAll('.tab').forEach(section => {
    section.classList.add('hidden');
  });

  if ($(id)) {
    $(id).classList.remove('hidden');
  }

  document.querySelectorAll('nav button').forEach(navButton => {
    navButton.classList.remove('active');
  });

  if (button) {
    button.classList.add('active');
  }

  setTheme(id);
  render();
}