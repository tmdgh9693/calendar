'use strict';

const NAMED_TRIP_DRAFT_DB = 'aton-calendar-trip-drafts';
const NAMED_TRIP_DRAFT_STORE = 'drafts';
const NAMED_TRIP_DRAFT_DB_VERSION = 1;

const TRIP_DRAFT_CLOUD_DOC_TYPE = 'tripDraft';
const TRIP_DRAFT_CLOUD_CHUNK_TYPE = 'tripDraftChunk';
const TRIP_DRAFT_CLOUD_CHUNK_SIZE = 220000;

function cloudTripDraftDocId(id) {
  return `tripDraft_${String(ownerKey() || 'local')}_${String(id || '')}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function cloudTripDraftChunkId(id, index) {
  return `${cloudTripDraftDocId(id)}_part_${String(index).padStart(3, '0')}`;
}

function canSyncTripDraftsToCloud() {
  return !!(window.USE_FIREBASE !== false && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE && db && auth?.currentUser);
}

async function listCloudTripDrafts() {
  if (!canSyncTripDraftsToCloud()) return [];

  const snapshot = await db.collection('docs').where('ownerUid', '==', String(ownerKey())).get();
  const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const mainDocs = all.filter(item => item.docType === TRIP_DRAFT_CLOUD_DOC_TYPE);
  const chunksByDraft = new Map();

  all.filter(item => item.docType === TRIP_DRAFT_CLOUD_CHUNK_TYPE).forEach(item => {
    const key = String(item.draftId || '');
    if (!chunksByDraft.has(key)) chunksByDraft.set(key, []);
    chunksByDraft.get(key).push(item);
  });

  const records = [];
  for (const main of mainDocs) {
    try {
      const parts = (chunksByDraft.get(String(main.draftId || '')) || [])
        .sort((a, b) => Number(a.partIndex || 0) - Number(b.partIndex || 0));
      if (!parts.length || parts.length !== Number(main.chunkCount || 0)) continue;
      const raw = parts.map(part => String(part.payload || '')).join('');
      const record = JSON.parse(raw);
      if (record?.id && record?.snapshot) records.push(record);
    } catch (error) {
      console.warn('클라우드 임시저장 복원 실패:', error);
    }
  }
  return records;
}

async function putCloudTripDraft(record) {
  if (!canSyncTripDraftsToCloud()) return false;

  const ownerUid = String(ownerKey());
  const raw = JSON.stringify(record);
  const chunks = [];
  for (let offset = 0; offset < raw.length; offset += TRIP_DRAFT_CLOUD_CHUNK_SIZE) {
    chunks.push(raw.slice(offset, offset + TRIP_DRAFT_CLOUD_CHUNK_SIZE));
  }

  const existing = await db.collection('docs').where('ownerUid', '==', ownerUid).get();
  const stale = existing.docs.filter(doc => {
    const value = doc.data() || {};
    return value.docType === TRIP_DRAFT_CLOUD_CHUNK_TYPE && String(value.draftId || '') === String(record.id);
  });

  const batch = db.batch();
  stale.forEach(doc => batch.delete(doc.ref));
  chunks.forEach((payload, index) => {
    const ref = db.collection('docs').doc(cloudTripDraftChunkId(record.id, index));
    batch.set(ref, {
      id: ref.id,
      docType: TRIP_DRAFT_CLOUD_CHUNK_TYPE,
      draftId: record.id,
      ownerUid,
      owner: data.user || '',
      scope: '개인',
      partIndex: index,
      payload,
      updatedAt: new Date().toISOString()
    });
  });

  const mainRef = db.collection('docs').doc(cloudTripDraftDocId(record.id));
  batch.set(mainRef, {
    id: mainRef.id,
    docType: TRIP_DRAFT_CLOUD_DOC_TYPE,
    draftId: record.id,
    ownerUid,
    owner: data.user || '',
    scope: '개인',
    title: record.title || '',
    savedAt: Number(record.savedAt || Date.now()),
    chunkCount: chunks.length,
    updatedAt: new Date().toISOString()
  });
  await batch.commit();
  return true;
}

async function removeCloudTripDraft(id) {
  if (!canSyncTripDraftsToCloud()) return false;
  const ownerUid = String(ownerKey());
  const snapshot = await db.collection('docs').where('ownerUid', '==', ownerUid).get();
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    const value = doc.data() || {};
    const sameMain = value.docType === TRIP_DRAFT_CLOUD_DOC_TYPE && String(value.draftId || '') === String(id);
    const sameChunk = value.docType === TRIP_DRAFT_CLOUD_CHUNK_TYPE && String(value.draftId || '') === String(id);
    if (sameMain || sameChunk) batch.delete(doc.ref);
  });
  await batch.commit();
  return true;
}

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
  const localRecords = await new Promise((resolve, reject) => {
    const transaction = database.transaction(NAMED_TRIP_DRAFT_STORE, 'readonly');
    const request = transaction.objectStore(NAMED_TRIP_DRAFT_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('임시저장 목록을 불러오지 못했습니다.'));
  });
  database.close();

  const userKey = String(ownerKey() || 'local');
  const merged = new Map();
  localRecords
    .filter(record => String(record.ownerUid || 'local') === userKey)
    .forEach(record => merged.set(String(record.id), record));

  try {
    const cloudRecords = await listCloudTripDrafts();
    cloudRecords.forEach(record => {
      const current = merged.get(String(record.id));
      if (!current || Number(record.savedAt || 0) >= Number(current.savedAt || 0)) {
        merged.set(String(record.id), record);
        putNamedTripDraft(record).catch(() => {});
      }
    });
  } catch (error) {
    console.warn('클라우드 임시저장 목록을 불러오지 못했습니다:', error);
  }

  return [...merged.values()].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
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
    let cloudSynced = false;
    try {
      cloudSynced = await putCloudTripDraft(record);
    } catch (cloudError) {
      console.warn('출장복명 임시저장 클라우드 동기화 실패:', cloudError);
    }
    if (titleInput) titleInput.value = title;
    await refreshNamedTripDraftList(id);
    tripDraftStatus(cloudSynced
      ? `“${title}” 임시저장 완료 · PC/모바일 동기화됨`
      : `“${title}” 임시저장 완료 · 이 기기에 저장됨`);
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
    try {
      await removeCloudTripDraft(id);
    } catch (cloudError) {
      console.warn('클라우드 임시저장 삭제 실패:', cloudError);
    }
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
