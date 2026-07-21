'use strict';

const NAMED_TRIP_DRAFT_DB = 'aton-calendar-trip-drafts';
const NAMED_TRIP_DRAFT_STORE = 'drafts';
const NAMED_TRIP_DRAFT_DB_VERSION = 1;

function tripDraftStatus(message) {
  const status = $('tripDraftStatus');
  if (status) status.textContent = message || '';
}

function openNamedTripDraftDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('이 브라우저에서는 임시저장 목록을 사용할 수 없습니다.'));
      return;
    }

    const request = indexedDB.open(NAMED_TRIP_DRAFT_DB, NAMED_TRIP_DRAFT_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(NAMED_TRIP_DRAFT_STORE)) {
        const store = database.createObjectStore(NAMED_TRIP_DRAFT_STORE, { keyPath: 'id' });
        store.createIndex('ownerUid', 'ownerUid', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('임시저장 목록을 열지 못했습니다.'));
  });
}

async function listNamedTripDrafts() {
  const database = await openNamedTripDraftDb();
  const records = await new Promise((resolve, reject) => {
    const transaction = database.transaction(NAMED_TRIP_DRAFT_STORE, 'readonly');
    const request = transaction.objectStore(NAMED_TRIP_DRAFT_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('임시저장 목록을 불러오지 못했습니다.'));
  });
  database.close();

  const userKey = String(ownerKey() || 'local');
  return records
    .filter(record => String(record.ownerUid || 'local') === userKey)
    .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
}

async function putNamedTripDraft(record) {
  const database = await openNamedTripDraftDb();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(NAMED_TRIP_DRAFT_STORE, 'readwrite');
    transaction.objectStore(NAMED_TRIP_DRAFT_STORE).put(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('임시저장에 실패했습니다.'));
    transaction.onabort = () => reject(transaction.error || new Error('임시저장이 중단되었습니다.'));
  });
  database.close();
}

async function removeNamedTripDraft(id) {
  const database = await openNamedTripDraftDb();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(NAMED_TRIP_DRAFT_STORE, 'readwrite');
    transaction.objectStore(NAMED_TRIP_DRAFT_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('임시저장 삭제에 실패했습니다.'));
  });
  database.close();
}

function defaultTripDraftTitle() {
  const date = $('tDate')?.value || today();
  const place = $('tPlace')?.value.trim() || '';
  const purpose = String($('tPurpose')?.value || '')
    .split(/\n+/)
    .map(item => item.replace(/^[-ㅇ•*]\s*/, '').trim())
    .find(Boolean) || '';
  return [date, purpose || place || '출장복명'].filter(Boolean).join('_').slice(0, 80);
}

async function refreshNamedTripDraftList(selectedId = '') {
  const select = $('tripDraftSelect');
  if (!select) return;

  try {
    const drafts = await listNamedTripDrafts();
    select.innerHTML = drafts.length
      ? '<option value="">임시저장 파일 선택</option>' + drafts.map(draft => {
          const saved = new Date(Number(draft.savedAt || Date.now())).toLocaleString();
          return `<option value="${esc(draft.id)}">${esc(draft.title || '제목 없음')} · ${esc(saved)}</option>`;
        }).join('')
      : '<option value="">저장된 임시파일이 없습니다.</option>';

    if (selectedId && drafts.some(item => item.id === selectedId)) select.value = selectedId;
    tripDraftStatus(drafts.length ? `임시저장 ${drafts.length}건` : '저장된 임시파일이 없습니다.');
  } catch (error) {
    console.error('임시저장 목록 오류:', error);
    tripDraftStatus(error.message || '임시저장 목록을 불러오지 못했습니다.');
  }
}

async function saveNamedTripDraft() {
  const titleInput = $('tripDraftTitle');
  const title = String(titleInput?.value || '').trim() || defaultTripDraftTitle();
  const selectedId = $('tripDraftSelect')?.value || '';
  const existing = selectedId ? (await listNamedTripDrafts()).find(item => item.id === selectedId) : null;
  const id = existing?.id || uid();
  const now = Date.now();

  const record = {
    id,
    ownerUid: String(ownerKey() || 'local'),
    owner: data.user || '',
    title,
    createdAt: existing?.createdAt || now,
    savedAt: now,
    snapshot: captureTripSnapshot()
  };

  try {
    await putNamedTripDraft(record);
    if (titleInput) titleInput.value = title;
    await refreshNamedTripDraftList(id);
    tripDraftStatus(`“${title}” 임시저장 완료`);
  } catch (error) {
    console.error('출장복명 임시저장 오류:', error);
    alert('임시저장에 실패했습니다.\n' + error.message);
  }
}

async function loadSelectedTripDraft() {
  const id = $('tripDraftSelect')?.value || '';
  if (!id) {
    alert('불러올 임시저장 파일을 선택하세요.');
    return;
  }

  const record = (await listNamedTripDrafts()).find(item => item.id === id);
  if (!record) {
    alert('선택한 임시저장 파일을 찾지 못했습니다.');
    await refreshNamedTripDraftList();
    return;
  }

  const hasCurrentContent = [
    $('tPlace')?.value,
    $('tPurpose')?.value,
    $('tBody')?.value,
    $('tPlan')?.value,
    Array.isArray(photos) && photos.length ? 'photos' : ''
  ].some(Boolean);

  if (hasCurrentContent && !confirm('현재 작성 중인 내용을 임시저장 파일로 바꿀까요?')) return;

  setTripEditMode('', '');
  applyTripSnapshot(record.snapshot || {}, { saveRecovery: true });
  if ($('tripDraftTitle')) $('tripDraftTitle').value = record.title || '';
  await makeTrip({ askCalendar: false });
  tripDraftStatus(`“${record.title || '임시저장'}” 불러오기 완료`);
}

async function deleteSelectedTripDraft() {
  const id = $('tripDraftSelect')?.value || '';
  if (!id) {
    alert('삭제할 임시저장 파일을 선택하세요.');
    return;
  }

  const record = (await listNamedTripDrafts()).find(item => item.id === id);
  if (!record) return;
  if (!confirm(`“${record.title || '임시저장'}” 파일을 삭제할까요?`)) return;

  try {
    await removeNamedTripDraft(id);
    if ($('tripDraftTitle')) $('tripDraftTitle').value = '';
    await refreshNamedTripDraftList();
    tripDraftStatus('임시저장 파일을 삭제했습니다.');
  } catch (error) {
    alert('임시저장 파일을 삭제하지 못했습니다.\n' + error.message);
  }
}

async function importNamedTripDraftRecords(records = []) {
  let count = 0;
  for (const item of records) {
    if (!item || !item.snapshot) continue;
    await putNamedTripDraft({
      ...item,
      id: item.id || uid(),
      ownerUid: String(ownerKey() || 'local'),
      savedAt: Number(item.savedAt || Date.now())
    });
    count += 1;
  }
  await refreshNamedTripDraftList();
  return count;
}
