'use strict';
// 주간·월간 회의자료 생성 및 과 캘린더 결과 UI
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
  openDeptMeetingReport();
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
function openDeptMeetingReport() {
  const panel = document.getElementById('deptMeetingResultPanel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function closeDeptMeetingReport() {
  const panel = document.getElementById('deptMeetingResultPanel');
  if (panel) panel.classList.add('hidden');
}
