function saveGenerated(type, sourceId) {
  const source = $(sourceId);

  if (!source || !source.innerText.trim()) {
    alert('먼저 자료를 생성하세요.');
    return;
  }

  const title = prompt('보관 제목', `${type}_${today()}`);

  if (!title) return;

  const share = confirm(
    '이 자료를 과 공유 보관자료로 저장할까요?\n\n확인: 과 공유\n취소: 개인 보관'
  );

  const doc = {
    id: uid(),
    type,
    title,
    date: new Date().toLocaleString(),
    createdAt: new Date().toISOString(),
    html: source.innerHTML,
    owner: data.user,
    ownerUid: ownerKey(),
    scope: share ? '과' : '개인',
    updated: '',
    exportKind: type === '출장복명서' ? 'trip' : 'meeting',
    meetingType: type === '출장복명서' ? '' : ($(sourceId)?.dataset?.meetingType || $('mType')?.value || window.lastDeptMeetingType || 'weekly'),
    tripSnapshot: type === '출장복명서' && typeof captureTripSnapshot === 'function'
      ? captureTripSnapshot()
      : null
  };

  data.docs.unshift(doc);
  localSave();

  if (USE_FIREBASE) {
    upsert('docs', doc);
  }

  renderArchive();

  alert(share ? '과 공유 보관자료로 저장했습니다.' : '개인 보관자료로 저장했습니다.');
}

function canEditDoc(doc) {
  return (
    !doc.ownerUid ||
    doc.ownerUid === ownerKey() ||
    doc.owner === data.user
  );
}

function renderArchive() {
  const box = $('archiveList');

  if (!box) return;

  const docs = (data.docs || []).filter(doc =>
    doc.scope === '과' ||
    !doc.ownerUid ||
    doc.ownerUid === ownerKey() ||
    doc.owner === data.user
  );

  box.innerHTML = docs.length
    ? docs.map(doc => {
      const shareLabel = doc.scope === '과' ? '과 공유' : '개인';
      const editable = canEditDoc(doc);

      return `
        <div class="list-item">
          <b>${esc(doc.title)}</b>

          <div class="small">
            ${esc(doc.type)} /
            ${esc(shareLabel)} /
            작성자: ${esc(doc.owner || '')} /
            저장: ${esc(doc.date)}
            ${doc.updated ? ` / 수정: ${esc(doc.updated)}` : ''}
          </div>

          <button class="s" onclick="viewDoc('${doc.id}')">보기</button>

          ${editable
            ? (doc.type === '출장복명서'
              ? `<button class="g" onclick="editTripReport('${doc.id}')">복명서 수정</button>`
              : `<button class="g" onclick="editDoc('${doc.id}')">수정</button>`)
            : ''
          }

          <button class="s" onclick="printDoc('${doc.id}')">인쇄/PDF</button>

          <button class="s" onclick="downloadArchivedDoc('${doc.id}')">
            HWPX 저장
          </button>

          ${editable
            ? `<button class="d" onclick="deleteDoc('${doc.id}')">삭제</button>`
            : ''
          }
        </div>
      `;
    }).join('')
    : '<p class="small">보관자료가 없습니다.</p>';
}

function viewDoc(id) {
  const doc = data.docs.find(item => item.id === id);

  if (!doc) return;

  if ($('archiveView')) {
    $('archiveView').innerHTML = doc.html;
  }
}

