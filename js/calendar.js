function moveMonth(direction) {
  month.setMonth(month.getMonth() + direction);
  render();
}

function openEvent(scope, date, id = '') {
  $('modal').classList.remove('hidden');
  $('evScope').value = scope;

  if (id) {
    const event = data.events.find(item => item.id === id);
    fillEvent(event);
    return;
  }

  $('modalTitle').innerText =
    (scope === '개인' ? '내 일정' : '과 일정') + ' 등록';

  $('evId').value = '';
  $('evDate').value = date || today();
  $('evType').value = '출장';
  $('evPerson').value = scope === '개인' ? data.user : '';
  $('evTitle').value = '';
  $('evPlace').value = '';

  $('evDeptReflect').checked = scope === '개인';
  $('evDeptReflect').disabled = scope === '과';

  $('evMeetingInclude').checked = true;
  $('evPart').value = '자동';
  $('evSummary').value = '';
  $('evResult').value = '';
  $('evPlan').value = '';

  setHM('evStart', 9, 0);
  setHM('evEnd', 18, 0);
}

function closeModal() {
  $('modal').classList.add('hidden');
}

function fillEvent(event) {
  if (!event) return;

  $('modalTitle').innerText =
    (event.scope === '개인' ? '내 일정' : '과 일정') + ' 수정';

  $('evId').value = event.id;
  $('evScope').value = event.scope;
  $('evDate').value = event.date;
  $('evType').value = event.type;
  $('evPerson').value = event.person;
  $('evTitle').value = event.title;
  $('evPlace').value = event.place;

  $('evDeptReflect').checked = !!event.deptReflect;
  $('evDeptReflect').disabled = event.scope === '과';

  $('evMeetingInclude').checked = !!event.meetingInclude;
  $('evPart').value = event.part || '자동';
  $('evSummary').value = event.summary || '';
  $('evResult').value = event.result || '';
  $('evPlan').value = event.plan || '';

  setHM('evStart', event.startH ?? 9, event.startM ?? 0);
  setHM('evEnd', event.endH ?? 18, event.endM ?? 0);
}

function readEvent() {
  const start = getHM('evStart');
  const end = getHM('evEnd');
  const scope = $('evScope').value;

  return {
    id: $('evId').value || uid(),
    scope,
    owner: scope === '개인' ? data.user : '과',
    ownerUid: scope === '개인' ? ownerKey() : 'dept',
    visibleTo: scope === '개인' ? [ownerKey()] : ['dept', ownerKey()],
    sourceId: null,

    date: $('evDate').value || today(),
    startH: start.h,
    startM: start.m,
    endH: end.h,
    endM: end.m,

    type: $('evType').value,
    person: $('evPerson').value.trim() || (scope === '개인' ? data.user : ''),
    title: $('evTitle').value.trim() || '제목 없음',
    place: $('evPlace').value.trim(),

    deptReflect: $('evDeptReflect').checked,
    meetingInclude: $('evMeetingInclude').checked,
    part: $('evPart').value,

    summary: $('evSummary').value.trim(),
    result: $('evResult').value.trim(),
    plan: $('evPlan').value.trim(),

    updatedAt: new Date().toISOString()
  };
}

async function saveEvent() {
  if (!confirm('작성한 일정을 저장하시겠습니까?')) return;

  const event = readEvent();
  const index = data.events.findIndex(item => item.id === event.id);

  const oldMirrors = data.events
    .filter(item => item.scope === '과' && item.sourceId === event.id)
    .map(item => item.id);

  if (USE_FIREBASE && oldMirrors.length) {
    await Promise.all(oldMirrors.map(id => removeCloud('events', id)));
  }

  if (index >= 0) {
    data.events[index] = event;
  } else {
    data.events.push(event);
  }

  if (event.scope === '개인') {
    syncDept(event);
  }

  localSave();

  if (USE_FIREBASE) {
    await Promise.all(
      data.events
        .filter(item => item.id === event.id || item.sourceId === event.id)
        .map(item => upsert('events', item))
    );
  }

  closeModal();
  render();

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
    ownerUid: 'dept',
    visibleTo: ['dept', ownerKey()],
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

  if (!confirm('삭제하시겠습니까?')) return;

  const target = data.events.find(item => item.id === id);

  // 개인 일정 삭제 시 연결된 과 일정도 삭제
  const deleteIds = data.events
    .filter(item =>
      item.id === id ||
      (target && target.scope === '개인' && item.sourceId === id)
    )
    .map(item => item.id);

  data.events = data.events.filter(
    item => !deleteIds.includes(item.id)
  );

  if (USE_FIREBASE) {
    await Promise.all(
      deleteIds.map(id => removeCloud('events', id))
    );
  }

  localSave();
  closeModal();
  render();
}

function render() {
  renderCal('개인');
  renderCal('과');
  tripOptions();
  renderArchive();
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

  let html = ['일', '월', '화', '수', '목', '금', '토']
    .map(day => `<div class="dayname">${day}</div>`)
    .join('');

  for (let i = 0; i < 42; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);

    const date = localDate(current);
    const isOtherMonth = current.getMonth() !== monthIndex;

    const events = data.events
      .filter(event =>
        event.scope === scope &&
        event.date === date &&
        (scope === '과' || mine(event))
      )
      .sort(sortEv);

    html += `
      <div class="cell ${isOtherMonth ? 'other' : ''}" onclick="openEvent('${scope}', '${date}')">
        <div class="date">${current.getDate()}</div>
    `;

    events.slice(0, 5).forEach(event => {
      const colorClass = eventTypeClass(event.type);

      html += `
        <div class="event ${colorClass}" onclick="event.stopPropagation();openEvent('${scope}', '${date}', '${event.id}')">
          ${hm(event)} ${esc(event.title)}
          ${event.meetingInclude ? '●' : ''}
        </div>
      `;
    });

    if (events.length > 5) {
      html += `<div class="small">+${events.length - 5}건</div>`;
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