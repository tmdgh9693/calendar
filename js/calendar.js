function usesTripReportStatus(event) {
  // 내 캘린더와 과 캘린더 모두 동일한 고정 칸에서 완료 상태를 표시합니다.
  return !!event && (event.scope === '개인' || event.scope === '과');
}

function isTripReportCompleted(event) {
  if (!event) return false;

  // 내 캘린더는 일정 수정창에서 사용자가 직접 지정한 완료 상태를 사용합니다.
  if (event.scope === '개인') {
    return event.workCompleted === true;
  }

  // 과 캘린더는 상태 확인 전용입니다. 출장복명 작성 완료를 우선 표시하고,
  // 개인 일정에서 과 캘린더로 반영된 경우에는 개인 일정의 완료 상태를 표시합니다.
  if (event.tripReportCompleted === true || event.sourceType === 'tripReport') return true;
  return event.workCompleted === true;
}

function tripReportStatusHtml(event) {
  const applies = usesTripReportStatus(event);
  if (!applies) return '<span class="trip-report-status-slot" aria-hidden="true"></span>';

  const completed = isTripReportCompleted(event);
  const stateClass = completed ? 'is-complete' : 'is-pending';
  const label = completed ? '완료' : '미완료';

  return `
    <span class="trip-report-status-slot">
      <span class="trip-report-status ${stateClass}" title="${label}" aria-label="${label}">${completed ? '✓' : ''}</span>
    </span>`;
}

function setEventCompletionField(scope, completed = false, editable = true) {
  const row = $('evCompletionRow');
  const input = $('evWorkCompleted');
  const isPersonalEvent = scope === '개인';

  // 완료 상태 변경은 내 캘린더 일정에서만 허용합니다.
  // 과 캘린더에서는 캘린더 칸의 완료 표시만 확인할 수 있습니다.
  if (row) row.classList.toggle('hidden', !isPersonalEvent);
  if (input) {
    input.checked = isPersonalEvent && !!completed;
    input.disabled = !isPersonalEvent || !editable;
  }
}


function eventRankForName(name) {
  const key = String(name || '').trim();
  return key ? String(data.userRanks?.[key] || '') : '';
}

function refreshEventUserNames() {
  const list = $('eventUserNames');
  if (!list) return;
  const names = new Set();
  if (data.user) names.add(String(data.user).trim());
  Object.keys(data.userRanks || {}).forEach(key => {
    const value = String(key || '').trim();
    if (value && !/^[A-Za-z0-9_-]{20,}$/.test(value)) names.add(value);
  });
  (data.events || []).forEach(event => {
    if (event.person) names.add(String(event.person).trim());
    (event.people || []).forEach(person => { if (person?.name) names.add(String(person.name).trim()); });
  });
  list.innerHTML = [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,'ko')).map(name => `<option value="${esc(name)}"></option>`).join('');
}

function autofillEventMainRank() {
  // 대표 담당자는 기존 데이터 구조상 성명만 저장합니다. 추가 인원 입력 시 직급을 자동 채웁니다.
}

function autofillEventPersonRank(input) {
  const row = input?.closest('.event-person-row');
  const rank = eventRankForName(input?.value);
  if (row && rank) row.querySelector('.event-person-rank').value = rank;
}

