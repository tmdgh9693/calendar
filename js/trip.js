let currentTripEventTitle = '';
let currentTripCalendarEventId = '';
const TRIP_DRAFT_KEY = 'ys_aton_calendar_trip_draft_v1';

function saveTripDraft() {
  try {
    const people = Array.from(document.querySelectorAll('#tripPeopleList .trip-person-row')).map(row => ({
      rank: row.querySelector('.trip-person-rank')?.value || '',
      name: row.querySelector('.trip-person-name')?.value || ''
    }));

    const draft = {
      currentTripEventTitle,
      currentTripCalendarEventId,
      tDate: $('tDate')?.value || '',
      tEndDate: $('tEndDate')?.value || '',
      tReportDate: $('tReportDate')?.value || '',
      tStartH: $('tStartH')?.value || '',
      tStartM: $('tStartM')?.value || '',
      tEndH: $('tEndH')?.value || '',
      tEndM: $('tEndM')?.value || '',
      tRank: $('tRank')?.value || '',
      tPerson: $('tPerson')?.value || '',
      tPlace: $('tPlace')?.value || '',
      tPurpose: $('tPurpose')?.value || '',
      tBody: $('tBody')?.value || '',
      tPlan: $('tPlan')?.value || '',
      people,
      photos: Array.isArray(photos) ? photos : []
    };

    localStorage.setItem(TRIP_DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn('출장복명 임시저장 실패:', error);
  }
}

function loadTripDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY) || '{}');
    if (!draft || typeof draft !== 'object') return;

    currentTripEventTitle = draft.currentTripEventTitle || '';
    currentTripCalendarEventId = draft.currentTripCalendarEventId || '';

    ['tDate', 'tEndDate', 'tReportDate', 'tStartH', 'tStartM', 'tEndH', 'tEndM', 'tRank', 'tPerson', 'tPlace', 'tPurpose', 'tBody', 'tPlan'].forEach(id => {
      if ($(id) && draft[id] !== undefined) $(id).value = draft[id];
    });

    clearTripPeople();
    (draft.people || []).forEach(person => addTripPerson(person.rank || '', person.name || '', { scroll: false, save: false }));

    photos = Array.isArray(draft.photos) ? draft.photos.filter(photo => photo && photo.data) : [];
    renderPhotos({ save: false });
  } catch (error) {
    console.warn('출장복명 임시저장 불러오기 실패:', error);
  }
}

function bindTripDraftAutosave() {
  ['tDate', 'tEndDate', 'tReportDate', 'tStartH', 'tStartM', 'tEndH', 'tEndM', 'tRank', 'tPerson', 'tPlace', 'tPurpose', 'tBody', 'tPlan'].forEach(id => {
    const el = $(id);
    if (!el || el.dataset.tripAutosave === '1') return;
    el.dataset.tripAutosave = '1';
    el.addEventListener('input', saveTripDraft);
    el.addEventListener('change', saveTripDraft);
  });
}

function initTripDraft() {
  bindTripDraftAutosave();
  loadTripDraft();
}

function getTripPeople() {
  const people = [];
  const mainRank = $('tRank')?.value.trim() || '';
  const mainName = $('tPerson')?.value.trim() || data.user || '';

  if (mainRank || mainName) {
    people.push({ rank: mainRank || '해양수산', name: mainName });
  }

  document.querySelectorAll('#tripPeopleList .trip-person-row').forEach(row => {
    const rank = row.querySelector('.trip-person-rank')?.value.trim() || '';
    const name = row.querySelector('.trip-person-name')?.value.trim() || '';
    if (rank || name) people.push({ rank, name });
  });

  return people;
}

function renderTripPeople() {
  const list = $('tripPeopleList');
  if (!list) return;

  list.querySelectorAll('.trip-person-row').forEach((row, index) => {
    const label = row.querySelector('.trip-person-number');
    if (label) label.textContent = `추가 ${index + 1}`;
  });
}

