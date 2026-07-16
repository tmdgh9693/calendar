'use strict';

const PHOTO_VAULT_COLLECTION = 'photoVault';
const PHOTO_VAULT_CHUNK_COLLECTION = 'chunks';
const PHOTO_VAULT_MAX_DOCUMENT_IMAGE_BYTES = 700 * 1024;
const PHOTO_VAULT_ORIGINAL_CHUNK_BYTES = 620 * 1024;
const PHOTO_VAULT_MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const PHOTO_VAULT_LEGACY_MIGRATION_PREFIX = 'aton-photo-vault-original-firestore-migrated-v3:';

let selectedPhotoVaultKeys = new Set();
let photoVaultRecordsCache = [];
let photoVaultUnsubscribe = null;
let photoVaultSubscribedUid = '';
let photoVaultMigrationPromise = null;
let photoVaultUiInitialized = false;
let photoVaultRepairTargetKey = '';
let photoVaultOriginalProbeRunning = false;

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

function safePhotoFilename(name, fallback = '사진') {
  return String(name || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

function filenameBase(name, fallback = '사진') {
  return safePhotoFilename(name, fallback).replace(/\.[^.]+$/, '');
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/);
  if (!match) return null;
  const mimeType = match[1] || 'application/octet-stream';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function firestoreBlobFromBytes(bytes) {
  const BlobType = window.firebase?.firestore?.Blob;
  if (!BlobType?.fromUint8Array) {
    throw new Error('Firestore 바이트 저장 기능을 사용할 수 없습니다. 페이지를 새로고침해 주세요.');
  }
  return BlobType.fromUint8Array(bytes);
}

function firestoreBytesToUint8Array(value) {
  if (!value) return new Uint8Array();
  if (typeof value.toUint8Array === 'function') return value.toUint8Array();
  if (value instanceof Uint8Array) return value;
  if (value.bytes_ instanceof Uint8Array) return value.bytes_;
  throw new Error('저장된 원본 사진 조각을 읽을 수 없습니다.');
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
  const compressedBytes = Number(
    record.compressedBytes ||
    (typeof dataBytes === 'function' ? dataBytes(record.compressedData) : 0)
  );

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
    originalMimeType: String(record.originalMimeType || record.type || 'application/octet-stream'),
    originalSize: Number(record.originalSize || record.size || 0),
    originalChunkCount: Number(record.originalChunkCount || 0),
    originalStored: record.originalStored === true,
    compressedBytes,
    compressedData: record.compressedData,
    savedAt: Number(record.savedAt || Date.now()),
    updatedAt: new Date().toISOString()
  };
}

async function deleteOriginalChunks(photoRef, ownerUid) {
  if (!ownerUid) throw new Error('사진 소유자 정보를 확인할 수 없습니다.');
  const snapshot = await photoRef
    .collection(PHOTO_VAULT_CHUNK_COLLECTION)
    .where('ownerUid', '==', ownerUid)
    .get();
  if (snapshot.empty) return;

  const docs = snapshot.docs;
  for (let start = 0; start < docs.length; start += 400) {
    const batch = db.batch();
    docs.slice(start, start + 400).forEach(item => batch.delete(item.ref));
    await batch.commit();
  }
}

async function writeChunkWithRetry(chunkRef, payload, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await chunkRef.set(payload);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 450 * attempt));
      }
    }
  }
  throw lastError || new Error('원본 사진 조각 저장에 실패했습니다.');
}

async function uploadOriginalChunks(photoRef, user, file, progressLabel = '') {
  if (!(file instanceof Blob)) throw new Error('원본 사진 파일을 읽을 수 없습니다.');
  if (!file.size) throw new Error('비어 있는 사진 파일은 올릴 수 없습니다.');
  if (file.size > PHOTO_VAULT_MAX_ORIGINAL_BYTES) {
    throw new Error(`원본 사진은 한 장당 ${Math.round(PHOTO_VAULT_MAX_ORIGINAL_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`);
  }

  await deleteOriginalChunks(photoRef, user.uid);

  const totalChunks = Math.ceil(file.size / PHOTO_VAULT_ORIGINAL_CHUNK_BYTES);
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * PHOTO_VAULT_ORIGINAL_CHUNK_BYTES;
    const end = Math.min(file.size, start + PHOTO_VAULT_ORIGINAL_CHUNK_BYTES);
    const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());

    photoVaultStatus(
      `${progressLabel || '원본 사진'} 저장 중 ${index + 1}/${totalChunks}`
    );

    await writeChunkWithRetry(
      photoRef.collection(PHOTO_VAULT_CHUNK_COLLECTION).doc(String(index).padStart(5, '0')),
      {
        ownerUid: user.uid,
        index,
        size: bytes.byteLength,
        bytes: firestoreBlobFromBytes(bytes)
      }
    );
  }

  return totalChunks;
}

