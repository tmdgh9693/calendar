'use strict';
// 과 캘린더 출장 일정 검색 및 불러오기
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
    event.plan
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
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

  currentTripEventTitle = String(event.title || event.summary || '').trim();
  currentTripCalendarEventId = event.sourceType === 'tripReport' ? event.id : '';

  if ($('tDate')) $('tDate').value = event.date || today();
  if ($('tEndDate')) $('tEndDate').value = event.endDate || event.date || today();
  if ($('tReportDate')) $('tReportDate').value = event.date || today();
  if ($('tStartH')) $('tStartH').value = event.startH ?? 9;
  if ($('tStartM')) $('tStartM').value = event.startM ?? 0;
  if ($('tEndH')) $('tEndH').value = event.endH ?? 18;
  if ($('tEndM')) $('tEndM').value = event.endM ?? 0;
  if ($('tPerson')) $('tPerson').value = event.person || data.user || '';
  if ($('tPlace')) $('tPlace').value = event.place || '';
  if ($('tPurpose')) $('tPurpose').value = event.summary || event.title || '';
  if ($('tBody')) $('tBody').value = event.result || '';
  if ($('tPlan')) $('tPlan').value = event.plan || '';

  photos = Array.isArray(event.tripPhotos)
    ? event.tripPhotos.filter(photo => photo && photo.data).map(photo => ({
        data: photo.data,
        cap: photo.cap || '',
        original: photo.original || dataBytes(photo.data),
        compressed: photo.compressed || dataBytes(photo.data)
      }))
    : [];
  renderPhotos({ save: false });
  saveTripDraft();
}

