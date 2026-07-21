
let monthlyScheduleMonth = new Date();
monthlyScheduleMonth.setDate(1);

function monthlyScheduleDateValue(event) {
  return String(event?.date || event?.startDate || '');
}

function monthlyScheduleEndDateValue(event) {
  return String(event?.endDate || event?.date || event?.startDate || '');
}

function monthlyScheduleDays(event) {
  const startText = monthlyScheduleDateValue(event);
  const endText = monthlyScheduleEndDateValue(event);
  if (!startText) return [];

  const start = new Date(startText + 'T00:00:00');
  const end = new Date((endText || startText) + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const days = [];
  const cursor = new Date(start);
  const safeEnd = end < start ? start : end;
  while (cursor <= safeEnd && days.length < 370) {
    days.push(localDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function moveMonthlySchedule(direction) {
  monthlyScheduleMonth.setMonth(monthlyScheduleMonth.getMonth() + direction, 1);
  renderMonthlySchedule();
}

function goMonthlyScheduleToday() {
  monthlyScheduleMonth = new Date();
  monthlyScheduleMonth.setDate(1);
  renderMonthlySchedule();
}

function monthlyScheduleEventMatches(event, search, type) {
  if (type && event.type !== type) return false;
  if (!search) return true;
  const haystack = [event.title, event.person, event.place, event.summary, event.result, event.plan, event.type]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
  return haystack.includes(search);
}

function monthlyScheduleOpen(eventId, date) {
  openEvent('과', date, eventId);
}

function renderMonthlySchedule() {
  const list = $('monthlyScheduleList');
  const title = $('monthlyScheduleTitle');
  const summary = $('monthlyScheduleSummary');
  if (!list || !title || !summary) return;

  const year = monthlyScheduleMonth.getFullYear();
  const monthIndex = monthlyScheduleMonth.getMonth();
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const startText = localDate(monthStart);
  const endText = localDate(monthEnd);
  const search = String($('monthlyScheduleSearch')?.value || '').trim().toLowerCase();
  const type = String($('monthlyScheduleType')?.value || '');

  title.textContent = `${year}년 ${monthIndex + 1}월 월간 일정`;

  const byDate = new Map();
  const matchedEvents = (data.events || [])
    .filter(event => event.scope === '과')
    .filter(event => monthlyScheduleEventMatches(event, search, type));

  matchedEvents.forEach(event => {
    monthlyScheduleDays(event).forEach(date => {
      if (date < startText || date > endText) return;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(event);
    });
  });

  const dateEntries = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const uniqueCount = new Set(dateEntries.flatMap(([, events]) => events.map(event => event.id))).size;
  const typeCounts = {};
  matchedEvents.forEach(event => {
    if (!monthlyScheduleDays(event).some(date => date >= startText && date <= endText)) return;
    const key = event.type || '기타';
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  });

  summary.innerHTML = [
    `<span class="monthly-summary-chip">일정 ${uniqueCount}건</span>`,
    ...Object.entries(typeCounts)
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([name, count]) => `<span class="monthly-summary-chip">${esc(name)} ${count}건</span>`)
  ].join('');

  if (!dateEntries.length) {
    list.innerHTML = '<div class="monthly-empty">선택한 달에 표시할 과 일정이 없습니다.</div>';
    return;
  }

  list.innerHTML = dateEntries.map(([date, events]) => {
    const dateObj = new Date(date + 'T00:00:00');
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
    const sorted = [...events].sort(sortEv);
    const eventHtml = sorted.map(event => {
      const className = eventTypeClass(event.type);
      const person = event.person || '담당자 미지정';
      const place = event.place ? ` · ${event.place}` : '';
      return `
        <button type="button" class="monthly-event-card ${className}" onclick="monthlyScheduleOpen('${event.id}', '${date}')">
          <span class="monthly-event-time">${esc(hm(event))}</span>
          <span class="monthly-event-type">${esc(event.type || '일정')}</span>
          <span class="monthly-event-main">
            <span class="monthly-event-title-row"><span class="monthly-event-title">${esc(event.title || '제목 없음')}</span>${typeof tripReportStatusHtml === 'function' ? tripReportStatusHtml(event) : ''}</span>
            <span class="monthly-event-meta">${esc(person + place)}</span>
          </span>
        </button>`;
    }).join('');

    return `
      <article class="monthly-day-group">
        <div class="monthly-day-heading">
          <h3>${monthIndex + 1}월 ${dateObj.getDate()}일 (${weekday})</h3>
          <span class="monthly-day-count">${sorted.length}건</span>
        </div>
        <div class="monthly-day-events">${eventHtml}</div>
      </article>`;
  }).join('');
}
