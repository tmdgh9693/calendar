'use strict';

let currentTripEventTitle = '';
let currentTripCalendarEventId = '';
let currentEditingTripDocId = '';
let currentEditingTripDocTitle = '';
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

const TRIP_DRAFT_KEY = 'ys_aton_calendar_trip_draft_v2';
const TRIP_LEGACY_DRAFT_KEY = 'ys_aton_calendar_trip_draft_v1';

function tripExtraPeopleSnapshot() {
  return Array.from(document.querySelectorAll('#tripPeopleList .trip-person-row')).map(row => ({
    rank: row.querySelector('.trip-person-rank')?.value || '',
    name: row.querySelector('.trip-person-name')?.value || ''
  }));
}

function captureTripSnapshot() {
  return {
    version: 2,
    currentTripEventTitle,
    currentTripCalendarEventId,
    person: $('tPerson')?.value || '',
    rank: $('tRank')?.value || '',
    place: $('tPlace')?.value || '',
    date: $('tDate')?.value || '',
    endDate: $('tEndDate')?.value || '',
    reportDate: $('tReportDate')?.value || '',
    startH: Number($('tStartH')?.value || 9),
    startM: Number($('tStartM')?.value || 0),
    endH: Number($('tEndH')?.value || 18),
    endM: Number($('tEndM')?.value || 0),
    purpose: $('tPurpose')?.value || '',
    body: $('tBody')?.value || '',
    plan: $('tPlan')?.value || '',
    people: tripExtraPeopleSnapshot(),
    photos: Array.isArray(photos) ? photos.map(photo => ({ ...photo })) : []
  };
}

function normalizeTripSnapshot(snapshot = {}) {
  const legacy = snapshot || {};
  return {
    currentTripEventTitle: legacy.currentTripEventTitle || legacy.eventTitle || '',
    currentTripCalendarEventId: legacy.currentTripCalendarEventId || legacy.calendarEventId || '',
    person: legacy.person ?? legacy.tPerson ?? '',
    rank: legacy.rank ?? legacy.tRank ?? '',
    place: legacy.place ?? legacy.tPlace ?? '',
    date: legacy.date ?? legacy.tDate ?? today(),
    endDate: legacy.endDate ?? legacy.tEndDate ?? legacy.date ?? legacy.tDate ?? today(),
    reportDate: legacy.reportDate ?? legacy.tReportDate ?? legacy.date ?? legacy.tDate ?? today(),
    startH: Number(legacy.startH ?? legacy.tStartH ?? 9),
    startM: Number(legacy.startM ?? legacy.tStartM ?? 0),
    endH: Number(legacy.endH ?? legacy.tEndH ?? 18),
    endM: Number(legacy.endM ?? legacy.tEndM ?? 0),
    purpose: legacy.purpose ?? legacy.tPurpose ?? '',
    body: legacy.body ?? legacy.tBody ?? '',
    plan: legacy.plan ?? legacy.tPlan ?? '',
    people: Array.isArray(legacy.people) ? legacy.people : [],
    photos: Array.isArray(legacy.photos) ? legacy.photos.filter(photo => photo && photo.data) : []
  };
}

function applyTripSnapshot(snapshot, options = {}) {
  const draft = normalizeTripSnapshot(snapshot);

  currentTripEventTitle = draft.currentTripEventTitle || '';
  currentTripCalendarEventId = draft.currentTripCalendarEventId || '';

  const mapping = {
    tDate: draft.date,
    tEndDate: draft.endDate,
    tReportDate: draft.reportDate,
    tStartH: draft.startH,
    tStartM: draft.startM,
    tEndH: draft.endH,
    tEndM: draft.endM,
    tRank: draft.rank,
    tPerson: draft.person,
    tPlace: draft.place,
    tPurpose: draft.purpose,
    tBody: draft.body,
    tPlan: draft.plan
  };

  Object.entries(mapping).forEach(([id, value]) => {
    if ($(id)) $(id).value = value ?? '';
  });

  clearTripPeople();
  draft.people.forEach(person => addTripPerson(person.rank || '', person.name || '', {
    scroll: false,
    save: false
  }));

  photos = draft.photos.map(photo => ({ ...photo }));
  if (typeof renderPhotos === 'function') renderPhotos({ save: false });

  if (options.saveRecovery !== false) saveTripDraft();
}

function saveTripDraft() {
  try {
    localStorage.setItem(TRIP_DRAFT_KEY, JSON.stringify(captureTripSnapshot()));
  } catch (error) {
    console.warn('출장복명 자동 임시저장 실패:', error);
  }
}

function loadTripDraft() {
  try {
    const current = localStorage.getItem(TRIP_DRAFT_KEY);
    const legacy = current ? '' : localStorage.getItem(TRIP_LEGACY_DRAFT_KEY);
    const raw = current || legacy;
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return;
    applyTripSnapshot(draft, { saveRecovery: false });
    if (legacy) {
      saveTripDraft();
      localStorage.removeItem(TRIP_LEGACY_DRAFT_KEY);
    }
  } catch (error) {
    console.warn('출장복명 자동 임시저장 불러오기 실패:', error);
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

function updateTripEditUi() {
  const notice = $('tripEditNotice');
  const title = $('tripEditTitle');
  const saveButton = $('saveTripEditBtn');
  const cancelButton = $('cancelTripEditBtn');
  const editing = !!currentEditingTripDocId;

  notice?.classList.toggle('hidden', !editing);
  saveButton?.classList.toggle('hidden', !editing);
  cancelButton?.classList.toggle('hidden', !editing);
  if (title) title.textContent = currentEditingTripDocTitle || '출장복명서';
}

function setTripEditMode(docId = '', title = '') {
  currentEditingTripDocId = docId || '';
  currentEditingTripDocTitle = title || '';
  updateTripEditUi();
}

function cancelTripEdit() {
  setTripEditMode('', '');
  alert('수정 모드를 종료했습니다. 현재 입력 내용은 자동 임시저장에 남아 있습니다.');
}

async function saveTripReportEdits() {
  if (!currentEditingTripDocId) {
    alert('수정 중인 출장복명서가 없습니다. 보관함에서 수정할 자료를 선택하세요.');
    return;
  }

  const doc = (data.docs || []).find(item => item.id === currentEditingTripDocId);
  if (!doc) {
    alert('수정할 보관자료를 찾지 못했습니다.');
    setTripEditMode('', '');
    return;
  }

  if (typeof canEditDoc === 'function' && !canEditDoc(doc)) {
    alert('다른 사용자가 공유한 자료는 수정할 수 없습니다.');
    return;
  }

  await makeTrip({ askCalendar: false });
  const source = $('tripReport');
  if (!source || !source.innerText.trim()) return;

  doc.html = source.innerHTML;
  doc.tripSnapshot = captureTripSnapshot();
  doc.updated = new Date().toLocaleString();
  doc.updatedAt = new Date().toISOString();
  doc.exportKind = 'trip';

  localSave();
  if (USE_FIREBASE) {
    try {
      await upsert('docs', doc);
    } catch (error) {
      console.error('출장복명서 수정 저장 오류:', error);
      alert('이 기기에는 수정됐지만 서버 저장에는 실패했습니다.\n' + error.message);
      return;
    }
  }

  renderArchive();
  saveTripDraft();
  alert('출장복명서 수정내용을 저장했습니다.');
}

function initTripDraft() {
  refreshTripUserNames();
  bindTripDraftAutosave();
  loadTripDraft();
  updateTripEditUi();
  if (typeof refreshNamedTripDraftList === 'function') refreshNamedTripDraftList();
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


