'use strict';

let selectedPhotoVaultKeys = new Set();

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const binary = atob(parts[1] || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function activePhotoVaultUser() {
  if (typeof initializeFirebase === 'function') await initializeFirebase();
  return USE_FIREBASE && auth?.currentUser && db && storage ? auth.currentUser : null;
}

async function localPhotoVaultRecords() {
  if (typeof listOriginalTripPhotos !== 'function') return [];
  try { return await listOriginalTripPhotos(); } catch (_) { return []; }
}

async function cloudPhotoVaultRecords() {
  const user = await activePhotoVaultUser();
  if (!user) return [];
  try {
    const snapshot = await db.collection('photoVault')
      .where('ownerUid', '==', user.uid)
      .get();
    return snapshot.docs.map(doc => ({
      key: doc.id,
      ...doc.data(),
      cloud: true
    }));
  } catch (error) {
    console.error('사진 보관함 서버 목록 오류:', error);
    return [];
  }
}

async function photoVaultRecords() {
  const [local, cloud] = await Promise.all([
    localPhotoVaultRecords(),
    cloudPhotoVaultRecords()
  ]);
  const merged = new Map();
  local.forEach(item => merged.set(item.key, { ...item, local: true }));
  cloud.forEach(item => merged.set(item.key, { ...(merged.get(item.key) || {}), ...item, cloud: true }));
  return [...merged.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

async function uploadPhotoVaultCloud(record) {
  const user = await activePhotoVaultUser();
  if (!user) return false;
  const basePath = `photo-vault/${user.uid}/${record.key}`;
  const originalBlob = record.blob instanceof Blob ? record.blob : dataUrlToBlob(record.data);
  const compressedBlob = dataUrlToBlob(record.compressedData);
  const originalRef = storage.ref(`${basePath}/original`);
  const compressedRef = storage.ref(`${basePath}/compressed.jpg`);

  await Promise.all([
    originalRef.put(originalBlob, { contentType: record.type || originalBlob.type || 'application/octet-stream' }),
    compressedRef.put(compressedBlob, { contentType: 'image/jpeg' })
  ]);
  const [originalUrl, compressedUrl] = await Promise.all([
    originalRef.getDownloadURL(),
    compressedRef.getDownloadURL()
  ]);
  await db.collection('photoVault').doc(record.key).set({
    ownerUid: user.uid,
    name: record.name,
    type: record.type,
    size: record.size,
    compressedBytes: record.compressedBytes,
    originalPath: `${basePath}/original`,
    compressedPath: `${basePath}/compressed.jpg`,
    originalUrl,
    compressedUrl,
    savedAt: record.savedAt,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  return true;
}

async function addPhotoVaultFiles(files) {
  const inputFiles = Array.from(files || []).filter(file => file.type?.startsWith('image/'));
  if (!inputFiles.length) return;

  const status = document.getElementById('photoVaultStatus');
  let saved = 0;
  let synced = 0;
  for (let index = 0; index < inputFiles.length; index += 1) {
    const file = inputFiles[index];
    if (status) status.textContent = `사진 압축 및 서버 저장 중 ${index + 1}/${inputFiles.length}`;
    try {
      const compressed = await compressSmart(file);
      const key = `photo-vault-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      const record = {
        key,
        blob: file,
        data: '',
        name: file.name || `사진_${index + 1}`,
        type: file.type || 'image/jpeg',
        size: file.size || 0,
        compressedData: compressed.data,
        compressedBytes: compressed.bytes,
        savedAt: Date.now()
      };
      await saveOriginalTripPhoto(key, file, record.name, record.type, compressed.data, compressed.bytes);
      saved += 1;
      try {
        if (await uploadPhotoVaultCloud(record)) synced += 1;
      } catch (cloudError) {
        console.error('사진 서버 업로드 오류:', cloudError);
      }
    } catch (error) {
      console.error('사진 보관함 저장 오류:', error);
    }
  }

  const input = document.getElementById('photoVaultUpload');
  if (input) input.value = '';
  selectedPhotoVaultKeys.clear();
  await renderPhotoVault();
  if (status) {
    status.textContent = synced === saved
      ? `${saved}장 저장 및 기기 간 동기화 완료`
      : `${saved}장 기기에 저장 · ${synced}장 서버 동기화 완료`;
  }
}

async function fetchBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`사진 다운로드 실패 (${response.status})`);
  return response.blob();
}

async function downloadPhotoVaultItem(key, index, modeOverride = '') {
  const records = await photoVaultRecords();
  const record = records.find(item => item.key === key);
  if (!record) return;

  const mode = modeOverride || document.querySelector('input[name="photoVaultDownloadMode"]:checked')?.value || 'original';
  const base = String(record.name || `사진_${index + 1}`).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  try {
    if (mode === 'original') {
      if (await downloadStoredOriginal(record, index)) return;
      if (record.originalUrl) {
        saveBlobFile(await fetchBlob(record.originalUrl), String(record.name || `사진_${index + 1}`));
        return;
      }
    }
    if (record.compressedData) {
      saveDataUrlFile(record.compressedData, `${base}_압축본.jpg`);
      return;
    }
    if (record.compressedUrl) {
      saveBlobFile(await fetchBlob(record.compressedUrl), `${base}_압축본.jpg`);
    }
  } catch (error) {
    console.error('사진 다운로드 오류:', error);
    alert('사진을 다운로드하지 못했습니다. 네트워크 연결과 Firebase Storage 권한을 확인해 주세요.');
  }
}

async function downloadSelectedPhotoVaultItems() {
  const records = await photoVaultRecords();
  const selected = records.filter(record => selectedPhotoVaultKeys.has(record.key));
  if (!selected.length) { alert('다운로드할 사진을 선택해 주세요.'); return; }
  const mode = document.querySelector('input[name="photoVaultDownloadMode"]:checked')?.value || 'original';
  for (let index = 0; index < selected.length; index += 1) {
    await downloadPhotoVaultItem(selected[index].key, index, mode);
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
  renderPhotoVault();
}

function updatePhotoVaultSelectionUi() {
  const count = document.getElementById('photoVaultSelectedCount');
  if (count) count.textContent = `${selectedPhotoVaultKeys.size}장 선택`;
  document.querySelectorAll('[data-photo-vault-key]').forEach(input => {
    input.checked = selectedPhotoVaultKeys.has(input.dataset.photoVaultKey);
  });
}

async function deletePhotoVaultEverywhere(record) {
  await deleteOriginalTripPhoto(record.key);
  const user = await activePhotoVaultUser();
  if (!user || !record.cloud) return;
  const deletions = [];
  if (record.originalPath) deletions.push(storage.ref(record.originalPath).delete().catch(() => {}));
  if (record.compressedPath) deletions.push(storage.ref(record.compressedPath).delete().catch(() => {}));
  deletions.push(db.collection('photoVault').doc(record.key).delete().catch(() => {}));
  await Promise.all(deletions);
}

async function deletePhotoVaultItem(key) {
  const accepted = await askYesNo('이 사진을 사진 보관함에서 삭제하시겠습니까?', '사진 삭제');
  if (!accepted) return;
  const record = (await photoVaultRecords()).find(item => item.key === key);
  if (record) await deletePhotoVaultEverywhere(record);
  selectedPhotoVaultKeys.delete(key);
  renderPhotoVault();
}

async function deleteSelectedPhotoVaultItems() {
  const keys = Array.from(selectedPhotoVaultKeys);
  if (!keys.length) { alert('삭제할 사진을 선택해 주세요.'); return; }
  const accepted = await askYesNo(`선택한 사진 ${keys.length}장을 삭제하시겠습니까?`, '선택 사진 삭제');
  if (!accepted) return;
  const records = await photoVaultRecords();
  for (const record of records.filter(item => selectedPhotoVaultKeys.has(item.key))) {
    await deletePhotoVaultEverywhere(record);
  }
  selectedPhotoVaultKeys.clear();
  renderPhotoVault();
}

async function renderPhotoVault() {
  const list = document.getElementById('photoVaultList');
  const status = document.getElementById('photoVaultStatus');
  if (!list) return;
  if (status) status.textContent = '휴대폰·컴퓨터 사진을 동기화하는 중입니다.';

  const records = await photoVaultRecords();
  const availableKeys = new Set(records.map(record => record.key));
  selectedPhotoVaultKeys = new Set(Array.from(selectedPhotoVaultKeys).filter(key => availableKeys.has(key)));

  if (!records.length) {
    list.innerHTML = '<div class="photo-vault-empty">보관된 사진이 없습니다.<br>사진을 올리면 로그인한 계정의 휴대폰과 컴퓨터에서 함께 확인할 수 있습니다.</div>';
    if (status) status.textContent = '보관 사진 0장';
    updatePhotoVaultSelectionUi();
    return;
  }

  list.innerHTML = records.map((record, index) => {
    const preview = record.compressedData || record.compressedUrl || record.data || '';
    const originalSize = typeof kb === 'function' ? kb(record.size || record.blob?.size || 0) : '';
    const compressedSize = typeof kb === 'function' ? kb(record.compressedBytes || 0) : '';
    const safeKey = String(record.key).replace(/'/g, "\\'");
    const checked = selectedPhotoVaultKeys.has(record.key) ? 'checked' : '';
    const syncLabel = record.cloud ? '기기 간 공유됨' : '현재 기기에만 저장됨';
    return `<article class="photo-vault-item">
      <label class="photo-vault-check"><input type="checkbox" data-photo-vault-key="${esc(record.key)}" ${checked} onchange="togglePhotoVaultSelection('${safeKey}', this.checked)"><span>선택</span></label>
      <img src="${preview}" alt="보관 사진 ${index + 1}" loading="lazy" decoding="async">
      <div class="photo-vault-item-meta small">
        <strong>${esc(record.name || `사진 ${index + 1}`)}</strong><br>
        원본 ${originalSize} · 압축 ${compressedSize || '-'}<br>${syncLabel}
      </div>
      <div class="photo-vault-item-actions">
        <button class="p" type="button" onclick="downloadPhotoVaultItem('${safeKey}', ${index}, 'original')">원본</button>
        <button class="g" type="button" onclick="downloadPhotoVaultItem('${safeKey}', ${index}, 'compressed')">압축본</button>
        <button class="d" type="button" onclick="deletePhotoVaultItem('${safeKey}')">삭제</button>
      </div>
    </article>`;
  }).join('');

  if (status) status.textContent = `사진 ${records.length}장 · 같은 계정의 기기에서 공유`;
  updatePhotoVaultSelectionUi();
}
