'use strict';

const PHOTO_VAULT_COLLECTION = 'photoVault';
const PHOTO_VAULT_MAX_DOCUMENT_IMAGE_BYTES = 700 * 1024;
const PHOTO_VAULT_LEGACY_MIGRATION_PREFIX = 'aton-photo-vault-firestore-migrated:';

let selectedPhotoVaultKeys = new Set();
let photoVaultRecordsCache = [];
let photoVaultUnsubscribe = null;
let photoVaultSubscribedUid = '';
let photoVaultMigrationPromise = null;

async function activePhotoVaultUser() {
  if (typeof initializeFirebase === 'function') await initializeFirebase();
  return USE_FIREBASE && auth?.currentUser && db ? auth.currentUser : null;
}

function photoVaultStatus(message) {
  const status = document.getElementById('photoVaultStatus');
  if (status) status.textContent = message;
}

function normalizePhotoVaultRecord(doc) {
  const data = doc?.data ? doc.data() : (doc || {});
  return {
    key: doc?.id || data.key || '',
    ...data,
    cloud: true
  };
}

function validSharedPhoto(record) {
  return !!(
    record &&
    record.key &&
    typeof record.compressedData === 'string' &&
    record.compressedData.startsWith('data:image/')
  );
}

async function legacyLocalPhotoVaultRecords() {
  if (typeof listOriginalTripPhotos !== 'function') return [];
  try {
    return await listOriginalTripPhotos();
  } catch (error) {
    console.warn('기존 사진 보관함 데이터를 확인하지 못했습니다:', error);
    return [];
  }
}

function buildFirestorePhotoRecord(user, record) {
  const compressedBytes = Number(record.compressedBytes || (typeof dataBytes === 'function' ? dataBytes(record.compressedData) : 0));
  if (!record.compressedData || !String(record.compressedData).startsWith('data:image/')) {
    throw new Error('압축 사진 데이터가 없습니다.');
  }
  if (compressedBytes > PHOTO_VAULT_MAX_DOCUMENT_IMAGE_BYTES) {
    throw new Error('압축 사진 용량이 너무 큽니다. 다른 사진을 선택해 주세요.');
  }

  return {
    ownerUid: user.uid,
    name: String(record.name || '사진'),
    mimeType: 'image/jpeg',
    originalSize: Number(record.originalSize || record.size || 0),
    compressedBytes,
    compressedData: record.compressedData,
    savedAt: Number(record.savedAt || Date.now()),
    updatedAt: new Date().toISOString()
  };
}

async function migrateLegacyLocalPhotos(user) {
  const markerKey = PHOTO_VAULT_LEGACY_MIGRATION_PREFIX + user.uid;
  try {
    if (localStorage.getItem(markerKey) === '1') return { migrated: 0, skipped: true };
  } catch (_) {}

  const localRecords = (await legacyLocalPhotoVaultRecords()).filter(record => record?.key && record?.compressedData);
  if (!localRecords.length) {
    try { localStorage.setItem(markerKey, '1'); } catch (_) {}
    return { migrated: 0, skipped: false };
  }

  photoVaultStatus(`현재 기기에 남아 있는 기존 사진 ${localRecords.length}장을 동기화하는 중입니다.`);

  const cloudSnapshot = await db.collection(PHOTO_VAULT_COLLECTION)
    .where('ownerUid', '==', user.uid)
    .get();
  const existingKeys = new Set(cloudSnapshot.docs.map(item => item.id));

  let migrated = 0;
  let failed = 0;
  for (const record of localRecords) {
    if (existingKeys.has(record.key)) continue;
    try {
      await db.collection(PHOTO_VAULT_COLLECTION)
        .doc(record.key)
        .set(buildFirestorePhotoRecord(user, record), { merge: true });
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error('기존 사진 동기화 실패:', record.key, error);
    }
  }

  if (failed === 0) {
    try { localStorage.setItem(markerKey, '1'); } catch (_) {}
  }
  return { migrated, failed, skipped: false };
}

function stopPhotoVaultRealtime() {
  if (photoVaultUnsubscribe) photoVaultUnsubscribe();
  photoVaultUnsubscribe = null;
  photoVaultSubscribedUid = '';
  photoVaultRecordsCache = [];
}

