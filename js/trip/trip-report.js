'use strict';

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

function findExistingTripCalendarEventId(candidate) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();

  const matched = (data.events || []).find(item =>
    item &&
    item.scope === '과' &&
    item.sourceType === 'tripReport' &&
    item.ownerUid === ownerKey() &&
    item.date === candidate.date &&
    (item.endDate || item.date) === (candidate.endDate || candidate.date) &&
    normalize(item.title) === normalize(candidate.title) &&
    normalize(item.person) === normalize(candidate.person) &&
    normalize(item.place) === normalize(candidate.place)
  );

  return matched?.id || '';
}

async function saveTripToDeptCalendar() {
  const photoCopies = await calendarPhotoCopies();
  const previewEvent = readTripCalendarEvent(photoCopies);

  if (!currentTripCalendarEventId) {
    currentTripCalendarEventId = findExistingTripCalendarEventId(previewEvent);
  }

  const event = readTripCalendarEvent(photoCopies);
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

async function makeTrip(options = {}) {
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

  if (options.saveRecovery !== false) saveTripDraft();

  if (options.askCalendar === false) return;

  const reflectToDept = await askYesNo('작성한 출장복명 내용을 과 캘린더에 반영하시겠습니까?', '과 캘린더 반영');

  if (reflectToDept) {
    await saveTripToDeptCalendar();
  }
}
