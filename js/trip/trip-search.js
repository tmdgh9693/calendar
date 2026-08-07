'use strict';

function tripEventFingerprint(event) {
  return [
    event.date || '',
    event.startH ?? '',
    event.startM ?? '',
    event.endH ?? '',
    event.endM ?? '',
    normForKey(event.type),
    normForKey(event.title),
    normForKey(event.place),
    normForKey(event.person)
  ].join('|');
}

function tripSearchText(event) {
  return [
    event.date,
    event.endDate,
    event.person,
    event.title,
    event.place,
    event.type,
    event.summary,
    event.result,
    event.plan,
    ...(Array.isArray(event.people) ? event.people.flatMap(person => [person?.rank, person?.name]) : [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function tripSearchResultHtml(event) {
  const start = `${String(event.startH ?? 9).padStart(2, '0')}:${String(event.startM ?? 0).padStart(2, '0')}`;
  const end = `${String(event.endH ?? 18).padStart(2, '0')}:${String(event.endM ?? 0).padStart(2, '0')}`;
  const dateText = event.endDate && event.endDate !== event.date
    ? `${event.date || ''} ~ ${event.endDate}`
    : (event.date || '날짜 없음');

  return `
    <button class="trip-search-result" type="button" onclick="loadTripById('${esc(event.id)}')">
      <span class="trip-search-result-top">
        <strong>${esc(event.title || '제목 없음')}</strong>
        <span class="trip-search-result-type">${esc(event.type || '')}</span>
      </span>
      <span class="trip-search-result-meta">${esc(dateText)} · ${start}~${end}${event.person ? ` · ${esc(event.person)}` : ''}</span>
      ${event.place ? `<span class="trip-search-result-place">${esc(event.place)}</span>` : ''}
    </button>`;
}

function renderTripSearchResults(events, query) {
  const resultBox = $('tripSearchResults');
  if (!resultBox) return;

  if (!query) {
    resultBox.innerHTML = '';
    resultBox.classList.remove('is-open');
    return;
  }

  resultBox.classList.add('is-open');

  if (!events.length) {
    resultBox.innerHTML = query
      ? '<div class="trip-search-empty">검색 결과가 없습니다.</div>'
      : '<div class="trip-search-empty">등록된 출장·점검·공사 일정이 없습니다.</div>';
    return;
  }

  const visible = events.slice(0, 30);
  resultBox.innerHTML = visible.map(tripSearchResultHtml).join('') +
    (events.length > visible.length
      ? `<div class="trip-search-more">상위 ${visible.length}건만 표시했습니다. 검색어를 더 입력해 주세요.</div>`
      : '');
}

function tripLinkedDeptEvent(event) {
  if (!event) return null;
  if (event.scope === '과') return event;
  return (data.events || []).find(item => item.scope === '과' && item.sourceId === event.id) || null;
}

function tripSnapshotFromCalendarEvent(event) {
  const linkedDept = tripLinkedDeptEvent(event);
  const people = Array.isArray(event?.people)
    ? event.people.map(person => ({
        rank: String(person?.rank || ''),
        name: String(person?.name || '')
      })).filter(person => person.rank || person.name)
    : [];

  const eventPhotos = Array.isArray(event?.tripPhotos)
    ? event.tripPhotos.filter(photo => photo && photo.data).map(photo => ({
        data: photo.data,
        cap: photo.cap || '',
        original: photo.original || dataBytes(photo.data),
        compressed: photo.compressed || dataBytes(photo.data)
      }))
    : [];

  return {
    currentTripEventTitle: String(event?.title || event?.summary || '').trim(),
    // 개인 일정은 연결된 과 일정이 있을 때만 그 ID를 사용합니다.
    // 과 반영이 없는 개인 일정은 빈 ID로 두어 출장복명 저장 시 개인 일정을 덮어쓰지 않게 합니다.
    currentTripCalendarEventId: event?.scope === '과' ? (event.id || '') : (linkedDept?.id || ''),
    date: event?.date || today(),
    endDate: event?.endDate || event?.date || today(),
    reportDate: event?.date || today(),
    startH: event?.startH ?? 9,
    startM: event?.startM ?? 0,
    endH: event?.endH ?? 18,
    endM: event?.endM ?? 0,
    rank: typeof rankForUserName === 'function' ? rankForUserName(event?.person || '') : '',
    person: event?.person || data.user || '',
    place: event?.place || '',
    purpose: event?.summary || event?.title || '',
    body: event?.result || '',
    plan: event?.plan || '',
    people,
    photos: eventPhotos
  };
}

function applyCalendarEventToTrip(event) {
  if (!event) return false;
  if (typeof setTripEditMode === 'function') setTripEditMode('', '');
  const snapshot = tripSnapshotFromCalendarEvent(event);
  if (typeof applyTripSnapshot === 'function') {
    applyTripSnapshot(snapshot);
  } else {
    return false;
  }
  return true;
}

function loadTripById(id) {
  const selected = (data.events || []).find(item => item.id === id);
  if (!selected) return;

  const select = $('tripSelect');
  if (select && [...select.options].some(option => option.value === id)) select.value = id;
  applyCalendarEventToTrip(selected);

  if ($('tripSearch')) $('tripSearch').value = '';
  tripOptions();

  const target = $('tDate');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => target.focus({ preventScroll: true }), 250);
  }
}

function openTripFromCalendarEvent(id) {
  if (typeof requireWriteAccess === 'function' && !requireWriteAccess('출장복명 작성')) return;
  const event = (data.events || []).find(item => item.id === id);
  if (!event) {
    alert('선택한 일정을 찾지 못했습니다.');
    return;
  }
  if (!['출장', '점검', '공사'].includes(String(event.type || ''))) {
    alert('출장·점검·공사 일정에서 출장복명서를 작성할 수 있습니다.');
    return;
  }

  tab('trip', document.querySelector('[data-tab="trip"]'), { instant: true });
  if ($('tripSearch')) $('tripSearch').value = '';
  tripOptions();
  applyCalendarEventToTrip(event);

  const select = $('tripSelect');
  if (select && [...select.options].some(option => option.value === event.id)) select.value = event.id;

  const target = $('tDate');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => target.focus({ preventScroll: true }), 250);
  }
}