async function savePhotoVaultFile(user, file, options = {}) {
  const compressed = options.compressedData
    ? {
        data: options.compressedData,
        bytes: Number(options.compressedBytes || (typeof dataBytes === 'function' ? dataBytes(options.compressedData) : 0))
      }
    : await compressSmart(file);

  const photoRef = options.key
    ? db.collection(PHOTO_VAULT_COLLECTION).doc(options.key)
    : db.collection(PHOTO_VAULT_COLLECTION).doc();

  let chunkCount = 0;
  try {
    chunkCount = await uploadOriginalChunks(
      photoRef,
      user,
      file,
      options.progressLabel || safePhotoFilename(options.name || file.name || '사진')
    );

    await photoRef.set(buildFirestorePhotoRecord(user, {
      name: options.name || file.name || '사진',
      originalMimeType: options.type || file.type || 'application/octet-stream',
      originalSize: file.size || 0,
      originalChunkCount: chunkCount,
      originalStored: true,
      compressedData: compressed.data,
      compressedBytes: compressed.bytes,
      savedAt: options.savedAt || Date.now()
    }), { merge: true });

    return photoRef.id;
  } catch (error) {
    try {
      await deleteOriginalChunks(photoRef, user.uid);
      if (!options.keepMetadataOnFailure) await photoRef.delete();
    } catch (_) {}
    throw error;
  }
}

async function migrateLegacyLocalPhotos(user) {
  const markerKey = PHOTO_VAULT_LEGACY_MIGRATION_PREFIX + user.uid;
  try {
    if (localStorage.getItem(markerKey) === '1') return { migrated: 0, skipped: true };
  } catch (_) {}

  const localRecords = (await legacyLocalPhotoVaultRecords())
    .filter(record => record?.key && (record?.blob instanceof Blob || record?.data));

  if (!localRecords.length) {
    try { localStorage.setItem(markerKey, '1'); } catch (_) {}
    return { migrated: 0, skipped: false };
  }

  const cloudSnapshot = await db.collection(PHOTO_VAULT_COLLECTION)
    .where('ownerUid', '==', user.uid)
    .get();
  const cloudByKey = new Map(cloudSnapshot.docs.map(item => [item.id, item.data()]));

  let migrated = 0;
  let failed = 0;

  for (let index = 0; index < localRecords.length; index += 1) {
    const record = localRecords[index];
    const existing = cloudByKey.get(record.key);
    if (existing?.originalStored === true) continue;

    const originalBlob = record.blob instanceof Blob ? record.blob : dataUrlToBlob(record.data);
    if (!originalBlob || !record.compressedData) continue;

    photoVaultStatus(`현재 기기에 남은 원본 사진 복구 중 ${index + 1}/${localRecords.length}`);
    try {
      await savePhotoVaultFile(user, originalBlob, {
        key: record.key,
        name: record.name || `사진_${index + 1}`,
        type: record.type || originalBlob.type,
        compressedData: record.compressedData,
        compressedBytes: record.compressedBytes,
        savedAt: record.savedAt,
        keepMetadataOnFailure: !!existing,
        progressLabel: `기존 원본 ${index + 1}`
      });
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error('기존 원본 사진 복구 실패:', record.key, error);
    }
  }

  if (failed === 0) {
    try { localStorage.setItem(markerKey, '1'); } catch (_) {}
  }

  return { migrated, failed, skipped: false };
}


