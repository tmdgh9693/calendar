async function clearEvents() {
  const targets = (data.events || []).filter(event =>
    typeof canEditEvent === 'function' ? canEditEvent(event) : event.ownerUid === ownerKey()
  );

  if (!targets.length) {
    alert('삭제할 내 일정이 없습니다. 다른 사용자의 과 일정은 삭제하지 않습니다.');
    return;
  }

  if (!confirm(`⚠ 내 일정 ${targets.length}건을 모두 삭제할까요?\n\n삭제한 일정은 복구할 수 없습니다.\n다른 사용자의 과 일정과 보관자료는 유지됩니다.`)) return;

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
  if (!confirm('중복 일정을 정리할까요?\n같은 날짜·시간·제목의 중복 항목이 제거됩니다. 이 작업은 되돌릴 수 없습니다.')) return;

  const before = (data.events || []).length;

  dedupeAllEvents();

  localSave();

  if (USE_FIREBASE && auth && auth.currentUser) {
    saveAllToCloud();
  }

  render();

  alert('중복 일정 ' + (before - data.events.length) + '건을 정리했습니다.');
}