async function editTripReport(id) {
  const doc = (data.docs || []).find(item => item.id === id);
  if (!doc) return;

  if (!canEditDoc(doc)) {
    alert('다른 사용자가 공유한 자료는 수정할 수 없습니다.');
    return;
  }

  const snapshot = doc.tripSnapshot || legacyTripSnapshotFromHtml(doc.html);
  if (!snapshot) {
    alert('이전 보관자료의 출장복명서 내용을 읽지 못했습니다. 일반 내용 수정 기능을 사용해 주세요.');
    editDoc(id);
    return;
  }

  applyTripSnapshot(snapshot, { saveRecovery: true });
  setTripEditMode(doc.id, doc.title || '출장복명서');
  tab('trip', null, { instant: true });
  await makeTrip({ askCalendar: false });
  $('tripEditNotice')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function editDoc(id) {
  const doc = data.docs.find(item => item.id === id);

  if (!doc) return;

  if (!canEditDoc(doc)) {
    alert('다른 사용자가 공유한 자료는 수정할 수 없습니다.');
    return;
  }

  if (!$('archiveView')) return;

  $('archiveView').innerHTML = `
    <div class="notice small">
      아래 제목과 내용을 수정한 뒤 <b>수정내용 저장</b>을 누르세요.
    </div>

    <label>제목</label>
    <input id="editDocTitle" value="${esc(doc.title)}">

    <label>내용</label>
    <div
      id="editDocBody"
      contenteditable="true"
      style="
        min-height:480px;
        border:1px solid #cdd3dd;
        border-radius:10px;
        padding:14px;
        background:white;
        line-height:1.7;
        overflow:auto;
      "
    >${doc.html}</div>

    <button class="p" onclick="saveEditedDoc('${id}')">수정내용 저장</button>
    <button class="s" onclick="viewDoc('${id}')">취소</button>
    <button class="s" onclick="printEditedDoc()">현재 수정화면 인쇄/PDF</button>
  `;
}

function saveEditedDoc(id) {
  const doc = data.docs.find(item => item.id === id);

  if (!doc) return;

  if (!canEditDoc(doc)) {
    alert('다른 사용자가 공유한 자료는 수정할 수 없습니다.');
    return;
  }

  const titleInput = $('editDocTitle');
  const bodyInput = $('editDocBody');

  if (!titleInput || !bodyInput) return;

  doc.title = titleInput.value.trim() || doc.title;
  doc.html = bodyInput.innerHTML;
  doc.updated = new Date().toLocaleString();
  doc.updatedAt = new Date().toISOString();

  localSave();

  if (USE_FIREBASE) {
    upsert('docs', doc);
  }

  renderArchive();
  viewDoc(id);

  alert('수정내용을 저장했습니다.');
}

function printEditedDoc() {
  const body = $('editDocBody');

  if (!body || !$('printRoot')) return;

  $('printRoot').innerHTML = `<div class="reportbox">${body.innerHTML}</div>`;

  setTimeout(() => {
    window.print();

    setTimeout(() => {
      $('printRoot').innerHTML = '';
    }, 300);
  }, 100);
}

function printDoc(id) {
  const doc = data.docs.find(item => item.id === id);

  if (!doc || !$('printRoot')) return;

  $('printRoot').innerHTML = `<div class="reportbox">${doc.html}</div>`;

  setTimeout(() => {
    window.print();

    setTimeout(() => {
      $('printRoot').innerHTML = '';
    }, 300);
  }, 100);
}

function printOnly(id) {
  const target = $(id);

  if (!target || !$('printRoot')) return;

  $('printRoot').innerHTML = target.outerHTML;

  setTimeout(() => {
    window.print();

    setTimeout(() => {
      $('printRoot').innerHTML = '';
    }, 300);
  }, 100);
}

function legacyTripSnapshotFromHtml(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(html || '');

  const rawText = String(wrapper.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!rawText && !wrapper.querySelector('img')) return null;

  const table = wrapper.querySelector('.trip-one') || wrapper.querySelector('table');
  const rows = Array.from(table?.rows || []);
  const firstCells = Array.from(rows[0]?.cells || []);
  const firstText = firstCells.map(cell => String(cell.textContent || '').trim());

  const findLabelValue = (label, stopLabels = []) => {
    const stops = stopLabels.length ? `(?=${stopLabels.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|$)` : '$';
    const re = new RegExp(`${label}\\s*[:：]?\\s*([\\s\\S]*?)${stops}`);
    return String(rawText.match(re)?.[1] || '').trim();
  };

  const parseDate = text => {
    const value = String(text || '');
    let match = value.match(/(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    match = value.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (!match) return '';
    const yearMatch = rawText.match(/(20\d{2})년/);
    const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
    return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
  };

  const parseTime = (text, label, fallbackH) => {
    const source = String(text || '');
    const match = source.match(new RegExp(`${label}\\s*[:：]?[^\\n]*?(\\d{1,2})시\\s*(\\d{1,2})분`)) ||
      source.match(new RegExp(`${label}\\s*[:：]?[^\\n]*?(\\d{1,2})[:：](\\d{1,2})`));
    return { h: match ? Number(match[1]) : fallbackH, m: match ? Number(match[2]) : 0 };
  };

  const sectionText = (heading, nextHeadings) => {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stop = nextHeadings.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const match = rawText.match(new RegExp(`${escaped}\\s*([\\s\\S]*?)(?=${stop}|붙임|위와 같이 복명함|출장자\\s*(?:담당|과 장|과장)|$)`));
    return String(match?.[1] || '')
      .split(/\n+/)
      .map(line => line.replace(/^\s*[ㅇ○\-*•]\s*/, '').trim())
      .filter(Boolean)
      .join('\n');
  };

  const dateBlock = firstText[2] || rawText;
  const reportBlock = firstText[3] || rawText;
  const start = parseTime(dateBlock, '출발', 9);
  const end = parseTime(dateBlock, '귀청', 18);

  const signText = String(rows.at(-1)?.textContent || rawText);
  const nameMatch = signText.match(/성명\s*([^\n(]+?)\s*\(인\)/);
  const personFromTop = (firstText[1] || findLabelValue('출 장 자|출장자', ['출발', '귀청', '복명', '출 장 지', '출장지']))
    .split(/\n|,/)[0]
    .trim();
  const rankCell = rows.at(-1)?.cells?.[1];
  const rankFromCell = String(rankCell?.textContent || '').replace(/성명[\s\S]*/, '').trim();
  const rankMatch = rawText.match(/출장자\s*\n?\s*([^\n]+?)\s*성명/);

  let place = (firstText[4] || '').replace(/^출\s*장\s*지\s*/,'').trim();
  if (!place) {
    const placeMatch = rawText.match(/출\s*장\s*지\s*[:：]?\s*([^\n]+?)(?=\s*1\.\s*출장목적|$)/);
    place = String(placeMatch?.[1] || '').trim();
  }

  const photos = Array.from(wrapper.querySelectorAll('img')).map((img, index) => {
    const card = img.closest('.photo-card, td, figure, div');
    const caption = card?.querySelector?.('.cap, figcaption, .caption, p, span');
    return {
      data: img.getAttribute('src') || '',
      cap: String(caption?.textContent || img.getAttribute('alt') || `사진 ${index + 1}`).trim()
    };
  }).filter(photo => /^data:image\//.test(photo.data));

  const purpose = sectionText('1. 출장목적', ['2. 출장목적 수행상황', '3. 향후계획']);
  const body = sectionText('2. 출장목적 수행상황', ['3. 향후계획']);
  const plan = sectionText('3. 향후계획', []);

  return {
    person: String(nameMatch?.[1] || personFromTop || data.user || '').trim(),
    rank: String(rankFromCell || rankMatch?.[1] || '').trim(),
    place,
    date: parseDate((rawText.match(/출발\s*[:：]?[^\n]*/)?.[0]) || dateBlock) || today(),
    endDate: parseDate((rawText.match(/귀청\s*[:：]?[^\n]*/)?.[0]) || dateBlock) || parseDate(dateBlock) || today(),
    reportDate: parseDate((rawText.match(/복명\s*[:：]?[^\n]*/)?.[0]) || reportBlock) || today(),
    startH: start.h,
    startM: start.m,
    endH: end.h,
    endM: end.m,
    purpose: purpose || '해당사항 없음',
    body: body || '해당사항 없음',
    plan: plan || '해당사항 없음',
    photos
  };
}

async function downloadArchivedDoc(id) {
  const doc = data.docs.find(item => item.id === id);
  if (!doc) return;

  const temp = document.createElement('div');
  temp.id = 'tmpArchiveDownload';
  temp.style.display = 'none';
  temp.innerHTML = doc.html;
  if (doc.meetingType) temp.dataset.meetingType = doc.meetingType;
  document.body.appendChild(temp);

  try {
    if ((doc.exportKind || (doc.type === '출장복명서' ? 'trip' : 'meeting')) === 'trip') {
      const snapshot = doc.tripSnapshot || legacyTripSnapshotFromHtml(doc.html);
      const safeSnapshot = snapshot || {
        person: data.user || '', rank: data.rank || '', place: '',
        date: today(), endDate: today(), reportDate: today(),
        startH: 9, startM: 0, endH: 18, endM: 0,
        purpose: '해당사항 없음', body: '해당사항 없음', plan: '해당사항 없음', photos: []
      };
      await withTripSnapshot(safeSnapshot, () =>
        downloadHwpx('tmpArchiveDownload', (doc.title || '출장복명서') + '.hwpx', 'trip')
      );
    } else {
      await downloadHwpx('tmpArchiveDownload', (doc.title || '회의자료') + '.hwpx', 'meeting', {
        meetingType: doc.meetingType || 'weekly'
      });
    }
  } finally {
    temp.remove();
  }
}

async function withTripSnapshot(snapshot, callback) {
  const fields = ['tPerson','tRank','tPlace','tDate','tEndDate','tReportDate','tStartH','tStartM','tEndH','tEndM','tPurpose','tBody','tPlan'];
  const oldValues = Object.fromEntries(fields.map(id => [id, $(id)?.value]));
  const oldPhotos = typeof photos !== 'undefined' ? photos : [];
  const oldPeople = typeof tripExtraPeopleSnapshot === 'function' ? tripExtraPeopleSnapshot() : [];
  const mapping = {
    tPerson:'person', tRank:'rank', tPlace:'place', tDate:'date', tEndDate:'endDate', tReportDate:'reportDate',
    tStartH:'startH', tStartM:'startM', tEndH:'endH', tEndM:'endM', tPurpose:'purpose', tBody:'body', tPlan:'plan'
  };
  try {
    const safe = typeof normalizeTripSnapshot === 'function' ? normalizeTripSnapshot(snapshot) : snapshot;
    Object.entries(mapping).forEach(([id,key]) => { if ($(id)) $(id).value = safe[key] ?? ''; });
    if (typeof clearTripPeople === 'function') clearTripPeople();
    (safe.people || []).forEach(person => addTripPerson(person.rank || '', person.name || '', { scroll: false, save: false }));
    if (typeof photos !== 'undefined') photos = Array.isArray(safe.photos) ? safe.photos : [];
    return await callback();
  } finally {
    fields.forEach(id => { if ($(id) && oldValues[id] !== undefined) $(id).value = oldValues[id]; });
    if (typeof clearTripPeople === 'function') clearTripPeople();
    oldPeople.forEach(person => addTripPerson(person.rank || '', person.name || '', { scroll: false, save: false }));
    if (typeof photos !== 'undefined') photos = oldPhotos;
  }
}

async function deleteDoc(id) {
  const doc = data.docs.find(item => item.id === id);

  if (!doc) return;

  if (!canEditDoc(doc)) {
    alert('다른 사용자가 공유한 자료는 삭제할 수 없습니다.');
    return;
  }

  if (!confirm('삭제할까요?')) return;

  data.docs = data.docs.filter(item => item.id !== id);
  markLocalDeleted('deletedDocIds', id);
  localSave();
  renderArchive();

  if ($('archiveView')) {
    $('archiveView').innerHTML = '<p class="small">저장된 자료를 선택하세요.</p>';
  }

  if (USE_FIREBASE) {
    try {
      await removeCloud('docs', id);
    } catch (error) {
      console.error('보관자료 서버 삭제 오류:', error);
      alert('이 기기에서는 삭제됐지만 서버 삭제에는 실패했습니다. 다른 기기에는 남아 있을 수 있습니다.\n' + error.message);
      return;
    }
  }

  alert('보관자료를 삭제했습니다.');
}