function addTripPerson(rank = '해양수산', name = '', options = {}) {
  const list = $('tripPeopleList');
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'trip-person-row';
  row.innerHTML = `
    <span class="trip-person-number">추가</span>
    <div>
      <label>직급</label>
      <input class="trip-person-rank" value="${esc(rank || '')}" placeholder="직급" oninput="saveTripDraft()">
    </div>
    <div>
      <label>성명</label>
      <input class="trip-person-name" value="${esc(name || '')}" placeholder="성명" oninput="saveTripDraft()">
    </div>
    <button class="d" type="button" onclick="this.closest('.trip-person-row').remove(); renderTripPeople(); saveTripDraft();">삭제</button>
  `;
  list.appendChild(row);
  renderTripPeople();

  if (options.save !== false) saveTripDraft();
  if (options.scroll !== false) {
    setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
}

function clearTripPeople() {
  if ($('tripPeopleList')) $('tripPeopleList').innerHTML = '';
}

function tripPeopleText() {
  return getTripPeople()
    .map(person => [person.rank, person.name].filter(Boolean).join('  '))
    .filter(Boolean)
    .join('<br>');
}

function tripPeopleSignText() {
  return getTripPeople()
    .map(person => `성명&nbsp;&nbsp;${esc(person.name || '')}&nbsp;&nbsp;(인)`)
    .join('<br>');
}


function tripEventFingerprint(event) {
  return [
    event.date || '',
    event.startH ?? '',
    event.startM ?? '',
    event.endH ?? '',
    event.endM ?? '',
    normForKey(event.type),
    normForKey(event.title),
    normForKey(event.place),
    normForKey(event.person)
  ].join('|');
}

function tripOptions() {
  const select = $('tripSelect');
  if (!select) return;

  const previousValue = select.value;
  const sourceIds = new Set();
  const fingerprints = new Set();

  const events = (data.events || [])
    .filter(event =>
      ['출장', '점검', '공사'].includes(event.type) &&
      (event.scope === '과' || mine(event))
    )
    .sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === '과' ? -1 : 1;
      return sortEv(a, b);
    })
    .filter(event => {
      const sourceKey = event.sourceId || '';
      const fingerprint = tripEventFingerprint(event);

      if (sourceKey && sourceIds.has(sourceKey)) return false;
      if (fingerprints.has(fingerprint)) return false;

      if (sourceKey) sourceIds.add(sourceKey);
      fingerprints.add(fingerprint);
      return true;
    });

  select.innerHTML =
    '<option value="">직접 입력 또는 일정 선택</option>' +
    events
      .map(event =>
        `<option value="${event.id}">${esc(event.date)} [${esc(event.scope)}] ${esc(event.title)}</option>`
      )
      .join('');

  if (events.some(event => event.id === previousValue)) {
    select.value = previousValue;
  }
}

