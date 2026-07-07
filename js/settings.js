// js/settings.js
// 백업/복원, 샘플 자료, 중복 정리, 사용자 색상 저장 담당

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = '캘린더_보관자료_백업.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

async function importData() {
  try {
    const text = $('importText')?.value.trim();
    if (!text) return alert('불러올 JSON 데이터를 붙여넣어 주세요.');

    const imported = JSON.parse(text);
    data = {
      ...data,
      events: imported.events || [],
      docs: imported.docs || [],
      hwpxTemplates: imported.hwpxTemplates || data.hwpxTemplates || [],
      selectedHwpxTemplateId: imported.selectedHwpxTemplateId || data.selectedHwpxTemplateId || ''
    };
    normalizeData();
    localSave();
    if (USE_FIREBASE && auth?.currentUser) {
      await saveAllToCloud();
      await saveHwpxTemplatesToCloud();
    }
    init();
    alert('백업자료를 불러왔습니다.');
  } catch (error) {
    console.error(error);
    alert('JSON 형식이 맞지 않습니다.');
  }
}

async function saveUserColor() {
  const color = $('userColor')?.value || '#2563eb';
  data.userColors[ownerKey()] = color;
  localSave();

  if (USE_FIREBASE && auth?.currentUser) {
    await ensureCloudUser(data.user || '사용자');
  }

  render();
  alert('내 일정 표시 색상을 저장했습니다. 과 캘린더에서 내 일정의 왼쪽 선과 점에 표시됩니다.');
}

async function clearEvents() {
  if (!confirm('일정만 모두 삭제할까요? 보관자료는 유지됩니다.')) return;
  const currentUid = ownerKey();
  const deletable = data.events.filter(event => event.ownerUid === currentUid || event.createdByUid === currentUid || event.sourceOwnerUid === currentUid);
  data.events = data.events.filter(event => !deletable.some(item => item.id === event.id));
  localSave();
  if (USE_FIREBASE) await Promise.all(deletable.map(event => removeCloud('events', event.id)));
  render();
  alert('내가 작성한 일정을 삭제했습니다.');
}

function sample() {
  const now = new Date();
  const date = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const personal = {
    id: uid(), scope: '개인', owner: data.user, ownerUid: ownerKey(), ownerColor: getCurrentUserColor(),
    createdByUid: ownerKey(), createdByName: data.user, createdByColor: getCurrentUserColor(),
    date, startH: 13, startM: 0, endH: 16, endM: 30, type: '출장', person: data.user,
    title: '사설항로표지 실태점검', place: '광양', deptReflect: true, meetingInclude: true,
    part: '자동', summary: '사설항로표지 실태점검 실시', result: '점검 결과 대체로 적정', plan: '후속 점검 계속 추진', updatedAt: new Date().toISOString()
  };
  data.events.push(personal);
  syncDept(personal);
  localSave();
  if (USE_FIREBASE) Promise.all(data.events.filter(event => event.id === personal.id || event.sourceId === personal.id).map(event => upsert('events', event)));
  render();
  alert('샘플 일정을 추가했습니다.');
}

function dedupeAllEvents() {
  const seen = new Set();
  data.events = data.events.filter(event => {
    const key = [event.scope || '', event.sourceId || '', event.date || '', event.startH ?? '', event.startM ?? '', event.endH ?? '', event.endM ?? '', normForKey(event.title), normForKey(event.place), normForKey(event.summary)].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanupDuplicates() {
  const before = data.events.length;
  dedupeAllEvents();
  localSave();
  render();
  alert(`중복 일정 ${before - data.events.length}건을 정리했습니다.`);
}