function addEventPerson(rank = '', name = '', options = {}) {
  const list = $('evPeopleList');
  if (!list) return;
  refreshEventUserNames();
  const row = document.createElement('div');
  row.className = 'event-person-row';
  row.innerHTML = `
    <input class="event-person-rank" value="${esc(rank)}" placeholder="직급" aria-label="추가 참여자 직급">
    <input class="event-person-name" value="${esc(name)}" placeholder="성명" list="eventUserNames" aria-label="추가 참여자 성명" oninput="autofillEventPersonRank(this)">
    <button class="d event-person-remove" type="button" aria-label="참여 인원 삭제">삭제</button>`;
  row.querySelector('.event-person-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
  if (options.focus !== false) row.querySelector('.event-person-name')?.focus();
}

function clearEventPeople() {
  const list = $('evPeopleList');
  if (list) list.innerHTML = '';
}

function fillEventPeople(people = []) {
  clearEventPeople();
  (Array.isArray(people) ? people : []).forEach(person => {
    addEventPerson(person?.rank || '', person?.name || '', { focus: false });
  });
}

function readEventPeople() {
  return [...document.querySelectorAll('#evPeopleList .event-person-row')]
    .map(row => ({
      rank: row.querySelector('.event-person-rank')?.value.trim() || '',
      name: row.querySelector('.event-person-name')?.value.trim() || ''
    }))
    .filter(person => person.rank || person.name);
}

function moveMonth(direction) {
  month.setMonth(month.getMonth() + direction);
  render();
}

function canEditEvent(event) {
  if (!event) return false;
  const me = ownerKey();
  return !!me && (
    event.ownerUid === me ||
    event.sourceOwnerUid === me ||
    event.createdByUid === me
  );
}

function setEventModalEditable(editable) {
  const saveButton = $('saveEventBtn');
  const deleteButton = $('deleteEventBtn');
  if (saveButton) saveButton.classList.toggle('hidden', !editable);
  if (deleteButton) deleteButton.classList.toggle('hidden', !editable);
}

function openEvent(scope, date, id = '') {
  $('modal').classList.remove('hidden');
  $('evScope').value = scope;

  if (id) {
    const event = data.events.find(item => item.id === id);
    fillEvent(event);
    return;
  }

  setEventModalEditable(true);

  $('modalTitle').innerText =
    (scope === '개인' ? '내 일정' : '과 일정') + ' 등록';

  $('evId').value = '';
  $('evType').value = '출장';
  $('evPerson').value = scope === '개인' ? data.user : '';
  $('evTitle').value = '';
  $('evPlace').value = '';
  refreshEventUserNames();
  clearEventPeople();
  setEventCompletionField(scope, false, true);

  $('evDate').value = date || today();
  $('evEndDate').value = date || today();
  setHM('evStart', 9, 0);
  setHM('evEnd', 18, 0);

  $('evDeptReflect').checked = scope === '개인';
  $('evDeptReflect').disabled = scope === '과';

  $('evMeetingInclude').checked = true;
  $('evPart').value = '자동';
  $('evSummary').value = '';
  $('evResult').value = '';
  $('evPlan').value = '';
}

function closeModal() {
  $('modal').classList.add('hidden');
}

function fillEvent(event) {
  if (!event) return;

  const editable = canEditEvent(event);
  setEventModalEditable(editable);

  $('modalTitle').innerText =
    (event.scope === '개인' ? '내 일정' : '과 일정') + (editable ? ' 수정' : ' 보기');

  $('evId').value = event.id;
  $('evScope').value = event.scope;
  $('evDate').value = event.date || today();
  $('evEndDate').value = event.endDate || event.date || today();
  $('evType').value = event.type;
  $('evPerson').value = event.person;
  $('evTitle').value = event.title;
  $('evPlace').value = event.place;
  refreshEventUserNames();
  fillEventPeople(event.people || []);

  $('evDeptReflect').checked = !!event.deptReflect;
  $('evDeptReflect').disabled = event.scope === '과';

  $('evMeetingInclude').checked = !!event.meetingInclude;
  $('evPart').value = event.part || '자동';
  $('evSummary').value = event.summary || '';
  $('evResult').value = event.result || '';
  $('evPlan').value = event.plan || '';
  setEventCompletionField(event.scope, isTripReportCompleted(event), editable);

  setHM('evStart', event.startH ?? 9, event.startM ?? 0);
  setHM('evEnd', event.endH ?? 18, event.endM ?? 0);
}

function readEvent() {
  const start = getHM('evStart');
  const end = getHM('evEnd');
  const scope = $('evScope').value;

  const event = {
    id: $('evId').value || uid(),
    scope,
    owner: scope === '개인' ? data.user : '과',
    ownerUid: ownerKey(),
    createdByUid: ownerKey(),
    sourceOwnerUid: scope === '과' ? ownerKey() : '',
    visibleTo: scope === '개인' ? [ownerKey()] : ['dept', ownerKey()],
    sourceId: null,

    date: $('evDate').value || today(),
    endDate: $('evEndDate').value || $('evDate').value || today(),
    startH: start.h,
    startM: start.m,
    endH: end.h,
    endM: end.m,

    type: $('evType').value,
    person: $('evPerson').value.trim() || (scope === '개인' ? data.user : ''),
    title: $('evTitle').value.trim() || '제목 없음',
    place: $('evPlace').value.trim(),
    people: readEventPeople(),

    deptReflect: $('evDeptReflect').checked,
    meetingInclude: $('evMeetingInclude').checked,
    part: $('evPart').value,

    summary: $('evSummary').value.trim(),
    result: $('evResult').value.trim(),
    plan: $('evPlan').value.trim(),

    updatedAt: new Date().toISOString()
  };

  if (scope === '개인') {
    event.workCompleted = !!$('evWorkCompleted')?.checked;
  }

  return event;
}

async function saveEvent() {
  if (!confirm('작성한 일정을 저장하시겠습니까?')) return;

  const event = readEvent();

  const startAt = new Date(`${event.date}T${String(event.startH).padStart(2, '0')}:${String(event.startM).padStart(2, '0')}:00`);
  const endAt = new Date(`${event.endDate}T${String(event.endH).padStart(2, '0')}:${String(event.endM).padStart(2, '0')}:00`);
  if (endAt < startAt) {
    alert('종료 일시는 시작 일시보다 빠를 수 없습니다.');
    return;
  }

  const previous = data.events.find(item => item.id === event.id);

  if (previous) {
    [
      'sourceId', 'sourceType',
      'tripReportCompleted', 'tripReportCompletedAt', 'tripReportUpdatedAt',
      'tripReportDate', 'tripReportOwnerUid', 'tripReportOwner',
      'tripReportTitle', 'tripReportPurpose', 'tripReportResult', 'tripReportPlan',
      'tripPhotos'
    ].forEach(key => {
      if (previous[key] !== undefined) event[key] = previous[key];
    });
  }

  if (event.scope === '개인') {
    const now = new Date().toISOString();
    const completed = !!event.workCompleted;
    const previousCompleted = previous ? previous.workCompleted === true : false;
    const completionChanged = !previous || completed !== previousCompleted;

    if (completionChanged) {
      event.workCompleted = completed;
      event.workCompletedAt = completed ? (previous?.workCompletedAt || now) : null;
      event.workCompletedUpdatedAt = now;
      event.workCompletedByUid = ownerKey();
      event.workCompletedBy = data.user || '';
      event.workCompletedSource = 'personal-calendar';
    } else if (previous) {
      [
        'workCompleted', 'workCompletedAt', 'workCompletedUpdatedAt',
        'workCompletedByUid', 'workCompletedBy', 'workCompletedSource'
      ].forEach(key => {
        if (previous[key] !== undefined) event[key] = previous[key];
      });
    }
  } else if (previous) {
    // 과 캘린더 일정 수정창에서는 완료 상태를 변경하지 않습니다.
    // 기존의 출장복명/개인 일정 반영 완료 정보는 그대로 보존합니다.
    [
      'workCompleted', 'workCompletedAt', 'workCompletedUpdatedAt',
      'workCompletedByUid', 'workCompletedBy', 'workCompletedSource'
    ].forEach(key => {
      if (previous[key] !== undefined) event[key] = previous[key];
    });
  }

  if (previous && !canEditEvent(previous)) {
    alert('다른 사용자의 공유 일정은 수정할 수 없습니다.');
    return;
  }

  const index = data.events.findIndex(item => item.id === event.id);
  const oldMirrors = data.events
    .filter(item => item.scope === '과' && item.sourceId === event.id)
    .map(item => item.id);

  data.events = data.events.filter(item => !oldMirrors.includes(item.id));

  if (index >= 0) {
    data.events = data.events.filter(item => item.id !== event.id);
  }
  data.events.push(event);

  if (event.scope === '개인') {
    syncDept(event);
  }

  unmarkLocalDeleted('deletedEventIds', [event.id, ...oldMirrors]);
  localSave();
  closeModal();
  render();

  if (USE_FIREBASE) {
    try {
      await Promise.all([
        ...oldMirrors.map(id => removeCloud('events', id)),
        ...data.events
          .filter(item => item.id === event.id || item.sourceId === event.id)
          .map(item => upsert('events', item))
      ]);
    } catch (error) {
      console.error('일정 서버 저장 오류:', error);
      alert('일정은 이 기기에 저장됐지만 서버 반영에는 실패했습니다. Firestore 규칙을 확인하세요.\n' + error.message);
      return;
    }
  }

  alert('저장되었습니다.');
}

function syncDept(personalEvent) {
  data.events = data.events.filter(
    item => !(item.scope === '과' && item.sourceId === personalEvent.id)
  );

  if (!personalEvent.deptReflect) return;

  data.events.push({
    ...personalEvent,
    id: uid(),
    scope: '과',
    owner: '과',
    ownerUid: personalEvent.ownerUid,
    createdByUid: personalEvent.createdByUid || personalEvent.ownerUid,
    sourceOwnerUid: personalEvent.ownerUid,
    sourceOwner: personalEvent.owner,
    visibleTo: ['dept', personalEvent.ownerUid],
    sourceId: personalEvent.id,
    deptReflect: false,
    updatedAt: new Date().toISOString()
  });
}

async function deleteEvent() {
  const id = $('evId').value;

  if (!id) {
    alert('삭제할 일정이 없습니다.');
    return;
  }

  const target = data.events.find(item => item.id === id);
  if (!target) return;

  if (!canEditEvent(target)) {
    alert('다른 사용자의 공유 일정은 삭제할 수 없습니다.');
    return;
  }

  if (!confirm('삭제하시겠습니까?')) return;

  const deleteIds = data.events
    .filter(item =>
      item.id === id ||
      (target.scope === '개인' && item.sourceId === id)
    )
    .map(item => item.id);

  data.events = data.events.filter(item => !deleteIds.includes(item.id));
  markLocalDeleted('deletedEventIds', deleteIds);
  localSave();
  closeModal();
  render();

  if (USE_FIREBASE) {
    try {
      await Promise.all(deleteIds.map(eventId => removeCloud('events', eventId)));
    } catch (error) {
      console.error('일정 서버 삭제 오류:', error);
      alert('이 기기에서는 삭제됐지만 서버 삭제에는 실패했습니다. 다른 기기에는 남아 있을 수 있습니다.\n' + error.message);
      return;
    }
  }

  alert('일정을 삭제했습니다.');
}

let renderFrameId = 0;

function activeTabId() {
  return document.querySelector('.tab:not(.hidden)')?.id || 'personal';
}

function renderActiveView(targetId = activeTabId()) {
  switch (targetId) {
    case 'personal':
      renderCal('개인');
      break;
    case 'dept':
      renderCal('과');
      break;
    case 'monthlySchedule':
      if (typeof renderMonthlySchedule === 'function') renderMonthlySchedule();
      break;
    case 'trip':
      if (typeof tripOptions === 'function') tripOptions();
      break;
    case 'archive':
      if (typeof renderArchive === 'function') renderArchive();
      break;
    default:
      break;
  }
}

function render(targetId = '') {
  if (renderFrameId) cancelAnimationFrame(renderFrameId);
  renderFrameId = requestAnimationFrame(() => {
    renderFrameId = 0;
    renderActiveView(targetId || activeTabId());
  });
}

function renderCal(scope) {
  const titleEl = scope === '개인' ? $('personalTitle') : $('deptTitle');
  const calEl = scope === '개인' ? $('personalCal') : $('deptCal');

  if (!titleEl || !calEl) return;

  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  titleEl.innerText =
    (scope === '개인' ? '내 캘린더' : '과 캘린더') +
    ` · ${year}년 ${monthIndex + 1}월`;

  const first = new Date(year, monthIndex, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const visibleStart = localDate(start);
  const visibleEndDate = new Date(start);
  visibleEndDate.setDate(start.getDate() + 41);
  const visibleEnd = localDate(visibleEndDate);

  const eventsByDate = new Map();
  (data.events || [])
    .filter(event => event.scope === scope && (scope === '과' || mine(event)))
    .forEach(event => {
      const eventStart = String(event.date || '');
      const eventEnd = String(event.endDate || event.date || '');
      if (!eventStart || eventEnd < visibleStart || eventStart > visibleEnd) return;

      const cursor = new Date((eventStart < visibleStart ? visibleStart : eventStart) + 'T00:00:00');
      const last = new Date((eventEnd > visibleEnd ? visibleEnd : eventEnd) + 'T00:00:00');
      let guard = 0;
      while (cursor <= last && guard < 42) {
        const date = localDate(cursor);
        if (!eventsByDate.has(date)) eventsByDate.set(date, []);
        eventsByDate.get(date).push(event);
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    });
  eventsByDate.forEach(events => events.sort(sortEv));

  let html = ['일', '월', '화', '수', '목', '금', '토']
    .map(day => `<div class="dayname">${day}</div>`)
    .join('');

  for (let i = 0; i < 42; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);

    const date = localDate(current);
    const isOtherMonth = current.getMonth() !== monthIndex;
    const events = eventsByDate.get(date) || [];

    html += `
      <div class="cell ${isOtherMonth ? 'other' : ''}" onclick="openEvent('${scope}', '${date}')">
        <div class="date">${current.getDate()}</div>
    `;

    events.slice(0, 5).forEach(event => {
      const colorClass = eventTypeClass(event.type);
      const ownerColor = scope === '과'
        ? data.userColors?.[event.sourceOwnerUid || event.ownerUid] || ''
        : '';
      const colorStyle = ownerColor
        ? `style="border-left:6px solid ${ownerColor}; background:${ownerColor}22;"`
        : '';

      html += `
        <div class="event ${colorClass}" ${colorStyle}
          onclick="event.stopPropagation();openEvent('${scope}', '${date}', '${event.id}')">
          <span class="event-owner-dot" style="background:${ownerColor || '#94a3b8'}"></span>
          <span class="event-label">${hm(event)} ${esc(event.person || '')} · ${esc(event.title)}</span>
          ${tripReportStatusHtml(event)}
          <span class="meeting-include-slot">${event.meetingInclude ? '<span class="meeting-include-dot" title="회의자료 포함">●</span>' : ''}</span>
        </div>`;
    });

    if (events.length > 5) {
      html += `<button type="button" class="small more-events-button" onclick="event.stopPropagation();showDayEvents('${scope}','${date}')">+${events.length - 5}건 · 전체보기</button>`;
    }

    html += `</div>`;
  }

  calEl.innerHTML = html;
}

function eventTypeClass(type) {
  switch (type) {
    case '출장':
      return 'trip';
    case '점검':
      return 'check';
    case '공사':
      return 'work';
    case '보고':
      return 'report';
    case '회의':
      return 'meeting-event';
    case '행사':
      return 'event-ceremony';
    default:
      return '';
  }
}
function closeDayEvents() {
  document.getElementById('dayEventsOverlay')?.remove();
}

function showDayEvents(scope, date) {
  closeDayEvents();
  const events = (data.events || [])
    .filter(event =>
      event.scope === scope &&
      date >= String(event.date || '') &&
      date <= String(event.endDate || event.date || '') &&
      (scope === '과' || mine(event))
    )
    .sort(sortEv);

  const overlay = document.createElement('div');
  overlay.id = 'dayEventsOverlay';
  overlay.className = 'day-events-overlay';
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeDayEvents();
  });

  overlay.innerHTML = `
    <section class="day-events-dialog" role="dialog" aria-modal="true" aria-labelledby="dayEventsTitle">
      <div class="day-events-header">
        <h2 id="dayEventsTitle">${esc(date)} 일정 ${events.length}건</h2>
        <button type="button" class="s" onclick="closeDayEvents()">닫기</button>
      </div>
      <div class="day-events-list">
        ${events.map(event => `
          <button type="button" class="day-events-item ${eventTypeClass(event.type)}"
            onclick="closeDayEvents();openEvent('${scope}','${date}','${event.id}')">
            <strong class="day-event-title-row"><span>${esc(hm(event))} ${esc(event.title || '제목 없음')}</span>${tripReportStatusHtml(event)}</strong>
            <span>${esc(event.type || '일정')} · ${esc(event.person || '담당자 미지정')}${event.place ? ` · ${esc(event.place)}` : ''}</span>
          </button>`).join('') || '<p class="small">표시할 일정이 없습니다.</p>'}
      </div>
    </section>`;

  document.body.appendChild(overlay);
}
