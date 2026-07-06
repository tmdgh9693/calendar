function tripOptions() {
  if (!$('tripSelect')) return;

  const events = data.events
    .filter(event => ['출장', '점검', '공사'].includes(event.type) && (event.scope === '과' || mine(event)))
    .sort(sortEv);

  $('tripSelect').innerHTML = '<option value="">직접 입력 또는 일정 선택</option>' +
    events.map(event => `<option value="${event.id}">${esc(event.date)} [${esc(event.scope)}] ${esc(event.title)}</option>`).join('');
}

function loadTrip() {
  const selectedId = $('tripSelect')?.value || '';
  const event = data.events.find(item => item.id === selectedId);
  if (!event) return;

  if ($('tDate')) $('tDate').value = event.date;
  if ($('tReportDate')) $('tReportDate').value = event.date;
  if ($('tStartH')) $('tStartH').value = event.startH ?? 9;
  if ($('tStartM')) $('tStartM').value = event.startM ?? 0;
  if ($('tEndH')) $('tEndH').value = event.endH ?? 18;
  if ($('tEndM')) $('tEndM').value = event.endM ?? 0;
  if ($('tPerson')) $('tPerson').value = event.person || data.user;
  if ($('tPlace')) $('tPlace').value = event.place || '';
  if ($('tPurpose')) $('tPurpose').value = event.summary || event.title || '';
  if ($('tBody')) $('tBody').value = [event.summary, event.result].filter(Boolean).map(text => '- ' + text).join('\n');
  if ($('tPlan')) $('tPlan').value = event.plan || '';
}

async function addPhotos(files) {
  for (const file of files) {
    const result = await compressSmart(file);
    photos.push({ data: result.data, cap: '', original: file.size || 0, compressed: result.bytes });
  }
  renderPhotos();
}

function dataBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round((base64.length * 3) / 4);
}

function kb(size) {
  return Math.max(1, Math.round((size || 0) / 1024)).toLocaleString() + 'KB';
}

function compress(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = event => {
      image.onload = () => {
        const ratio = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ data: dataUrl, bytes: dataBytes(dataUrl) });
      };
      image.src = event.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressSmart(file) {
  const target = 800 * 1024;
  let maxWidth = 1280;
  let quality = 0.76;
  let output = await compress(file, maxWidth, quality);

  while (output.bytes > target && quality > 0.48) {
    quality -= 0.08;
    output = await compress(file, maxWidth, quality);
  }

  while (output.bytes > target && maxWidth > 900) {
    maxWidth -= 160;
    quality = 0.58;
    output = await compress(file, maxWidth, quality);
  }

  return output;
}

function renderPhotos() {
  if (!$('photoPreview') || !$('photoSizeInfo')) return;

  const originalTotal = photos.reduce((sum, photo) => sum + (photo.original || 0), 0);
  const compressedTotal = photos.reduce((sum, photo) => sum + (photo.compressed || 0), 0);
  $('photoSizeInfo').innerText = photos.length ? `첨부 ${photos.length}장 / 원본 ${kb(originalTotal)} → 압축 후 ${kb(compressedTotal)}` : '';

  $('photoPreview').innerHTML = photos.map((photo, index) => `
    <div>
      <img src="${photo.data}">
      <div class="small">${kb(photo.original)} → ${kb(photo.compressed)}</div>
      <input placeholder="사진 ${index + 1} 설명" value="${esc(photo.cap)}" oninput="photos[${index}].cap=this.value">
      <button class="d" onclick="photos.splice(${index},1);renderPhotos()">삭제</button>
    </div>
  `).join('');
}

function clearPhotos() {
  photos = [];
  renderPhotos();
}

function lines(text) {
  return (text || '').split(/\n+/).map(line => line.replace(/^[-ㅇ•\*]\s*/, '').trim()).filter(Boolean);
}

function bullets(text) {
  const arr = lines(text);
  return arr.length ? arr.map(line => `<p>ㅇ ${esc(line)}</p>`).join('') : '<p>ㅇ 해당사항 없음</p>';
}

function subs(text) {
  const arr = lines(text);
  return arr.length ? arr.map(line => `<p>- ${esc(line)}</p>`).join('') : '<p>- 해당사항 없음</p>';
}

function makeTrip() {
  const date = $('tDate')?.value || today();
  const reportDate = $('tReportDate')?.value || date;
  const person = $('tPerson')?.value || data.user;
  const rank = $('tRank')?.value || '해양수산주사';
  const place = $('tPlace')?.value || '';

  let photoHtml = '';
  if (photos.length) {
    photoHtml = `
      <section class="photo-page">
        <h1 class="trip-title">사진대지</h1>
        <div class="photo-grid">
          ${photos.slice(0, 8).map((photo, index) => `
            <div class="photo-card">
              <img src="${photo.data}">
              <div class="cap">${esc(photo.cap || '사진 ' + (index + 1))}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  if (!$('tripReport')) return;

  $('tripReport').innerHTML = `
    <section class="trip-page">
      <h1 class="trip-title">출 장 복 명 서</h1>
      <table class="trip-one">
        <colgroup><col style="width:14%"><col style="width:18%"><col style="width:32%"><col style="width:16%"><col style="width:20%"></colgroup>
        <tr>
          <th>출 장 자</th>
          <td class="center">${esc(person)}</td>
          <td>출발: ${esc(mdate(date))} ${esc(timeText($('tStartH')?.value || 9, $('tStartM')?.value || 0))}<br>귀청: ${esc(mdate(date))} ${esc(timeText($('tEndH')?.value || 18, $('tEndM')?.value || 0))}</td>
          <td class="center">복명: ${esc(mdate(reportDate))}</td>
          <td class="center">출장지<br>${esc(place)}</td>
        </tr>
        <tr><th colspan="5" style="text-align:left">1. 출장목적</th></tr>
        <tr><td colspan="5" class="bodycell">${bullets($('tPurpose')?.value || '')}</td></tr>
        <tr><th colspan="5" style="text-align:left">2. 출장목적 수행상황</th></tr>
        <tr><td colspan="5" class="bodycell">${subs($('tBody')?.value || '')}</td></tr>
        <tr><th colspan="5" style="text-align:left">3. 향후계획</th></tr>
        <tr><td colspan="5" class="bodycell">${bullets($('tPlan')?.value || '')}</td></tr>
        <tr><td colspan="5">붙임&nbsp;&nbsp;사진대지 1부. 끝.<br><br><div style="text-align:center">위와 같이 복명함<br>${esc(kdate(reportDate))}</div></td></tr>
        <tr><td class="center">출장자</td><td colspan="2">${esc(rank)}&nbsp;&nbsp;성명&nbsp;&nbsp;${esc(person)}&nbsp;&nbsp;(인)</td><td class="center">담 당</td><td></td></tr>
      </table>
    </section>
    ${photoHtml}
  `;
}
