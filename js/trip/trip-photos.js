'use strict';

async function addPhotos(files) {
  for (const file of Array.from(files || [])) {
    if (!file.type || !file.type.startsWith('image/')) continue;

    const compressed = await compressSmart(file);
    photos.push({
      data: compressed.data,
      cap: '',
      original: file.size || 0,
      compressed: compressed.bytes
    });
  }

  renderPhotos();
}

const TRIP_PHOTO_DB = 'aton-trip-photo-originals';
const TRIP_PHOTO_STORE = 'originals';

function openTripPhotoDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('이 환경에서는 원본 사진 보관을 지원하지 않습니다.'));
    const request = indexedDB.open(TRIP_PHOTO_DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRIP_PHOTO_STORE)) {
        const store = db.createObjectStore(TRIP_PHOTO_STORE, { keyPath: 'key' });
        store.createIndex('savedAt', 'savedAt');
      } else {
        const store = request.transaction.objectStore(TRIP_PHOTO_STORE);
        if (!store.indexNames.contains('savedAt')) store.createIndex('savedAt', 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('사진 보관함을 열지 못했습니다.'));
  });
}

async function saveOriginalTripPhoto(key, fileOrData, name, type, compressedData = '', compressedBytes = 0) {
  const db = await openTripPhotoDb();
  const record = {
    key,
    blob: fileOrData instanceof Blob ? fileOrData : null,
    data: typeof fileOrData === 'string' ? fileOrData : '',
    name,
    type,
    size: fileOrData instanceof Blob ? fileOrData.size : dataBytes(fileOrData),
    compressedData,
    compressedBytes,
    savedAt: Date.now()
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(TRIP_PHOTO_STORE, 'readwrite');
    tx.objectStore(TRIP_PHOTO_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('원본 사진 저장에 실패했습니다.'));
    tx.onabort = () => reject(tx.error || new Error('원본 사진 저장이 중단되었습니다.'));
  });
  db.close();
}

async function getOriginalTripPhoto(key) {
  if (!key) return null;
  const db = await openTripPhotoDb();
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction(TRIP_PHOTO_STORE, 'readonly');
    const request = tx.objectStore(TRIP_PHOTO_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('원본 사진을 불러오지 못했습니다.'));
  });
  db.close();
  return value;
}

