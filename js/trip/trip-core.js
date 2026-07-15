'use strict';
// 출장자 프로필, 임시저장, 추가 인원 관리
let currentTripEventTitle = '';
let currentTripCalendarEventId = '';
function refreshTripUserNames() {
  const list = $('tripUserNames');
  if (!list) return;
  const names = Array.from(new Set([...(data.users || []), data.user].filter(Boolean))).sort();
  list.innerHTML = names.map(name => `<option value="${esc(name)}"></option>`).join('');
}

function rankForUserName(name) {
  const key = String(name || '').trim();
  return data.userRanks?.[key] || '';
}

function autofillMainTripRank(name) {
  const rank = rankForUserName(name);
  if (rank && $('tRank')) $('tRank').value = rank;
}

function autofillAddedTripRank(input) {
  const row = input.closest('.trip-person-row');
  const rank = rankForUserName(input.value);
  if (rank && row) row.querySelector('.trip-person-rank').value = rank;
  saveTripDraft();
}

const TRIP_DRAFT_KEY = 'ys_aton_calendar_trip_draft_v1';

function saveTripDraft() {
  try {
    const people = Array.from(document.querySelectorAll('#tripPeopleList .trip-person-row')).map(row => ({
      rank: row.querySelector('.trip-person-rank')?.value || '',
      name: row.querySelector('.trip-person-name')?.value || ''
    }));

    const draft = {
      currentTripEventTitle,
      currentTripCalendarEventId,
      tDate: $('tDate')?.value || '',
      tEndDate: $('tEndDate')?.value || '',
      tReportDate: $('tReportDate')?.value || '',
      tStartH: $('tStartH')?.value || '',
      tStartM: $('tStartM')?.value || '',
      tEndH: $('tEndH')?.value || '',
      tEndM: $('tEndM')?.value || '',
      tRank: $('tRank')?.value || '',
      tPerson: $('tPerson')?.value || '',
      tPlace: $('tPlace')?.value || '',
      tPurpose: $('tPurpose')?.value || '',
      tBody: $('tBody')?.value || '',
      tPlan: $('tPlan')?.value || '',
      people,
      photos: Array.isArray(photos) ? photos : []
    };

    localStorage.setItem(TRIP_DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn('출장복명 임시저장 실패:', error);
  }
}

function loadTripDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY) || '{}');
    if (!draft || typeof draft !== 'object') return;

    currentTripEventTitle = draft.currentTripEventTitle || '';
    currentTripCalendarEventId = draft.currentTripCalendarEventId || '';

    ['tDate', 'tEndDate', 'tReportDate', 'tStartH', 'tStartM', 'tEndH', 'tEndM', 'tRank', 'tPerson', 'tPlace', 'tPurpose', 'tBody', 'tPlan'].forEach(id => {
      if ($(id) && draft[id] !== undefined) $(id).value = draft[id];
    });

    clearTripPeople();
    (draft.people || []).forEach(person => addTripPerson(person.rank || '', person.name || '', { scroll: false, save: false }));

    photos = Array.isArray(draft.photos) ? draft.photos.filter(photo => photo && photo.data) : [];
    renderPhotos({ save: false });
  } catch (error) {
    console.warn('출장복명 임시저장 불러오기 실패:', error);
  }
}

function bindTripDraftAutosave() {
  ['tDate', 'tEndDate', 'tReportDate', 'tStartH', 'tStartM', 'tEndH', 'tEndM', 'tRank', 'tPerson', 'tPlace', 'tPurpose', 'tBody', 'tPlan'].forEach(id => {
    const el = $(id);
    if (!el || el.dataset.tripAutosave === '1') return;
    el.dataset.tripAutosave = '1';
    el.addEventListener('input', saveTripDraft);
    el.addEventListener('change', saveTripDraft);
  });
}

function initTripDraft() {
  refreshTripUserNames();
  bindTripDraftAutosave();
  loadTripDraft();
}

function getTripPeople() {
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

function renderTripPeople() {
  const list = $('tripPeopleList');
  if (!list) return;

  list.querySelectorAll('.trip-person-row').forEach((row, index) => {
    const label = row.querySelector('.trip-person-number');
    if (label) label.textContent = `추가 ${index + 1}`;
  });
}

function addTripPerson(rank = '해양수산', name = '', options = {}) {
  const list = $('tripPeopleList');
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'trip-person-row';
  row.innerHTML = `
    <span class="trip-person-number">추가</span>
    <div>
      <label>직급</label>
      <input class="trip-person-rank" value="${esc(rank || '')}" placeholder="직급" oninput="saveTripDraft()">
    </div>
    <div>
      <label>성명</label>
      <input class="trip-person-name" list="tripUserNames" value="${esc(name || '')}" placeholder="성명" oninput="autofillAddedTripRank(this)">
    </div>
    <button class="d" type="button" onclick="this.closest('.trip-person-row').remove(); renderTripPeople(); saveTripDraft();">삭제</button>
  `;
  list.appendChild(row);
  renderTripPeople();

  if (options.save !== false) saveTripDraft();
  if (options.scroll !== false) {
    setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
}

function clearTripPeople() {
  if ($('tripPeopleList')) $('tripPeopleList').innerHTML = '';
}

function tripPeopleText() {
  return getTripPeople()
    .map(person => [person.rank, person.name].filter(Boolean).join('  '))
    .filter(Boolean)
    .join('<br>');
}

function tripPeopleSignText() {
  return getTripPeople()
    .map(person => `성명&nbsp;&nbsp;${esc(person.name || '')}&nbsp;&nbsp;(인)`)
    .join('<br>');
}