async function ensurePhotoVaultRealtime() {
  const user = await activePhotoVaultUser();
  if (!user) {
    stopPhotoVaultRealtime();
    return null;
  }

  if (photoVaultSubscribedUid === user.uid && photoVaultUnsubscribe) return user;

  stopPhotoVaultRealtime();
  photoVaultSubscribedUid = user.uid;

  if (!photoVaultMigrationPromise) {
    photoVaultMigrationPromise = migrateLegacyLocalPhotos(user)
      .catch(error => {
        console.warn('기존 사진 자동 동기화 오류:', error);
        return { migrated: 0, failed: 1 };
      })
      .finally(() => {
        photoVaultMigrationPromise = null;
      });
    await photoVaultMigrationPromise;
  }

  const photoQuery = db.collection(PHOTO_VAULT_COLLECTION)
    .where('ownerUid', '==', user.uid);

  photoVaultUnsubscribe = photoQuery.onSnapshot(snapshot => {
    photoVaultRecordsCache = snapshot.docs
      .map(normalizePhotoVaultRecord)
      .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
    renderPhotoVaultList(photoVaultRecordsCache);
  }, error => {
    console.error('사진 보관함 실시간 동기화 오류:', error);
    photoVaultStatus(
      error?.code === 'permission-denied'
        ? '사진 보관함 권한이 거부되었습니다. Firestore 규칙과 로그인 계정을 확인해 주세요.'
        : '사진 보관함을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.'
    );
  });

  return user;
}