function clearTripSearch() {
  if ($('tripSearch')) $('tripSearch').value = '';
  tripOptions();
  if ($('tripSearch')) $('tripSearch').focus();
}

function tripOptions() {
  const select = $('tripSelect');
  if (!select) return;

  const previousValue = select.value;
  const query = String($('tripSearch')?.value || '').trim().toLowerCase();
  const sourceIds = new Set();
  const fingerprints = new Set();

  const allEvents = (data.events || [])
    .filter(event =>
      ['출장', '점검', '공사'].includes(event.type) &&
      event.scope === '과'
    )
    .sort((a, b) => {
      const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
      return dateCompare || sortEv(a, b);
    })
    .filter(event => {
      const sourceKey = event.sourceId || '';
      const fingerprint = tripEventFingerprint(event);

      if (sourceKey && sourceIds.has(sourceKey)) return false;
      if (fingerprints.has(fingerprint)) return false;

      if (sourceKey) sourceIds.add(sourceKey);
      fingerprints.add(fingerprint);
      return true;
    });

  const events = query
    ? allEvents.filter(event => tripSearchText(event).includes(query))
    : allEvents;

  renderTripSearchResults(events, query);

  select.innerHTML =
    `<option value="">${events.length ? '검색 결과에서 일정 선택' : '일치하는 일정이 없습니다.'}</option>` +
    events
      .map(event => {
        const person = event.person ? ` · ${esc(event.person)}` : '';
        const place = event.place ? ` · ${esc(event.place)}` : '';
        return `<option value="${event.id}">${esc(event.date || '')} · ${esc(event.type || '')}${person} · ${esc(event.title || '제목 없음')}${place}</option>`;
      })
      .join('');

  if (events.some(event => event.id === previousValue)) {
    select.value = previousValue;
  }

  const status = $('tripSearchStatus');
  if (status) {
    status.textContent = query
      ? `검색 결과 ${events.length}건 / 전체 ${allEvents.length}건`
      : `과 캘린더 출장·점검·공사 일정 ${allEvents.length}건`;
  }
}

function loadTrip() {
  const selectedId = $('tripSelect') ? $('tripSelect').value : '';
  const event = (data.events || []).find(item => item.id === selectedId);
  if (!event) return;
  applyCalendarEventToTrip(event);
}

