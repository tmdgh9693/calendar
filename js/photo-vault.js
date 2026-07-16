'use strict';

let selectedPhotoVaultKeys = new Set();

async function photoVaultRecords() {
  if (typeof listOriginalTripPhotos !== 'function') return [];
  try {
    return await listOriginalTripPhotos();
  } catch (_) {
    return [];
  }
}

async function addPhotoVaultFiles(files) {
  const inputFiles = Array.from(files || []).filter(file => file.type?.startsWith('image/'));
  if (!inputFiles.length) return;

  const status = document.getElementById('photoVaultStatus');
  let saved = 0;
  for (let index = 0; index < inputFiles.length; index += 1) {
    const file = inputFiles[index];
    if (status) status.textContent = `사진 압축 및 저장 중 ${index + 1}/${inputFiles.length}`;
    try {
      const compressed = await compressSmart(file);
      const key = `photo-vault-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      await saveOriginalTripPhoto(
        key,
        file,
        file.name || `사진_${index + 1}`,
        file.type || 'image/jpeg',
        compressed.data,
        compressed.bytes
      );
      saved += 1;
    } catch (error) {
      console.error('사진 보관함 저장 오류:', error);
    }
  }

  const input = document.getElementById('photoVaultUpload');
  if (input) input.value = '';
  selectedPhotoVaultKeys.clear();
  await renderPhotoVault();
  if (status) status.textContent = `${saved}장 저장 완료`;
}

async function downloadPhotoVaultItem(key, index, modeOverride = '') {
  const records = await photoVaultRecords();
  const record = records.find(item => item.key === key);
  if (!record) return;

  const mode = modeOverride || document.querySelector('input[name="photoVaultDownloadMode"]:checked')?.value || 'original';
  if (mode === 'original') {
    const downloaded = await downloadStoredOriginal(record, index);
    if (downloaded) return;
  }
  if (record.compressedData) {
    const base = String(record.name || `사진_${index + 1}`).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
    saveDataUrlFile(record.compressedData, `${base}_압축본.jpg`);
  }
}

async function downloadSelectedPhotoVaultItems() {
  const records = await photoVaultRecords();
  const selected = records.filter(record => selectedPhotoVaultKeys.has(record.key));
  if (!selected.length) {
    alert('다운로드할 사진을 선택해 주세요.');
    return;
  }
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

async function deletePhotoVaultItem(key) {
  const accepted = await askYesNo('이 사진을 사진 보관함에서 삭제하시겠습니까?', '사진 삭제');
  if (!accepted) return;
  await deleteOriginalTripPhoto(key);
  selectedPhotoVaultKeys.delete(key);
  renderPhotoVault();
}

async function deleteSelectedPhotoVaultItems() {
  const keys = Array.from(selectedPhotoVaultKeys);
  if (!keys.length) {
    alert('삭제할 사진을 선택해 주세요.');
    return;
  }
  const accepted = await askYesNo(`선택한 사진 ${keys.length}장을 삭제하시겠습니까?`, '선택 사진 삭제');
  if (!accepted) return;
  for (const key of keys) await deleteOriginalTripPhoto(key);
  selectedPhotoVaultKeys.clear();
  renderPhotoVault();
}

async function renderPhotoVault() {
  const list = document.getElementById('photoVaultList');
  const status = document.getElementById('photoVaultStatus');
  if (!list) return;
  if (status) status.textContent = '사진을 불러오는 중입니다.';

  const records = await photoVaultRecords();
  const availableKeys = new Set(records.map(record => record.key));
  selectedPhotoVaultKeys = new Set(Array.from(selectedPhotoVaultKeys).filter(key => availableKeys.has(key)));

  if (!records.length) {
    list.innerHTML = '<div class="photo-vault-empty">보관된 사진이 없습니다.<br>위의 사진 올리기에서 원본 사진을 선택하면 원본과 압축본이 함께 저장됩니다.</div>';
    if (status) status.textContent = '보관 사진 0장';
    updatePhotoVaultSelectionUi();
    return;
  }

  list.innerHTML = records.map((record, index) => {
    const preview = record.compressedData || record.data || (record.blob instanceof Blob ? URL.createObjectURL(record.blob) : '');
    const originalSize = typeof kb === 'function' ? kb(record.size || record.blob?.size || 0) : '';
    const compressedSize = typeof kb === 'function' ? kb(record.compressedBytes || 0) : '';
    const safeKey = String(record.key).replace(/'/g, "\\'");
    const checked = selectedPhotoVaultKeys.has(record.key) ? 'checked' : '';
    return `<article class="photo-vault-item">
      <label class="photo-vault-check"><input type="checkbox" data-photo-vault-key="${esc(record.key)}" ${checked} onchange="togglePhotoVaultSelection('${safeKey}', this.checked)"><span>선택</span></label>
      <img src="${preview}" alt="보관 사진 ${index + 1}" loading="lazy" decoding="async">
      <div class="photo-vault-item-meta small">
        <strong>${esc(record.name || `사진 ${index + 1}`)}</strong><br>
        원본 ${originalSize} · 압축 ${compressedSize || '-'}
      </div>
      <div class="photo-vault-item-actions">
        <button class="p" type="button" onclick="downloadPhotoVaultItem('${safeKey}', ${index}, 'original')">원본</button>
        <button class="g" type="button" onclick="downloadPhotoVaultItem('${safeKey}', ${index}, 'compressed')">압축본</button>
        <button class="d" type="button" onclick="deletePhotoVaultItem('${safeKey}')">삭제</button>
      </div>
    </article>`;
  }).join('');

  if (status) status.textContent = `원본·압축 사진 ${records.length}장 보관 중`;
  updatePhotoVaultSelectionUi();
}
