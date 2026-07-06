function weekStart(date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);

  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function periodInfo() {
  const now = new Date();

  if ($('mType') && $('mType').value === 'weekly') {
    const ws = weekStart(now);
    const we = addDays(ws, 6);
    const ns = addDays(ws, 7);
    const ne = addDays(ws, 13);

    return {
      aS: localDate(ws),
      aE: localDate(we),
      pS: localDate(ns),
      pE: localDate(ne),
      label: `금주 실적: ${localDate(ws)}~${localDate(we)} / 다음주 계획: ${localDate(ns)}~${localDate(ne)}`
    };
  }

  const cs = monthStart(now);
  const ce = monthEnd(now);
  const ns = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const ne = monthEnd(ns);

  return {
    aS: localDate(cs),
    aE: localDate(ce),
    pS: localDate(ns),
    pE: localDate(ne),
    label: `현재월 실적: ${localDate(cs)}~${localDate(ce)} / 다음월 계획: ${localDate(ns)}~${localDate(ne)}`
  };
}

function updateMeetingPeriod() {
  if (!$('periodGuide')) return;

  $('periodGuide').innerText = periodInfo().label;
}

function sourceFilter(event) {
  if (!$('mSource')) return event.scope === '과';

  const source = $('mSource').value;

  return (
    (source === 'dept' && event.scope === '과') ||
    (source === 'personal' && event.scope === '개인' && mine(event)) ||
    (source === 'dept_personal' &&
      (event.scope === '과' || (event.scope === '개인' && mine(event))))
  );
}

function normForKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function dedupeMeetingEvents(list) {
  const deptSourceIds = new Set(
    list
      .filter(event => event.scope === '과' && event.sourceId)
      .map(event => event.sourceId)
  );

  const seen = new Set();
  const result = [];

  for (const event of list) {
    if (event.scope === '개인' && deptSourceIds.has(event.id)) continue;

    const key = [
      event.sourceId || '',
      event.date || '',
      event.startH ?? '',
      event.startM ?? '',
      event.endH ?? '',
      event.endM ?? '',
      normForKey(event.title),
      normForKey(event.place),
      normForKey(event.summary)
    ].join('|');

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(event);
  }

  return result;
}

function sent(event) {
  const dateText = event.date
    ? `${Number(event.date.slice(5, 7))}.${Number(event.date.slice(8, 10))}.`
    : '';

  const head = `ㅇ ${event.title}(${[
    dateText,
    hm(event),
    event.place,
    event.person
  ].filter(Boolean).join(', ')})`;

  const body = event.summary || '관련 일정 추진';

  return `<p>${esc(head)}<br><span class="indent">- ${nl(
    body +
    (event.result ? ' ' + event.result : '') +
    (event.plan ? ' 향후 ' + event.plan : '')
  )}</span></p>`;
}

function makeMeeting() {
  updateMeetingPeriod();

  const period = periodInfo();

  const raw = data.events.filter(event =>
    event.meetingInclude &&
    sourceFilter(event) &&
    (inR(event.date, period.aS, period.aE) || inR(event.date, period.pS, period.pE))
  );

  const events = dedupeMeetingEvents(raw).sort(sortEv);

  const results = events.filter(event =>
    event.part !== '현안' &&
    inR(event.date, period.aS, period.aE)
  );

  const plans = events.filter(event =>
    event.part !== '현안' &&
    inR(event.date, period.pS, period.pE)
  );

  const issues = events.filter(event =>
    event.part === '현안'
  );

  const type = $('mType') ? $('mType').value : 'weekly';
  const dept = $('mDept') ? $('mDept').value || '항행정보시설과' : '항행정보시설과';
  const memo = $('mMemo') ? $('mMemo').value.trim() : '';

  if (!$('meetingReport')) return;

  $('meetingReport').innerHTML = `
    <h1>${esc(dept)}</h1>
    <p style="text-align:right"><b>작성기준:</b> ${esc(period.label)}</p>

    <h2>${type === 'weekly' ? 'Ⅰ. 금주 주요 실적' : 'Ⅰ. 현재월 주요 실적'}</h2>
    ${results.length ? results.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>${type === 'weekly' ? 'Ⅱ. 다음주 주요 계획' : 'Ⅱ. 다음월 주요 계획'}</h2>
    ${plans.length ? plans.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>Ⅲ. 주요 현안 및 협조사항</h2>
    ${issues.length ? issues.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>Ⅳ. 추가 메모</h2>
    ${memo ? `<p>ㅇ ${nl(memo)}</p>` : '<p>ㅇ 해당사항 없음</p>'}
  `;
}

function makeDeptMeetingCustom(type) {
  const resultStart = $('deptResultStart') ? $('deptResultStart').value : '';
  const resultEnd = $('deptResultEnd') ? $('deptResultEnd').value : '';
  const planStart = $('deptPlanStart') ? $('deptPlanStart').value : '';
  const planEnd = $('deptPlanEnd') ? $('deptPlanEnd').value : '';

  if (!resultStart || !resultEnd || !planStart || !planEnd) {
    alert('실적 날짜와 계획 날짜를 모두 입력하세요.');
    return;
  }

  const dept = $('mDept') ? $('mDept').value || '항행정보시설과' : '항행정보시설과';

  const events = data.events
    .filter(event => event.scope === '과' && event.meetingInclude)
    .sort(sortEv);

  const results = events.filter(event =>
    event.part !== '현안' &&
    inR(event.date, resultStart, resultEnd)
  );

  const plans = events.filter(event =>
    event.part !== '현안' &&
    inR(event.date, planStart, planEnd)
  );

  const issues = events.filter(event =>
    event.part === '현안' &&
    (inR(event.date, resultStart, resultEnd) || inR(event.date, planStart, planEnd))
  );

  if (!$('deptMeetingReport')) return;

  $('deptMeetingReport').innerHTML = `
    <h1>${esc(dept)}</h1>

    <p style="text-align:right">
      <b>작성기준:</b>
      실적: ${esc(resultStart)}~${esc(resultEnd)}
      / 계획: ${esc(planStart)}~${esc(planEnd)}
    </p>

    <h2>${type === 'weekly' ? 'Ⅰ. 금주 주요 실적' : 'Ⅰ. 현재월 주요 실적'}</h2>
    ${results.length ? results.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>${type === 'weekly' ? 'Ⅱ. 다음주 주요 계획' : 'Ⅱ. 다음월 주요 계획'}</h2>
    ${plans.length ? plans.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>Ⅲ. 주요 현안 및 협조사항</h2>
    ${issues.length ? issues.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}
  `;
}

function initDeptMeetingDates() {
  if (!$('deptResultStart')) return;
  if ($('deptResultStart').value) return;

  const now = new Date();

  const ws = weekStart(now);
  const we = addDays(ws, 6);
  const ns = addDays(ws, 7);
  const ne = addDays(ws, 13);

  $('deptResultStart').value = localDate(ws);
  $('deptResultEnd').value = localDate(we);
  $('deptPlanStart').value = localDate(ns);
  $('deptPlanEnd').value = localDate(ne);
}
