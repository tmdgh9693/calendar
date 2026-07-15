'use strict';
// 회의자료 기간 계산, 일정 필터, 항목 변환

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