async function listOriginalTripPhotos() {
  const db = await openTripPhotoDb();
  const values = await new Promise((resolve, reject) => {
    const tx = db.transaction(TRIP_PHOTO_STORE, 'readonly');
    const request = tx.objectStore(TRIP_PHOTO_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('사진 목록을 불러오지 못했습니다.'));
  });
  db.close();
  return values.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

async function deleteOriginalTripPhoto(key) {
  if (!key || !window.indexedDB) return;
  try {
    const db = await openTripPhotoDb();
    await new Promise(resolve => {
      const tx = db.transaction(TRIP_PHOTO_STORE, 'readwrite');
      tx.objectStore(TRIP_PHOTO_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch (error) {}
}

function photoExtension(type, fallbackName = '') {
  const fromName = String(fallbackName).match(/\.([a-zA-Z0-9]{2,5})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/heic' || type === 'image/heif') return 'heic';
  return 'jpg';
}

function saveBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function saveDataUrlFile(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadStoredOriginal(record, fallbackIndex = 0) {
  const ext = photoExtension(record?.type, record?.name);
  const name = String(record?.name || `출장사진_${fallbackIndex + 1}.${ext}`).replace(/[\\/:*?"<>|]/g, '_');
  if (record?.blob instanceof Blob) {
    saveBlobFile(record.blob, name);
    return true;
  }
  if (record?.data) {
    saveDataUrlFile(record.data, name);
    return true;
  }
  return false;
}

async function downloadTripPhoto(index) {
  const photo = photos[index];
  if (!photo) return;
  try {
    const original = await getOriginalTripPhoto(photo.originalKey);
    if (await downloadStoredOriginal(original, index)) return;
  } catch (error) {}
  saveDataUrlFile(photo.data, `출장사진_${index + 1}_압축본.jpg`);
}

async function removeTripPhoto(index) {
  photos.splice(index, 1);
  renderPhotos();
}

function dataBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  return Math.round((base64.length * 3) / 4);
}

function kb(bytes) {
  return Math.max(1, Math.round((bytes || 0) / 1024)).toLocaleString() + 'KB';
}

function compress(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = event => {
      image.onload = () => {
        const ratio = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

        const data = canvas.toDataURL('image/jpeg', quality);
        resolve({ data, bytes: dataBytes(data) });
      };
      image.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
      image.src = event.target.result;
    };

    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function compressSmart(file) {
  const targetBytes = 180 * 1024;
  let maxWidth = 1100;
  let quality = 0.72;
  let result = await compress(file, maxWidth, quality);

  while (result.bytes > targetBytes && quality > 0.48) {
    quality -= 0.08;
    result = await compress(file, maxWidth, quality);
  }

  while (result.bytes > targetBytes && maxWidth > 640) {
    maxWidth -= 160;
    quality = 0.58;
    result = await compress(file, maxWidth, quality);
  }

  return result;
}

function renderPhotos(options = {}) {
  const originalTotal = photos.reduce((sum, photo) => sum + (photo.original || 0), 0);
  const compressedTotal = photos.reduce((sum, photo) => sum + (photo.compressed || 0), 0);

  if ($('photoSizeInfo')) {
    $('photoSizeInfo').innerText = photos.length
      ? `첨부 ${photos.length}장 / 원본 ${kb(originalTotal)} → 압축 후 ${kb(compressedTotal)}`
      : '';
  }

  if ($('photoPreview')) {
    $('photoPreview').innerHTML = photos
      .map(
        (photo, index) => `<div>
          <img src="${photo.data}" alt="출장 사진 ${index + 1}" loading="lazy" decoding="async">
          <div class="small">${kb(photo.original)} → ${kb(photo.compressed)}</div>
          <input placeholder="사진 ${index + 1} 설명" value="${esc(photo.cap)}" oninput="photos[${index}].cap=this.value; saveTripDraft()">
          <div class="trip-photo-actions">
            <button class="d" type="button" onclick="removeTripPhoto(${index})">삭제</button>
          </div>
        </div>`
      )
      .join('');
  }

  if (options.save !== false) saveTripDraft();
}

async function clearPhotos() {
  photos = [];
  renderPhotos();

  const fileInput = $('tripPhotos');
  if (fileInput) fileInput.value = '';
}

function resetTripForm() {
  setTripEditMode('', '');
  currentTripEventTitle = '';
  currentTripCalendarEventId = '';
  if ($('tripSelect')) $('tripSelect').value = '';
  if ($('tDate')) $('tDate').value = today();
  if ($('tEndDate')) $('tEndDate').value = today();
  if ($('tReportDate')) $('tReportDate').value = today();
  if ($('tRank')) $('tRank').value = '해양수산';
  if ($('tPerson')) $('tPerson').value = '';
  if ($('tPlace')) $('tPlace').value = '';
  if ($('tPurpose')) $('tPurpose').value = '';
  if ($('tBody')) $('tBody').value = '';
  if ($('tPlan')) $('tPlan').value = '';
  clearTripPeople();

  try {
    localStorage.removeItem(TRIP_DRAFT_KEY);
    if (typeof TRIP_LEGACY_DRAFT_KEY !== 'undefined') localStorage.removeItem(TRIP_LEGACY_DRAFT_KEY);
  } catch (error) {}

  setHM('tStart', 9, 0);
  setHM('tEnd', 18, 0);
  clearPhotos();

  if ($('tripReport')) {
    $('tripReport').innerHTML = `
      <section class="trip-page">
        <h1 class="trip-title">출 장 복 명 서</h1>
        <p class="small">내용이 초기화되었습니다. 다시 입력한 뒤 생성하세요.</p>
      </section>`;
  }
}

function lines(text) {
  return String(text || '')
    .split(/\n+/)
    .map(line => line.replace(/^[-ㅇ•*]\s*/, '').trim())
    .filter(Boolean);
}

function bullets(text) {
  const items = lines(text);
  return items.length
    ? items.map(item => `<p>ㅇ ${esc(item)}</p>`).join('')
    : '<p>ㅇ 해당사항 없음</p>';
}

function subs(text) {
  const items = lines(text);
  return items.length
    ? items.map(item => `<p>- ${esc(item)}</p>`).join('')
    : '<p>- 해당사항 없음</p>';
}

function photoChunks(size = 6) {
  const chunks = [];
  for (let index = 0; index < photos.length; index += size) {
    chunks.push(photos.slice(index, index + size));
  }
  return chunks;
}

function tripPhotoSheetCount() {
  return Math.max(1, photoChunks(6).length);
}

function tripAttachmentText() {
  if (!Array.isArray(photos) || photos.length < 1) return '끝.';
  return `붙임  사진대지 ${tripPhotoSheetCount()}부. 끝.`;
}

function photoPagesHtml() {
  if (!Array.isArray(photos) || !photos.length) return '';

  return photoChunks(6)
    .map((chunk, pageIndex) => `
        <section class="photo-page">
          <table class="attach-table">
            <colgroup>
              <col class="attach-label-col">
              <col class="attach-gap-col">
              <col>
            </colgroup>
            <tr>
              <td class="attach-label center">붙임</td>
              <td class="attach-gap"></td>
              <td class="attach-title">사진대지${photoChunks(6).length > 1 ? ` ${pageIndex + 1}` : ''}</td>
            </tr>
          </table>
          <div class="photo-grid sheet-grid">
            ${Array.from({ length: 6 }).map((_, index) => {
              const photo = chunk[index];
              const number = pageIndex * 6 + index + 1;
              return `<div class="photo-card${photo ? '' : ' photo-card-empty'}">
                ${photo ? `<img src="${photo.data}" alt="출장 사진 ${number}" loading="lazy" decoding="async">` : '<svg class="empty-photo-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="100" y2="100"></line></svg>'}
                <div class="cap${photo ? '' : ' cap-empty'}">${photo ? esc(photo.cap || `사진 ${number}`) : '&nbsp;'}</div>
              </div>`;
            }).join('')}
          </div>
        </section>`)
    .join('');
}