async function probeCloudOriginalAvailability(records) {
  if (photoVaultOriginalProbeRunning) return;
  const user = await activePhotoVaultUser();
  if (!user) return;
  const targets = (records || []).filter(record =>
    record?.key &&
    record.originalStored !== true &&
    (record.compressedData || record.compressedUrl)
  );
  if (!targets.length) return;

  photoVaultOriginalProbeRunning = true;
  let changed = false;
  try {
    for (const record of targets) {
      try {
        const photoRef = db.collection(PHOTO_VAULT_COLLECTION).doc(record.key);
        const snapshot = await photoRef
          .collection(PHOTO_VAULT_CHUNK_COLLECTION)
          .where('ownerUid', '==', user.uid)
          .get();
        if (snapshot.empty) continue;

        const chunkCount = snapshot.size;
        const originalSize = snapshot.docs.reduce((sum, item) => sum + Number(item.data()?.size || 0), 0);
        record.originalStored = true;
        record.originalChunkCount = chunkCount;
        if (!record.originalSize && originalSize) record.originalSize = originalSize;
        changed = true;

        await photoRef.set({
          originalStored: true,
          originalChunkCount: chunkCount,
          originalSize: Number(record.originalSize || originalSize || 0),
          originalUploadStatus: 'ready',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.warn('원본 사진 상태 확인 실패:', record.key, error);
      }
    }
  } finally {
    photoVaultOriginalProbeRunning = false;
  }

  if (changed) renderPhotoVaultList(photoVaultRecordsCache);
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
        console.warn('기존 사진 자동 복구 오류:', error);
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
      .filter(record => record.test !== true && (record.compressedData || record.compressedUrl))
      .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
    renderPhotoVaultList(photoVaultRecordsCache);
    probeCloudOriginalAvailability(photoVaultRecordsCache);
  }, error => {
    console.error('사진 보관함 실시간 동기화 오류:', error);
    photoVaultStatus(
      error?.code === 'permission-denied'
        ? '사진 보관함 권한이 거부되었습니다. Firestore의 photoVault와 chunks 규칙을 확인해 주세요.'
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
  const failures = [];

  for (let index = 0; index < inputFiles.length; index += 1) {
    const file = inputFiles[index];
    photoVaultStatus(`사진 압축 중 ${index + 1}/${inputFiles.length}`);
    try {
      await savePhotoVaultFile(user, file, {
        name: file.name || `사진_${index + 1}`,
        type: file.type,
        savedAt: Date.now(),
        progressLabel: `${index + 1}번째 원본`
      });
      saved += 1;
    } catch (error) {
      failed += 1;
      failures.push(`${file.name || `사진 ${index + 1}`}: ${error.message || error}`);
      console.error('사진 보관함 저장 오류:', error);
    }
  }

  const input = document.getElementById('photoVaultUpload');
  if (input) input.value = '';
  selectedPhotoVaultKeys.clear();

  photoVaultStatus(
    failed
      ? `${saved}장 저장 완료 · ${failed}장 실패`
      : `${saved}장의 원본과 압축본을 저장하고 기기 간 동기화했습니다.`
  );

  if (failures.length) {
    alert(`일부 사진을 저장하지 못했습니다.\n\n${failures.slice(0, 3).join('\n')}`);
  }
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

async function getOriginalPhotoBlob(record) {
  if (!record?.key) throw new Error('사진 정보를 찾을 수 없습니다.');
  const user = await activePhotoVaultUser();
  if (!user) throw new Error('원본 사진을 받으려면 로그인해 주세요.');

  const snapshot = await db.collection(PHOTO_VAULT_COLLECTION)
    .doc(record.key)
    .collection(PHOTO_VAULT_CHUNK_COLLECTION)
    .where('ownerUid', '==', user.uid)
    .get();

  const chunks = snapshot.docs
    .map(item => item.data())
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));

  if (chunks.length) {
    if (record.originalChunkCount && chunks.length !== Number(record.originalChunkCount)) {
      throw new Error('원본 사진 조각이 일부 누락되었습니다.');
    }

    const byteParts = chunks.map(chunk => firestoreBytesToUint8Array(chunk.bytes));
    const total = byteParts.reduce((sum, part) => sum + part.byteLength, 0);
    if (record.originalSize && total !== Number(record.originalSize)) {
      throw new Error('원본 사진 크기가 일치하지 않습니다.');
    }

    return new Blob(byteParts, {
      type: record.originalMimeType || 'application/octet-stream'
    });
  }

  if (typeof getOriginalTripPhoto === 'function') {
    try {
      const local = await getOriginalTripPhoto(record.key);
      if (local?.blob instanceof Blob) return local.blob;
      if (local?.data) {
        const localBlob = dataUrlToBlob(local.data);
        if (localBlob) return localBlob;
      }
    } catch (_) {}
  }

  throw new Error('이 사진의 원본은 아직 서버에 저장되지 않았습니다. 같은 사진 카드의 “원본 다시 연결”로 원본 파일을 선택해 주세요.');
}

async function getCompressedPhotoBlob(record) {
  if (record?.compressedData) {
    const blob = dataUrlToBlob(record.compressedData);
    if (blob) return blob;
  }
  if (record?.compressedUrl) return fetchBlob(record.compressedUrl);
  throw new Error('공유 가능한 압축본이 없습니다.');
}

async function downloadPhotoVaultItem(key, index, type = 'original') {
  const records = await photoVaultRecords();
  const record = records.find(item => item.key === key);
  if (!record) return;

  const base = filenameBase(record.name, `사진_${index + 1}`);

  try {
    if (type === 'compressed') {
      saveBlobFile(await getCompressedPhotoBlob(record), `${base}_압축본.jpg`);
      return;
    }

    const original = await getOriginalPhotoBlob(record);
    saveBlobFile(original, safePhotoFilename(record.name, `${base}_원본`));
  } catch (error) {
    console.error('사진 다운로드 오류:', error);
    alert(error.message || '사진을 다운로드하지 못했습니다.');
  }
}

async function buildSelectedPhotoZip(selected, type) {
  if (typeof ensureJSZip !== 'function') {
    throw new Error('ZIP 생성 기능을 불러오지 못했습니다.');
  }
  await ensureJSZip();
  const zip = new JSZip();

  for (let index = 0; index < selected.length; index += 1) {
    const record = selected[index];
    photoVaultStatus(`선택 사진 ZIP 준비 중 ${index + 1}/${selected.length}`);

    if (type === 'original') {
      const originalBlob = await getOriginalPhotoBlob(record);
      zip.file(safePhotoFilename(record.name, `사진_${index + 1}`), await originalBlob.arrayBuffer());
    } else {
      const compressedBlob = await getCompressedPhotoBlob(record);
      const base = filenameBase(record.name, `사진_${index + 1}`);
      zip.file(`${base}_압축본.jpg`, await compressedBlob.arrayBuffer());
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
}

async function downloadSelectedPhotoVaultItems(type) {
  const selectedType = type || document.getElementById('photoVaultBulkDownloadType')?.value || 'original';
  const records = await photoVaultRecords();
  const selected = records.filter(record => selectedPhotoVaultKeys.has(record.key));
  if (!selected.length) {
    alert('다운로드할 사진을 선택해 주세요.');
    return;
  }

  try {
    const zipBlob = await buildSelectedPhotoZip(selected, selectedType);
    const suffix = selectedType === 'original' ? '원본' : '압축본';
    saveBlobFile(zipBlob, `사진보관함_${suffix}_${new Date().toISOString().slice(0, 10)}.zip`);
    photoVaultStatus(`${selected.length}장의 ${suffix} ZIP 다운로드를 준비했습니다.`);
  } catch (error) {
    console.error('선택 사진 다운로드 오류:', error);
    alert(error.message || '선택 사진을 다운로드하지 못했습니다.');
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
  updatePhotoVaultSelectionUi();
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
    const photoRef = db.collection(PHOTO_VAULT_COLLECTION).doc(record.key);
    await deleteOriginalChunks(photoRef, user.uid);
    await photoRef.delete();
  }

  if (typeof deleteOriginalTripPhoto === 'function' && record?.key) {
    await deleteOriginalTripPhoto(record.key);
  }
}

async function deletePhotoVaultItem(key) {
  const accepted = await askYesNo('이 사진의 원본과 압축본을 모두 삭제하시겠습니까?', '사진 삭제');
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
  updatePhotoVaultSelectionUi();
}

async function deleteSelectedPhotoVaultItems() {
  const keys = Array.from(selectedPhotoVaultKeys);
  if (!keys.length) {
    alert('삭제할 사진을 선택해 주세요.');
    return;
  }

  const accepted = await askYesNo(`선택한 사진 ${keys.length}장의 원본과 압축본을 모두 삭제하시겠습니까?`, '선택 사진 삭제');
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
  updatePhotoVaultSelectionUi();
  if (failed) alert(`${failed}장의 사진을 삭제하지 못했습니다.`);
}


function requestOriginalRepair(key) {
  photoVaultRepairTargetKey = key || '';
  const input = document.getElementById('photoVaultOriginalRepairInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function repairPhotoVaultOriginal(file) {
  const key = photoVaultRepairTargetKey;
  photoVaultRepairTargetKey = '';
  if (!key || !file) return;

  const user = await ensurePhotoVaultRealtime();
  if (!user) {
    alert('원본을 연결하려면 먼저 로그인해 주세요.');
    return;
  }

  const record = photoVaultRecordsCache.find(item => item.key === key);
  if (!record) {
    alert('사진 정보를 찾지 못했습니다.');
    return;
  }

  try {
    await savePhotoVaultFile(user, file, {
      key,
      name: record.name || file.name || '사진',
      type: file.type,
      compressedData: record.compressedData,
      compressedBytes: record.compressedBytes,
      savedAt: record.savedAt || Date.now(),
      keepMetadataOnFailure: true,
      progressLabel: '원본 다시 연결'
    });
    photoVaultStatus('원본 파일을 서버에 연결했습니다. 컴퓨터와 휴대폰에서 원본 다운로드가 가능합니다.');
  } catch (error) {
    console.error('원본 다시 연결 실패:', error);
    alert(error.message || '원본 파일을 연결하지 못했습니다.');
  }
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
    const originalSize = typeof kb === 'function' ? kb(record.originalSize || 0) : '';
    const checked = selectedPhotoVaultKeys.has(record.key) ? 'checked' : '';
    const originalLabel = '원본 다운로드';
    const repairButton = record.originalStored ? '' : `<button class="s" type="button" data-photo-action="attach-original" data-photo-key="${esc(record.key)}">원본 다시 연결</button>`;
    const previewHtml = preview
      ? `<img src="${preview}" alt="보관 사진 ${index + 1}" loading="lazy" decoding="async">`
      : '<div class="photo-vault-empty">압축본 없음</div>';

    return `<article class="photo-vault-item" data-photo-card-key="${esc(record.key)}">
      <label class="photo-vault-check"><input type="checkbox" data-photo-vault-key="${esc(record.key)}" ${checked}><span>선택</span></label>
      ${previewHtml}
      <div class="photo-vault-item-meta small">
        <strong>${esc(record.name || `사진 ${index + 1}`)}</strong><br>
        원본 ${originalSize || '-'} · 압축본 ${compressedSize || '-'}<br>
        ${record.originalStored ? '원본·압축본 Firestore 공유됨' : '압축본만 공유됨'}
      </div>
      <div class="photo-vault-item-actions">
        <button class="p" type="button" data-photo-action="download-original" data-photo-key="${esc(record.key)}" data-photo-index="${index}">${originalLabel}</button>
        ${repairButton}
        <button class="g" type="button" data-photo-action="download-compressed" data-photo-key="${esc(record.key)}" data-photo-index="${index}" ${validSharedPhoto(record) || record.compressedUrl ? '' : 'disabled'}>압축본 다운로드</button>
        <button class="d" type="button" data-photo-action="delete" data-photo-key="${esc(record.key)}">삭제</button>
      </div>
    </article>`;
  }).join('');

  photoVaultStatus(`사진 ${records.length}장 · 같은 계정의 기기에서 실시간 공유`);
  updatePhotoVaultSelectionUi();
}

function initPhotoVaultUi() {
  if (photoVaultUiInitialized) return;
  const section = document.getElementById('photoVault');
  if (!section) return;

  const upload = document.getElementById('photoVaultUpload');
  const selectAll = document.getElementById('photoVaultSelectAllBtn');
  const clearSelection = document.getElementById('photoVaultClearSelectionBtn');
  const downloadSelected = document.getElementById('photoVaultDownloadSelectedBtn');
  const deleteSelected = document.getElementById('photoVaultDeleteSelectedBtn');
  const refresh = document.getElementById('photoVaultRefreshBtn');
  const list = document.getElementById('photoVaultList');
  const repairInput = document.getElementById('photoVaultOriginalRepairInput');

  upload?.addEventListener('change', event => addPhotoVaultFiles(event.target.files));
  selectAll?.addEventListener('click', () => selectAllPhotoVaultItems(true));
  clearSelection?.addEventListener('click', () => selectAllPhotoVaultItems(false));
  downloadSelected?.addEventListener('click', () => downloadSelectedPhotoVaultItems());
  deleteSelected?.addEventListener('click', () => deleteSelectedPhotoVaultItems());
  refresh?.addEventListener('click', () => renderPhotoVault());
  repairInput?.addEventListener('change', event => repairPhotoVaultOriginal(event.target.files?.[0]));

  list?.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-photo-vault-key]');
    if (!checkbox) return;
    togglePhotoVaultSelection(checkbox.dataset.photoVaultKey, checkbox.checked);
  });

  list?.addEventListener('click', event => {
    const button = event.target.closest('[data-photo-action]');
    if (!button || button.disabled) return;
    const key = button.dataset.photoKey;
    const index = Number(button.dataset.photoIndex || 0);
    const action = button.dataset.photoAction;

    if (action === 'download-original') downloadPhotoVaultItem(key, index, 'original');
    if (action === 'download-compressed') downloadPhotoVaultItem(key, index, 'compressed');
    if (action === 'attach-original') requestOriginalRepair(key);
    if (action === 'delete') deletePhotoVaultItem(key);
  });

  photoVaultUiInitialized = true;
}

async function renderPhotoVault() {
  const list = document.getElementById('photoVaultList');
  if (!list) return;

  initPhotoVaultUi();
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

document.addEventListener('sectionsloaded', initPhotoVaultUi);
document.addEventListener('DOMContentLoaded', initPhotoVaultUi);
