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
    updated: ''
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
            ? `<button class="g" onclick="editDoc('${doc.id}')">수정</button>`
            : ''
          }

          <button class="s" onclick="printDoc('${doc.id}')">인쇄/PDF</button>

          <button class="s" onclick="downloadArchivedDoc('${doc.id}')">
            한글 열기용 저장
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

function downloadArchivedDoc(id) {
  const doc = data.docs.find(item => item.id === id);

  if (!doc) return;

  const temp = document.createElement('div');
  temp.id = 'tmpArchiveDownload';
  temp.style.display = 'none';
  temp.innerHTML = doc.html;

  document.body.appendChild(temp);

  downloadDoc('tmpArchiveDownload', (doc.title || '보관자료') + '.doc');

  temp.remove();
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

function downloadDoc(id, filename) {
  const target = $(id);

  if (!target) return;

  const content = target.innerHTML;

  const css = `
    <style>
      body {
        font-family: Malgun Gothic, Arial;
        line-height: 1.7;
      }

      .trip-one {
        border-collapse: collapse;
        width: 100%;
        border: 2px solid #000;
      }

      .trip-one th,
      .trip-one td {
        border: 1px solid #000;
        padding: 8px;
      }

      .photo-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border: 2px solid #000;
      }

      .photo-card {
        border: 1px solid #000;
        text-align: center;
        padding: 8px;
      }

      .photo-card img {
        max-width: 100%;
        max-height: 240px;
      }
    </style>
  `;

  const blob = new Blob(
    [
      `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        ${css}
      </head>
      <body>
        ${content}
      </body>
      </html>`
    ],
    { type: 'application/msword;charset=utf-8' }
  );

  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  URL.revokeObjectURL(a.href);
}