function loadTrip() {
  const selectedId = $('tripSelect') ? $('tripSelect').value : '';
  const event = (data.events || []).find(item => item.id === selectedId);
  if (!event) return;

  currentTripEventTitle = String(event.title || event.summary || '').trim();
  currentTripCalendarEventId = event.sourceType === 'tripReport' ? event.id : '';

  if ($('tDate')) $('tDate').value = event.date || today();
  if ($('tEndDate')) $('tEndDate').value = event.endDate || event.date || today();
  if ($('tReportDate')) $('tReportDate').value = event.date || today();
  if ($('tStartH')) $('tStartH').value = event.startH ?? 9;
  if ($('tStartM')) $('tStartM').value = event.startM ?? 0;
  if ($('tEndH')) $('tEndH').value = event.endH ?? 18;
  if ($('tEndM')) $('tEndM').value = event.endM ?? 0;
  if ($('tPerson')) $('tPerson').value = event.person || data.user || '';
  if ($('tPlace')) $('tPlace').value = event.place || '';
  if ($('tPurpose')) $('tPurpose').value = event.summary || event.title || '';
  if ($('tBody')) $('tBody').value = event.result || '';
  if ($('tPlan')) $('tPlan').value = event.plan || '';

  photos = Array.isArray(event.tripPhotos)
    ? event.tripPhotos.filter(photo => photo && photo.data).map(photo => ({
        data: photo.data,
        cap: photo.cap || '',
        original: photo.original || dataBytes(photo.data),
        compressed: photo.compressed || dataBytes(photo.data)
      }))
    : [];
  renderPhotos({ save: false });
  saveTripDraft();
}

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
          <img src="${photo.data}" alt="출장 사진 ${index + 1}">
          <div class="small">${kb(photo.original)} → ${kb(photo.compressed)}</div>
          <input placeholder="사진 ${index + 1} 설명" value="${esc(photo.cap)}" oninput="photos[${index}].cap=this.value; saveTripDraft()">
          <button class="d" type="button" onclick="photos.splice(${index},1);renderPhotos()">삭제</button>
        </div>`
      )
      .join('');
  }

  if (options.save !== false) saveTripDraft();
}

function clearPhotos() {
  photos = [];
  renderPhotos();

  const fileInput = $('tripPhotos');
  if (fileInput) fileInput.value = '';
}

function resetTripForm() {
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

  try { localStorage.removeItem(TRIP_DRAFT_KEY); } catch (error) {}

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
                ${photo ? `<img src="${photo.data}" alt="출장 사진 ${number}">` : '<svg class="empty-photo-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="100" y2="100"></line></svg>'}
                <div class="cap${photo ? '' : ' cap-empty'}">${photo ? esc(photo.cap || `사진 ${number}`) : '&nbsp;'}</div>
              </div>`;
            }).join('')}
          </div>
        </section>`)
    .join('');
}


function firstTripPurposeLine() {
  return String($('tPurpose')?.value || '')
    .split(/\n+/)
    .map(text => text.replace(/^[-ㅇ•*]\s*/, '').trim())
    .find(Boolean) || '';
}

function tripCalendarTitle() {
  const purpose = firstTripPurposeLine();
  const place = $('tPlace')?.value.trim() || '';

  if (purpose) return purpose;
  if (place) return `${place} 출장`;
  return '출장복명';
}

function tripCalendarPersonText() {
  const names = getTripPeople()
    .map(person => person.name)
    .filter(Boolean);

  return names.join(', ') || data.user || '';
}

function resizeDataUrlForCalendar(dataUrl, maxWidth = 900, quality = 0.68) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      let width = image.width || image.naturalWidth || 1;
      let height = image.height || image.naturalHeight || 1;
      let currentWidth = maxWidth;
      let currentQuality = quality;
      let output = dataUrl;

      for (let attempt = 0; attempt < 8; attempt++) {
        const ratio = Math.min(1, currentWidth / Math.max(1, width));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        output = canvas.toDataURL('image/jpeg', currentQuality);

        if (dataBytes(output) <= 180 * 1024) break;
        currentQuality = Math.max(0.42, currentQuality - 0.08);
        currentWidth = Math.max(520, currentWidth - 90);
      }

      resolve(output);
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function calendarPhotoCopies() {
  const copied = [];
  const picked = Array.isArray(photos) ? photos.slice(0, 6) : [];

  for (const photo of picked) {
    let imageData = photo.data || '';

    // Firestore 문서 용량 제한에 걸리지 않도록 캘린더 저장용 이미지는 한 번 더 작게 만듭니다.
    if (dataBytes(imageData) > 180 * 1024) {
      imageData = await resizeDataUrlForCalendar(imageData);
    }

    copied.push({
      data: imageData,
      cap: photo.cap || '',
      original: photo.original || dataBytes(imageData),
      compressed: dataBytes(imageData)
    });
  }

  return copied;
}

function readTripCalendarEvent(photoCopies = []) {
  const date = $('tDate')?.value || today();
  const endDate = $('tEndDate')?.value || date;
  const start = {
    h: Number($('tStartH')?.value || 9),
    m: Number($('tStartM')?.value || 0)
  };
  const end = {
    h: Number($('tEndH')?.value || 18),
    m: Number($('tEndM')?.value || 0)
  };

  return {
    id: currentTripCalendarEventId || uid(),
    scope: '과',
    owner: '과',
    ownerUid: ownerKey(),
    createdByUid: ownerKey(),
    sourceOwnerUid: ownerKey(),
    sourceOwner: data.user || '',
    visibleTo: ['dept', ownerKey()],
    sourceId: currentTripCalendarEventId || null,
    sourceType: 'tripReport',

    date,
    endDate,
    startH: start.h,
    startM: start.m,
    endH: end.h,
    endM: end.m,

    type: '출장',
    person: tripCalendarPersonText(),
    title: tripCalendarTitle(),
    place: $('tPlace')?.value.trim() || '',

    deptReflect: false,
    meetingInclude: true,
    part: '자동',

    summary: $('tPurpose')?.value.trim() || '',
    result: $('tBody')?.value.trim() || '',
    plan: $('tPlan')?.value.trim() || '',
    tripPhotos: Array.isArray(photoCopies) ? photoCopies : [],

    updatedAt: new Date().toISOString()
  };
}

async function saveTripToDeptCalendar() {
  const event = readTripCalendarEvent(await calendarPhotoCopies());
  currentTripCalendarEventId = event.id;
  event.sourceId = event.id;

  data.events = (data.events || []).filter(item => item.id !== event.id);
  data.events.push(event);
  unmarkLocalDeleted('deletedEventIds', event.id);
  localSave();

  if (typeof render === 'function') render();

  if (USE_FIREBASE) {
    try {
      await upsert('events', event);
    } catch (error) {
      console.error('출장복명서 과 캘린더 저장 오류:', error);
      alert('출장복명서는 생성됐지만 과 캘린더 서버 반영에는 실패했습니다.\n' + error.message);
    }
  }
}

function tripHwpxFilename() {
  const rawDate = $('tDate')?.value || today();
  const datePrefix = String(rawDate).replace(/-/g, '').slice(2) || '출장일';
  const purposeLine = String($('tPurpose')?.value || '')
    .split(/\n+/)
    .map(text => text.replace(/^[-ㅇ•*]\s*/, '').trim())
    .find(Boolean) || '';
  const title = currentTripEventTitle || purposeLine;
  const safeTitle = String(title || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  return safeTitle
    ? `${datePrefix}_출장복명서(${safeTitle}).hwpx`
    : `${datePrefix}_출장복명서.hwpx`;
}

function makeTrip() {
  const date = $('tDate')?.value || today();
  const endDate = $('tEndDate')?.value || date;
  const reportDate = $('tReportDate')?.value || date;
  const people = getTripPeople();
  const person = people.map(item => item.name).filter(Boolean).join('<br>') || data.user || '';
  const place = $('tPlace')?.value.trim() || '';
  const attachmentText = tripAttachmentText();

  if (!$('tripReport')) return;

  $('tripReport').innerHTML = `
    <section class="trip-page">
      <h1 class="trip-title">출 장 복 명 서</h1>
      <table class="trip-one">
        <colgroup>
          <col style="width:14%">
          <col style="width:18%">
          <col style="width:32%">
          <col style="width:16%">
          <col style="width:20%">
        </colgroup>
        <tr>
          <th>출 장 자</th>
          <td class="center">${person}</td>
          <td>
            출발: ${esc(mdate(date))} ${esc(timeText($('tStartH')?.value, $('tStartM')?.value))}<br>
            귀청: ${esc(mdate(endDate))} ${esc(timeText($('tEndH')?.value, $('tEndM')?.value))}
          </td>
          <td class="center">복명: ${esc(mdate(reportDate))}</td>
          <td class="center">출장지<br>${esc(place)}</td>
        </tr>
        <tr><th colspan="5" style="text-align:left">1. 출장목적</th></tr>
        <tr><td colspan="5" class="bodycell">${bullets($('tPurpose')?.value)}</td></tr>
        <tr><th colspan="5" style="text-align:left">2. 출장목적 수행상황</th></tr>
        <tr><td colspan="5" class="bodycell">${subs($('tBody')?.value)}</td></tr>
        <tr><th colspan="5" style="text-align:left">3. 향후계획</th></tr>
        <tr><td colspan="5" class="bodycell">${bullets($('tPlan')?.value)}</td></tr>
        <tr>
          <td colspan="5">
            ${attachmentText}<br><br>
            <div style="text-align:center">위와 같이 복명함<br>${esc(kdate(reportDate))}</div>
          </td>
        </tr>
        <tr>
          <td class="center">출장자</td>
          <td colspan="2" class="trip-sign-cell">${tripPeopleSignText()}</td>
          <td class="center">과 장</td>
          <td></td>
        </tr>
      </table>
    </section>
    ${photoPagesHtml()}`;

  saveTripDraft();
  saveTripToDeptCalendar();
}
