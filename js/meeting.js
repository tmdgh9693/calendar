
function meetingHwpxFilename(sourceId = 'meetingReport') {
  const report = $(sourceId);
  const type = report?.dataset?.meetingType || $('mType')?.value || window.lastDeptMeetingType || 'weekly';
  const label = type === 'monthly' ? '월간회의자료' : '주간회의자료';
  const dept = ($('mDept')?.value || '항행정보시설과').trim();
  return `${label}(${dept})_${today().replace(/-/g, '')}.hwpx`;
}

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

function meetingEventFingerprint(event) {
  return [
    event.date || '',
    event.startH ?? '',
    event.startM ?? '',
    event.endH ?? '',
    event.endM ?? '',
    normForKey(event.type),
    normForKey(event.title),
    normForKey(event.place),
    normForKey(event.person),
    normForKey(event.summary),
    normForKey(event.result),
    normForKey(event.plan),
    normForKey(event.part)
  ].join('|');
}

function dedupeMeetingEvents(list) {
  const linkedPersonalIds = new Set(
    list
      .filter(event => event.scope === '과' && event.sourceId)
      .map(event => event.sourceId)
  );

  const sourceIds = new Set();
  const fingerprints = new Set();
  const result = [];

  const ordered = [...list].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === '과' ? -1 : 1;
    return sortEv(a, b);
  });

  for (const event of ordered) {
    if (event.scope === '개인' && linkedPersonalIds.has(event.id)) continue;

    const sourceKey = event.sourceId || '';
    const fingerprint = meetingEventFingerprint(event);

    if ((sourceKey && sourceIds.has(sourceKey)) || fingerprints.has(fingerprint)) continue;

    if (sourceKey) sourceIds.add(sourceKey);
    fingerprints.add(fingerprint);
    result.push(event);
  }

  return result;
}

function circledNumber(index) {
  const numbers = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  return numbers[index] || `${index + 1}.`;
}

function sent(event, index = 0) {
  const dateText = event.date
    ? `${Number(event.date.slice(5, 7))}.${Number(event.date.slice(8, 10))}.`
    : '';

  const details = [dateText, hm(event), event.place, event.person].filter(Boolean).join(', ');
  const head = `${circledNumber(index)} ${event.title}${details ? `(${details})` : ''}`;
  const bodyParts = [event.summary, event.result, event.plan ? `향후 ${event.plan}` : ''].filter(Boolean);
  const body = bodyParts.join(' ') || '관련 일정 추진';

  return `<p class="meeting-item"><b>${esc(head)}</b><br><span class="indent">- ${nl(body)}</span></p>`;
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

  $('meetingReport').dataset.meetingType = type;
  $('meetingReport').innerHTML = `
    <h1>${esc(dept)}</h1>
    <p style="text-align:right"><b>작성기준:</b> ${esc(period.label)}</p>

    <h2>${type === 'weekly' ? '󰊱 지난주 주요 성과' : '󰊱 지난달 주요 성과'}</h2>
    ${results.length ? results.map((event, index) => sent(event, index)).join('') : '<p>① 해당사항 없음</p>'}

    <h2>${type === 'weekly' ? '󰊲 이번주 주요 계획' : '󰊲 이번 달 주요 계획'}</h2>
    ${plans.length ? plans.map((event, index) => sent(event, index)).join('') : '<p>① 해당사항 없음</p>'}
    ${issues.length ? issues.map((event, index) => sent(event, plans.length + index)).join('') : ''}
    ${memo ? `<p class="meeting-item">${circledNumber(plans.length + issues.length)} ${nl(memo)}</p>` : ''}
  `;
}

function setDeptMeetingDatesByType(type) {
  const now = new Date();

  if (type === 'weekly') {
    const thisMonday = weekStart(now);
    const thisFriday = addDays(thisMonday, 4);
    const nextMonday = addDays(thisMonday, 7);
    const nextFriday = addDays(thisMonday, 11);

    if ($('deptResultStart')) $('deptResultStart').value = localDate(thisMonday);
    if ($('deptResultEnd')) $('deptResultEnd').value = localDate(thisFriday);
    if ($('deptPlanStart')) $('deptPlanStart').value = localDate(nextMonday);
    if ($('deptPlanEnd')) $('deptPlanEnd').value = localDate(nextFriday);
    return;
  }

  if (type === 'monthly') {
    const thisMonthStart = monthStart(now);
    const thisMonthEnd = monthEnd(now);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = monthEnd(nextMonthStart);

    if ($('deptResultStart')) $('deptResultStart').value = localDate(thisMonthStart);
    if ($('deptResultEnd')) $('deptResultEnd').value = localDate(thisMonthEnd);
    if ($('deptPlanStart')) $('deptPlanStart').value = localDate(nextMonthStart);
    if ($('deptPlanEnd')) $('deptPlanEnd').value = localDate(nextMonthEnd);
  }
}

function makeDeptMeetingCustom(type) {
  window.lastDeptMeetingType = type;
  setDeptMeetingDatesByType(type);

  const resultStart = $('deptResultStart') ? $('deptResultStart').value : '';
  const resultEnd = $('deptResultEnd') ? $('deptResultEnd').value : '';
  const planStart = $('deptPlanStart') ? $('deptPlanStart').value : '';
  const planEnd = $('deptPlanEnd') ? $('deptPlanEnd').value : '';

  if (!resultStart || !resultEnd || !planStart || !planEnd) {
    alert('실적 날짜와 계획 날짜를 모두 입력하세요.');
    return;
  }

  const dept = $('mDept') ? $('mDept').value || '항행정보시설과' : '항행정보시설과';

  const events = dedupeMeetingEvents(
    data.events.filter(event => event.scope === '과' && event.meetingInclude)
  ).sort(sortEv);

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

  $('deptMeetingReport').dataset.meetingType = type;
  $('deptMeetingReport').innerHTML = `
    <h1>${esc(dept)}</h1>

    <p style="text-align:right">
      <b>작성기준:</b>
      실적: ${esc(resultStart)}~${esc(resultEnd)}
      / 계획: ${esc(planStart)}~${esc(planEnd)}
    </p>

    <h2>${type === 'weekly' ? '󰊱 지난주 주요 성과' : '󰊱 지난달 주요 성과'}</h2>
    ${results.length ? results.map((event, index) => sent(event, index)).join('') : '<p>① 해당사항 없음</p>'}

    <h2>${type === 'weekly' ? '󰊲 이번주 주요 계획' : '󰊲 이번 달 주요 계획'}</h2>
    ${plans.length ? plans.map((event, index) => sent(event, index)).join('') : '<p>① 해당사항 없음</p>'}
    ${issues.length ? issues.map((event, index) => sent(event, plans.length + index)).join('') : ''}
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