async function addPhotoVaultFiles(files) {
  const inputFiles = Array.from(files || []).filter(file => file.type?.startsWith('image/'));
  if (!inputFiles.length) return;

  const user = await ensurePhotoVaultRealtime();
  if (!user) {
    alert('사진을 기기 간에 공유하려면 먼저 로그인해 주세요.');
    const input = document.getElementById('photoVaultUpload');
    if (input) input.value = '';
    return;
  }

  let saved = 0;
  let failed = 0;
  for (let index = 0; index < inputFiles.length; index += 1) {
    const file = inputFiles[index];
    photoVaultStatus(`사진 압축 및 Firestore 저장 중 ${index + 1}/${inputFiles.length}`);
    try {
      const compressed = await compressSmart(file);
      const key = `photo-vault-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      const record = buildFirestorePhotoRecord(user, {
        name: file.name || `사진_${index + 1}`,
        originalSize: file.size || 0,
        compressedData: compressed.data,
        compressedBytes: compressed.bytes,
        savedAt: Date.now()
      });

      await db.collection(PHOTO_VAULT_COLLECTION).doc(key).set(record);
      saved += 1;
    } catch (error) {
      failed += 1;
      console.error('사진 보관함 저장 오류:', error);
    }
  }

  const input = document.getElementById('photoVaultUpload');
  if (input) input.value = '';
  selectedPhotoVaultKeys.clear();

  photoVaultStatus(
    failed
      ? `${saved}장 동기화 완료 · ${failed}장 실패`
      : `${saved}장 압축 저장 및 기기 간 동기화 완료`
  );
}

async function fetchBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`사진 다운로드 실패 (${response.status})`);
  return response.blob();
}

async function photoVaultRecords() {
  await ensurePhotoVaultRealtime();
  return [...photoVaultRecordsCache];
}

async function downloadPhotoVaultItem(key, index) {
  const records = await photoVaultRecords();
  const record = records.find(item => item.key === key);
  if (!record) return;

  const base = String(record.name || `사진_${index + 1}`)
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]/g, '_');

  try {
    if (record.compressedData) {
      saveDataUrlFile(record.compressedData, `${base}_압축본.jpg`);
      return;
    }
    if (record.compressedUrl) {
      saveBlobFile(await fetchBlob(record.compressedUrl), `${base}_압축본.jpg`);
      return;
    }
    alert('이 사진에는 공유 가능한 압축본이 없습니다. 사진 보관함에서 다시 올려 주세요.');
  } catch (error) {
    console.error('사진 다운로드 오류:', error);
    alert('사진을 다운로드하지 못했습니다. 네트워크 연결을 확인해 주세요.');
  }
}

async function downloadSelectedPhotoVaultItems() {
  const records = await photoVaultRecords();
  const selected = records.filter(record => selectedPhotoVaultKeys.has(record.key));
  if (!selected.length) {
    alert('다운로드할 사진을 선택해 주세요.');
    return;
  }

  for (let index = 0; index < selected.length; index += 1) {
    await downloadPhotoVaultItem(selected[index].key, index);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
}

function togglePhotoVaultSelection(key, checked) {
  if (checked) selectedPhotoVaultKeys.add(key);
  else selectedPhotoVaultKeys.delete(key);
  updatePhotoVaultSelectionUi();
}

async function selectAllPhotoVaultItems(checked = true) {
  const records = await photoVaultRecords();
  selectedPhotoVaultKeys = checked ? new Set(records.map(record => record.key)) : new Set();
  renderPhotoVaultList(records);
}

function updatePhotoVaultSelectionUi() {
  const count = document.getElementById('photoVaultSelectedCount');
  if (count) count.textContent = `${selectedPhotoVaultKeys.size}장 선택`;
  document.querySelectorAll('[data-photo-vault-key]').forEach(input => {
    input.checked = selectedPhotoVaultKeys.has(input.dataset.photoVaultKey);
  });
}

async function deletePhotoVaultEverywhere(record) {
  const user = await activePhotoVaultUser();
  if (user && record?.key) {
    await db.collection(PHOTO_VAULT_COLLECTION).doc(record.key).delete();
  }

  // 이전 버전에서 현재 기기의 IndexedDB에 저장된 같은 사진이 있으면 함께 정리합니다.
  if (typeof deleteOriginalTripPhoto === 'function' && record?.key) {
    await deleteOriginalTripPhoto(record.key);
  }
}

async function deletePhotoVaultItem(key) {
  const accepted = await askYesNo('이 사진을 사진 보관함에서 삭제하시겠습니까?', '사진 삭제');
  if (!accepted) return;

  const record = (await photoVaultRecords()).find(item => item.key === key);
  if (record) {
    try {
      await deletePhotoVaultEverywhere(record);
    } catch (error) {
      console.error('사진 삭제 오류:', error);
      alert('사진을 삭제하지 못했습니다. Firestore 권한과 네트워크 연결을 확인해 주세요.');
      return;
    }
  }
  selectedPhotoVaultKeys.delete(key);
}

async function deleteSelectedPhotoVaultItems() {
  const keys = Array.from(selectedPhotoVaultKeys);
  if (!keys.length) {
    alert('삭제할 사진을 선택해 주세요.');
    return;
  }

  const accepted = await askYesNo(`선택한 사진 ${keys.length}장을 삭제하시겠습니까?`, '선택 사진 삭제');
  if (!accepted) return;

  const records = await photoVaultRecords();
  let failed = 0;
  for (const record of records.filter(item => selectedPhotoVaultKeys.has(item.key))) {
    try {
      await deletePhotoVaultEverywhere(record);
    } catch (error) {
      failed += 1;
      console.error('선택 사진 삭제 오류:', record.key, error);
    }
  }
  selectedPhotoVaultKeys.clear();
  if (failed) alert(`${failed}장의 사진을 삭제하지 못했습니다.`);
}

function renderPhotoVaultList(records) {
  const list = document.getElementById('photoVaultList');
  if (!list) return;

  const availableKeys = new Set(records.map(record => record.key));
  selectedPhotoVaultKeys = new Set(
    Array.from(selectedPhotoVaultKeys).filter(key => availableKeys.has(key))
  );

  if (!records.length) {
    list.innerHTML = '<div class="photo-vault-empty">보관된 사진이 없습니다.<br>사진을 올리면 같은 계정으로 로그인한 휴대폰과 컴퓨터에서 함께 표시됩니다.</div>';
    photoVaultStatus('보관 사진 0장 · Firestore 무료 저장 방식');
    updatePhotoVaultSelectionUi();
    return;
  }

  list.innerHTML = records.map((record, index) => {
    const preview = record.compressedData || record.compressedUrl || '';
    const compressedSize = typeof kb === 'function' ? kb(record.compressedBytes || 0) : '';
    const encodedKey = encodeURIComponent(record.key);
    const checked = selectedPhotoVaultKeys.has(record.key) ? 'checked' : '';
    const previewHtml = preview
      ? `<img src="${preview}" alt="보관 사진 ${index + 1}" loading="lazy" decoding="async">`
      : '<div class="photo-vault-empty">압축본 없음</div>';

    return `<article class="photo-vault-item">
      <label class="photo-vault-check"><input type="checkbox" data-photo-vault-key="${esc(record.key)}" ${checked} onchange="togglePhotoVaultSelection(decodeURIComponent('${encodedKey}'), this.checked)"><span>선택</span></label>
      ${previewHtml}
      <div class="photo-vault-item-meta small">
        <strong>${esc(record.name || `사진 ${index + 1}`)}</strong><br>
        압축본 ${compressedSize || '-'} · Firestore 공유됨
      </div>
      <div class="photo-vault-item-actions">
        <button class="g" type="button" onclick="downloadPhotoVaultItem(decodeURIComponent('${encodedKey}'), ${index})" ${validSharedPhoto(record) || record.compressedUrl ? '' : 'disabled'}>압축본 다운로드</button>
        <button class="d" type="button" onclick="deletePhotoVaultItem(decodeURIComponent('${encodedKey}'))">삭제</button>
      </div>
    </article>`;
  }).join('');

  photoVaultStatus(`사진 ${records.length}장 · 같은 Firebase 계정의 기기에서 실시간 공유`);
  updatePhotoVaultSelectionUi();
}

async function renderPhotoVault() {
  const list = document.getElementById('photoVaultList');
  if (!list) return;

  photoVaultStatus('Firestore 사진 보관함에 연결하는 중입니다.');
  const user = await ensurePhotoVaultRealtime();
  if (!user) {
    list.innerHTML = '<div class="photo-vault-empty">로그인 후 사진을 올려 주세요.<br>휴대폰과 컴퓨터에서 같은 이메일 계정으로 로그인해야 사진이 공유됩니다.</div>';
    photoVaultStatus('로그인이 필요합니다.');
    updatePhotoVaultSelectionUi();
    return;
  }

  renderPhotoVaultList(photoVaultRecordsCache);
}
