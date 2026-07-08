function exportData() {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: 'application/json' }
  );

  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = '캘린더_보관자료_백업.json';
  a.click();

  URL.revokeObjectURL(a.href);
}

function importData() {
  try {
    const text = $('importText') ? $('importText').value : '';

    if (!text.trim()) {
      alert('불러올 JSON 데이터를 붙여넣어 주세요.');
      return;
    }

    const imported = JSON.parse(text);

    data.users = imported.users || [];
    data.user = imported.user || data.user || '';
    data.uid = imported.uid || data.uid || '';
    data.userColors = imported.userColors || data.userColors || {};
    data.events = imported.events || [];
    data.docs = imported.docs || [];
    data.hwpxTemplates = imported.hwpxTemplates || data.hwpxTemplates || { meeting: null, trip: null };
    data.hwpxTemplate = imported.hwpxTemplate || data.hwpxTemplate || null;

    localSave();

    if (USE_FIREBASE && auth && auth.currentUser) {
      saveAllToCloud();
    }

    init();

    alert('백업자료를 불러왔습니다.');
  } catch (error) {
    console.error(error);
    alert('JSON 형식이 맞지 않습니다.');
  }
}

async function clearEvents() {
  const targets = (data.events || []).filter(event =>
    typeof canEditEvent === 'function' ? canEditEvent(event) : event.ownerUid === ownerKey()
  );

  if (!targets.length) {
    alert('삭제할 내 일정이 없습니다. 다른 사용자의 과 일정은 삭제하지 않습니다.');
    return;
  }

  if (!confirm(`내 일정 ${targets.length}건을 모두 삭제할까요?\n다른 사용자의 과 일정과 보관자료는 유지됩니다.`)) return;

  const ids = targets.map(event => event.id);
  data.events = (data.events || []).filter(event => !ids.includes(event.id));
  markLocalDeleted('deletedEventIds', ids);
  localSave();
  render();

  if (USE_FIREBASE) {
    try {
      await Promise.all(ids.map(id => removeCloud('events', id)));
    } catch (error) {
      console.error('일정 전체 서버 삭제 오류:', error);
      alert('이 기기에서는 삭제됐지만 서버 삭제에는 실패했습니다.\n' + error.message);
      return;
    }
  }

  alert('내 일정을 모두 삭제했습니다.');
}

async function saveUserColor() {
  const color = $('userColor')?.value || '#2563eb';
  const userId = ownerKey();

  if (!userId) {
    alert('먼저 로그인한 뒤 색상을 저장하세요.');
    return;
  }

  data.userColors = data.userColors || {};
  data.userColors[userId] = color;
  localSave();

  try {
    if (USE_FIREBASE && auth && auth.currentUser) {
      await db
        .collection('users')
        .doc(auth.currentUser.uid)
        .set({
          uid: auth.currentUser.uid,
          name: data.user,
          email: auth.currentUser.email || '',
          color,
          updatedAt: new Date().toISOString()
        }, { merge: true });
    }

    render();
    alert('내 일정 표시 색상을 저장했습니다.');
  } catch (error) {
    console.error('색상 저장 오류:', error);
    alert('색상은 이 기기에 저장했지만, 서버 저장에는 실패했습니다. ' + error.message);
  }
}

function sample() {
  const now = new Date();
  const ws = weekStart(now);
  const ns = addDays(ws, 7);

  const currentWeekDate = localDate(addDays(ws, 2));
  const nextWeekDate = localDate(addDays(ns, 1));

  const personalId = uid();

  data.events = [
    {
      id: personalId,
      scope: '개인',
      owner: data.user,
      ownerUid: ownerKey(),
      visibleTo: [ownerKey()],
      date: currentWeekDate,
      startH: 13,
      startM: 0,
      endH: 16,
      endM: 30,
      type: '출장',
      person: data.user,
      title: '사설항로표지 실태점검',
      place: '광양',
      deptReflect: true,
      meetingInclude: true,
      part: '자동',
      summary: '사설항로표지 실태점검 실시[여수광양항만공사 / 등대 1]',
      result: '허가사항, 시설물 관리, 관리자 등록 및 자격사항 확인 결과 대체로 적정',
      plan: '사설항로표지 실태점검 계속 추진',
      updatedAt: new Date().toISOString()
    },
    {
      id: uid(),
      scope: '과',
      owner: '과',
      ownerUid: 'dept',
      visibleTo: ['dept', ownerKey()],
      sourceId: personalId,
      date: currentWeekDate,
      startH: 13,
      startM: 0,
      endH: 16,
      endM: 30,
      type: '출장',
      person: data.user,
      title: '사설항로표지 실태점검',
      place: '광양',
      deptReflect: false,
      meetingInclude: true,
      part: '자동',
      summary: '사설항로표지 실태점검 실시[여수광양항만공사 / 등대 1]',
      result: '허가사항, 시설물 관리, 관리자 등록 및 자격사항 확인 결과 대체로 적정',
      plan: '사설항로표지 실태점검 계속 추진',
      updatedAt: new Date().toISOString()
    },
    {
      id: uid(),
      scope: '과',
      owner: '과',
      ownerUid: 'dept',
      visibleTo: ['dept', ownerKey()],
      date: nextWeekDate,
      startH: 9,
      startM: 30,
      endH: 10,
      endM: 30,
      type: '회의',
      person: '담당자 A',
      title: '주간업무 검토회의',
      place: '우리 청 회의실',
      deptReflect: false,
      meetingInclude: true,
      part: '자동',
      summary: '부서 주요 현안 및 다음 주 추진계획 공유',
      result: '',
      plan: '담당자별 일정 정리',
      updatedAt: new Date().toISOString()
    }
  ];

  localSave();

  if (USE_FIREBASE && auth && auth.currentUser) {
    Promise.all(data.events.map(event => upsert('events', event)));
  }

  render();

  alert('샘플자료를 넣었습니다.');
}

function dedupeAllEvents() {
  const seen = new Set();
  const result = [];

  for (const event of data.events || []) {
    const key = [
      event.scope || '',
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

  data.events = result;
}

function cleanupDuplicates() {
  const before = (data.events || []).length;

  dedupeAllEvents();

  localSave();

  if (USE_FIREBASE && auth && auth.currentUser) {
    saveAllToCloud();
  }

  render();

  alert('중복 일정 ' + (before - data.events.length) + '건을 정리했습니다.');
}