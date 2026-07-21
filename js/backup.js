'use strict';

const BACKUP_VERSION = 5;

function backupStatus(message) {
  const status = $('backupStatus');
  if (status) status.textContent = message || '';
}

function restoreStatus(message) {
  const status = $('backupRestoreStatus');
  if (status) status.textContent = message || '';
}

function initBackupPeriodInputs() {
  const now = new Date();
  const year = $('backupYear');
  const month = $('backupMonth');
  const periodType = $('backupPeriodType');

  if (periodType && !periodType.value) periodType.value = 'all';
  if (year && !year.value) year.value = String(now.getFullYear());
  if (month && !month.options.length) {
    month.innerHTML = Array.from({ length: 12 }, (_, index) =>
      `<option value="${String(index + 1).padStart(2, '0')}">${index + 1}월</option>`
    ).join('');
    month.value = String(now.getMonth() + 1).padStart(2, '0');
  }
  updateBackupPeriodUi();
}

function updateBackupPeriodUi() {
  const type = $('backupPeriodType')?.value || 'all';
  $('backupYearField')?.classList.toggle('hidden', type === 'all');
  $('backupMonthField')?.classList.toggle('hidden', type !== 'month');
}

function backupPeriod() {
  const type = $('backupPeriodType')?.value || 'all';
  const year = String(Number($('backupYear')?.value || new Date().getFullYear())).padStart(4, '0');
  const month = String($('backupMonth')?.value || '01').padStart(2, '0');

  if (type === 'all') return { type, label: '전체', filename: 'all' };
  if (type === 'year') return { type, year, label: `${year}년`, filename: year };
  return { type, year, month, label: `${year}년 ${Number(month)}월`, filename: `${year}_${month}` };
}

function dateStringFromValue(value) {
  if (!value) return '';
  if (typeof value === 'number') return localDate(new Date(value));
  if (typeof value?.toDate === 'function') return localDate(value.toDate());
  const text = String(value);
  const iso = text.match(/^(20\d{2}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : localDate(parsed);
}

function backupPeriodBounds(period) {
  if (period.type === 'all') return null;
  if (period.type === 'year') {
    return { start: `${period.year}-01-01`, end: `${period.year}-12-31` };
  }
  const lastDay = new Date(Number(period.year), Number(period.month), 0).getDate();
  return {
    start: `${period.year}-${period.month}-01`,
    end: `${period.year}-${period.month}-${String(lastDay).padStart(2, '0')}`
  };
}

function eventInBackupPeriod(event, period) {
  if (period.type === 'all') return true;
  const bounds = backupPeriodBounds(period);
  const start = dateStringFromValue(event?.date);
  const end = dateStringFromValue(event?.endDate || event?.date) || start;
  return !!start && end >= bounds.start && start <= bounds.end;
}

function docBackupDate(doc) {
  return dateStringFromValue(
    doc?.tripSnapshot?.date ||
    doc?.tripSnapshot?.reportDate ||
    doc?.createdAt ||
    doc?.updatedAt ||
    doc?.date
  );
}

function docInBackupPeriod(doc, period) {
  if (period.type === 'all') return true;
  const date = docBackupDate(doc);
  if (!date) return false;
  return period.type === 'year'
    ? date.startsWith(`${period.year}-`)
    : date.startsWith(`${period.year}-${period.month}`);
}

function backupDocKind(doc) {
  const type = String(doc?.type || '').trim();
  const exportKind = String(doc?.exportKind || '').trim();
  if (exportKind === 'trip' || type.includes('출장복명')) return 'trip';
  if (exportKind === 'meeting' || type.includes('회의')) return 'meeting';
  return '';
}

function isSupportedBackupDoc(doc) {
  return !!backupDocKind(doc);
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function mergeUniqueById(...groups) {
  const map = new Map();
  groups.flat().filter(Boolean).forEach(item => {
    if (!item?.id) return;
    map.set(String(item.id), item);
  });
  return [...map.values()];
}

async function fetchCurrentBackupRecords() {
  let events = [...(data.events || [])];
  let docs = [...(data.docs || [])];
  const warnings = [];

  if (!USE_FIREBASE || !db || !auth?.currentUser) {
    return { events, docs, warnings };
  }

  backupStatus('서버의 최신 과 일정과 보관자료를 확인하는 중입니다.');
  try {
    const [deptEvents, myDocs, deptDocs] = await Promise.all([
      db.collection('events').where('scope', '==', '과').get(),
      db.collection('docs').where('ownerUid', '==', ownerKey()).get(),
      db.collection('docs').where('scope', '==', '과').get()
    ]);

    events = mergeUniqueById(
      events,
      deptEvents.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    );
    docs = mergeUniqueById(
      docs,
      myDocs.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      deptDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    );
  } catch (error) {
    warnings.push(`서버 최신자료 확인 실패: ${error.message || error}`);
  }

  return { events, docs, warnings };
}

function backupTimeText(event) {
  const start = `${String(Number(event?.startH ?? 9)).padStart(2, '0')}:${String(Number(event?.startM ?? 0)).padStart(2, '0')}`;
  const end = `${String(Number(event?.endH ?? 18)).padStart(2, '0')}:${String(Number(event?.endM ?? 0)).padStart(2, '0')}`;
  return `${start}~${end}`;
}

function backupDateRangeText(event) {
  const start = dateStringFromValue(event?.date) || '날짜 없음';
  const end = dateStringFromValue(event?.endDate || event?.date) || start;
  return start === end ? start : `${start}~${end}`;
}

function backupEventDetails(event) {
  const details = [];
  if (event?.type) details.push(`유형: ${event.type}`);
  if (event?.person) details.push(`담당자: ${event.person}`);
  if (event?.place) details.push(`장소: ${event.place}`);
  if (event?.part) details.push(`구분: ${event.part}`);
  if (event?.sourceOwner || event?.owner) details.push(`작성자: ${event.sourceOwner || event.owner}`);
  if (event?.summary) details.push(`요약: ${event.summary}`);
  if (event?.result) details.push(`실적: ${event.result}`);
  if (event?.plan) details.push(`계획: ${event.plan}`);
  return details;
}

function backupDocTextLines(doc) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(doc?.html || '');
  wrapper.querySelectorAll('script, style, button').forEach(node => node.remove());
  wrapper.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return String(wrapper.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

function createBackupHwpxSource(events, docs, period) {
  const source = document.createElement('div');
  source.id = `backupHwpxSource_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  source.style.position = 'fixed';
  source.style.left = '-100000px';
  source.style.top = '0';
  source.style.width = '900px';
  source.setAttribute('aria-hidden', 'true');

  const sortedEvents = [...events].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare) return dateCompare;
    return Number(a.startH || 0) - Number(b.startH || 0) || Number(a.startM || 0) - Number(b.startM || 0);
  });
  const sortedDocs = [...docs].sort((a, b) => String(docBackupDate(a)).localeCompare(String(docBackupDate(b))));

  const eventRows = sortedEvents.length
    ? sortedEvents.map(event => {
        const main = `${backupDateRangeText(event)} ${backupTimeText(event)} · ${event.title || '제목 없음'}`;
        return `<p><b>${esc(main)}</b>${backupEventDetails(event).map(detail => `<span class="indent">${esc(detail)}</span>`).join('')}</p>`;
      }).join('')
    : '<p><b>해당 기간에 과 캘린더 일정이 없습니다.</b></p>';

  const docRows = sortedDocs.length
    ? sortedDocs.map(doc => {
        const kindLabel = backupDocKind(doc) === 'trip' ? '출장복명서' : '회의자료';
        const main = `${kindLabel} · ${doc.title || '제목 없음'} · ${docBackupDate(doc) || doc.date || '날짜 없음'}`;
        const lines = backupDocTextLines(doc);
        const details = lines.length ? lines : ['저장된 본문 내용이 없습니다.'];
        return `<p><b>${esc(main)}</b>${details.map(line => `<span class="indent">${esc(line)}</span>`).join('')}</p>`;
      }).join('')
    : '<p><b>해당 기간에 저장된 회의자료·출장복명서가 없습니다.</b></p>';

  source.innerHTML = `
    <h1>과 캘린더 자료 백업</h1>
    <p>백업 범위: ${esc(period.label)} / 생성일: ${esc(kdate(today()))}</p>
    <h2>과 캘린더 일정</h2>
    ${eventRows}
    <h2>회의자료 및 출장복명서</h2>
    ${docRows}
  `;

  document.body.appendChild(source);
  return source;
}

async function repackHwpxWithMimetypeFirst(zip) {
  const output = new JSZip();
  const mimetype = zip.file('mimetype');
  if (!mimetype) throw new Error('HWPX 기본 양식에 mimetype 파일이 없습니다.');
  const mimeText = (await mimetype.async('string')).trim() || 'application/hwp+zip';
  output.file('mimetype', mimeText, { compression: 'STORE' });

  for (const name of Object.keys(zip.files)) {
    if (name === 'mimetype') continue;
    const entry = zip.files[name];
    if (entry.dir) {
      output.folder(name.replace(/\/$/, ''));
      continue;
    }
    const bytes = await entry.async('uint8array');
    output.file(name, bytes, {
      binary: true,
      compression: 'DEFLATE',
      date: entry.date || new Date(0)
    });
  }
  return output;
}

async function validateBackupHwpxBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 30 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('생성된 파일이 올바른 HWPX 압축 구조가 아닙니다.');
  }

  const compressionMethod = bytes[8] | (bytes[9] << 8);
  const fileNameLength = bytes[26] | (bytes[27] << 8);
  const firstName = new TextDecoder('utf-8').decode(bytes.slice(30, 30 + fileNameLength));
  if (firstName !== 'mimetype' || compressionMethod !== 0) {
    throw new Error('HWPX의 mimetype 파일 순서 또는 압축 방식이 올바르지 않습니다.');
  }

  const checked = await JSZip.loadAsync(blob);
  const required = ['mimetype', 'version.xml', 'Contents/content.hpf'];
  for (const name of required) {
    if (!checked.file(name)) throw new Error(`HWPX 필수 파일이 없습니다: ${name}`);
  }
  const sections = Object.keys(checked.files).filter(name => /^Contents\/section\d+\.xml$/i.test(name));
  if (!sections.length) throw new Error('HWPX 본문 파일이 없습니다.');

  const mime = (await checked.file('mimetype').async('string')).trim();
  if (mime !== 'application/hwp+zip') throw new Error('HWPX mimetype 값이 올바르지 않습니다.');

  for (const name of ['version.xml', 'Contents/content.hpf', ...sections]) {
    validateHwpxXml(await checked.file(name).async('string'), name);
  }
}

async function buildBackupHwpxBlob(events, docs, period) {
  await Promise.all([ensureJSZip(), ensureBundledHwpxTemplates()]);
  const source = createBackupHwpxSource(events, docs, period);

  try {
    const templateZip = await loadBundledMeetingTemplateZip('weekly');
    const sectionNames = Object.keys(templateZip.files).filter(name => /^Contents\/section\d+\.xml$/i.test(name));
    if (!sectionNames.length) throw new Error('HWPX 기본 양식에서 본문 파일을 찾지 못했습니다.');

    for (const sectionName of sectionNames) {
      const original = await templateZip.file(sectionName).async('string');
      const applied = applyMeetingFormLayout(original, source.id, {
        meetingType: 'weekly',
        department: '과 캘린더 자료 백업',
        headings: ['과 캘린더 일정', '회의자료 및 출장복명서']
      });
      if (!applied.applied) throw new Error('HWPX 기본 양식에 백업 내용을 적용하지 못했습니다.');
      validateHwpxXml(applied.xml, sectionName);
      templateZip.file(sectionName, applied.xml);
    }

    if (templateZip.file('Preview/PrvText.txt')) {
      templateZip.file('Preview/PrvText.txt', source.innerText.trim());
    }

    const outputZip = await repackHwpxWithMimetypeFirst(templateZip);
    const blob = await outputZip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.hancom.hwpx',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    await validateBackupHwpxBlob(blob);
    return blob;
  } finally {
    source.remove();
  }
}

async function selectedBackupRecords() {
  const period = backupPeriod();
  const current = await fetchCurrentBackupRecords();
  const deptEvents = current.events
    .filter(item => item?.scope === '과')
    .filter(item => eventInBackupPeriod(item, period));
  const docs = current.docs
    .filter(isSupportedBackupDoc)
    .filter(item => docInBackupPeriod(item, period));
  const meetingDocs = docs.filter(item => backupDocKind(item) === 'meeting');
  const tripDocs = docs.filter(item => backupDocKind(item) === 'trip');
  return { period, deptEvents, meetingDocs, tripDocs, warnings: current.warnings };
}

async function downloadDeptCalendarBackupHwpx() {
  try {
    backupStatus('한글 파일에 넣을 자료를 확인하는 중입니다.');
    const selected = await selectedBackupRecords();
    const docs = [...selected.meetingDocs, ...selected.tripDocs];
    backupStatus(`과 일정 ${selected.deptEvents.length}건, 회의자료 ${selected.meetingDocs.length}건, 출장복명 ${selected.tripDocs.length}건을 한글 파일로 만드는 중입니다.`);
    const blob = await buildBackupHwpxBlob(selected.deptEvents, docs, selected.period);
    const label = selected.period.type === 'all' ? '전체' : selected.period.filename;
    const filename = `과캘린더_회의자료_출장복명_${label}_${today().replace(/-/g, '')}.hwpx`;
    saveBlobFile(blob, filename);
    backupStatus(`한글 파일 저장 완료 · 과 일정 ${selected.deptEvents.length}건 · 회의자료 ${selected.meetingDocs.length}건 · 출장복명 ${selected.tripDocs.length}건`);
  } catch (error) {
    console.error('백업 HWPX 생성 오류:', error);
    backupStatus(`한글 파일 생성 실패: ${error.message || error}`);
    alert('백업용 한글 파일을 만들지 못했습니다.\n' + (error.message || error));
  }
}

async function createPeriodBackup() {
  try {
    await ensureJSZip();
    const selected = await selectedBackupRecords();
    const zip = new JSZip();
    const allDocs = [...selected.meetingDocs, ...selected.tripDocs];
    const info = {
      app: '개인·과 캘린더',
      backupVersion: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      period: selected.period,
      scope: 'dept-calendar-meeting-trip-only',
      counts: {
        deptEvents: selected.deptEvents.length,
        meetingDocs: selected.meetingDocs.length,
        tripDocs: selected.tripDocs.length
      },
      excluded: ['개인 캘린더', '사진 보관함', '사용자 설정', '출장복명 임시저장'],
      warnings: selected.warnings
    };

    const restoreBundle = {
      info,
      events: selected.deptEvents.map(clonePlain),
      docs: allDocs.map(clonePlain)
    };

    zip.file('복원데이터/calendar-data.backup', JSON.stringify(restoreBundle, null, 2));
    zip.file('백업안내.txt', [
      `백업 범위: ${selected.period.label}`,
      `과 캘린더 일정: ${selected.deptEvents.length}건`,
      `회의자료: ${selected.meetingDocs.length}건`,
      `출장복명서: ${selected.tripDocs.length}건`,
      '',
      '개인 캘린더, 사진 보관함, 사용자 설정, 출장복명 임시저장은 포함하지 않았습니다.',
      '복원할 때는 ZIP 압축을 풀지 말고 앱의 설정 → 백업본 불러오기에서 ZIP 파일 자체를 선택하세요.',
      selected.warnings.length ? `주의: ${selected.warnings.length}건의 확인 경고가 있습니다.` : '서버에서 확인된 최신 자료를 기준으로 생성했습니다.'
    ].join('\n'));

    backupStatus('ZIP 백업 파일을 생성하는 중입니다.');
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    const filename = `calendar_backup_${selected.period.filename}_${today().replace(/-/g, '')}.zip`;
    saveBlobFile(blob, filename);
    backupStatus(`ZIP 백업 완료 · 과 일정 ${selected.deptEvents.length}건 · 회의자료 ${selected.meetingDocs.length}건 · 출장복명 ${selected.tripDocs.length}건`);
  } catch (error) {
    console.error('ZIP 백업 생성 오류:', error);
    backupStatus(`ZIP 백업 생성 실패: ${error.message || error}`);
    alert('ZIP 백업 파일을 만들지 못했습니다.\n' + (error.message || error));
  }
}

async function readBackupJson(zip, path, fallback) {
  const file = zip.file(path);
  if (!file) return fallback;
  return JSON.parse(await file.async('string'));
}

async function readBackupBundle(zip) {
  const bundledFile = zip.file('복원데이터/calendar-data.backup') || zip.file('restore/calendar-data.backup');
  if (bundledFile) {
    const bundle = JSON.parse(await bundledFile.async('string'));
    return {
      info: bundle?.info || null,
      events: Array.isArray(bundle?.events) ? bundle.events : [],
      docs: Array.isArray(bundle?.docs) ? bundle.docs : []
    };
  }

  return {
    info: await readBackupJson(zip, 'backup-info.json', null),
    events: await readBackupJson(zip, 'data/events.json', []),
    docs: await readBackupJson(zip, 'data/archive-documents.json', [])
  };
}

function mergeBackupRecords(existing, incoming, mode) {
  const map = new Map((existing || []).filter(item => item?.id).map(item => [String(item.id), item]));
  const toWrite = [];
  let added = 0;
  let overwritten = 0;
  let skipped = 0;

  (incoming || []).forEach(raw => {
    if (!raw || typeof raw !== 'object') return;
    const item = clonePlain(raw);
    item.id = String(item.id || uid());
    const has = map.has(item.id);
    if (has && mode === 'skip') {
      skipped += 1;
      return;
    }
    if (has) overwritten += 1;
    else added += 1;
    map.set(item.id, item);
    toWrite.push(item);
  });

  return { items: [...map.values()], toWrite, added, overwritten, skipped };
}

function normalizeRestoredDeptEvent(event) {
  const item = clonePlain(event) || {};
  item.id = String(item.id || uid());
  item.scope = '과';
  item.owner = item.owner || '과';
  item.ownerUid = item.ownerUid || ownerKey();
  item.createdByUid = item.createdByUid || item.ownerUid || ownerKey();
  item.sourceOwnerUid = item.sourceOwnerUid || item.ownerUid || ownerKey();
  item.visibleTo = Array.isArray(item.visibleTo) ? item.visibleTo : ['dept', item.ownerUid];
  item.date = dateStringFromValue(item.date) || today();
  item.endDate = dateStringFromValue(item.endDate || item.date) || item.date;
  item.updatedAt = new Date().toISOString();
  return item;
}

function normalizeRestoredDoc(doc) {
  const item = clonePlain(doc) || {};
  item.id = String(item.id || uid());
  if (item.scope !== '과') {
    item.scope = '개인';
    item.ownerUid = ownerKey();
    item.owner = data.user || item.owner || '';
  } else {
    item.ownerUid = item.ownerUid || ownerKey();
    item.owner = item.owner || data.user || '';
  }
  item.updatedAt = new Date().toISOString();
  return item;
}

async function writeRestoredRecordsToCloud(collectionName, records) {
  if (!USE_FIREBASE || !db || !auth?.currentUser || !records.length) {
    return { success: 0, failed: 0, errors: [] };
  }

  let success = 0;
  let failed = 0;
  const errors = [];
  for (let start = 0; start < records.length; start += 20) {
    const group = records.slice(start, start + 20);
    const results = await Promise.allSettled(group.map(item => upsert(collectionName, item)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') success += 1;
      else {
        failed += 1;
        errors.push(`${group[index]?.id || 'unknown'}: ${result.reason?.message || result.reason}`);
      }
    });
  }
  return { success, failed, errors };
}

async function restorePeriodBackup() {
  const input = $('backupRestoreFile');
  const file = input?.files?.[0];
  if (!file) {
    alert('불러올 ZIP 백업 파일을 선택하세요.');
    return;
  }

  try {
    await ensureJSZip();
    restoreStatus('ZIP 백업 파일을 확인하는 중입니다.');
    const zip = await JSZip.loadAsync(file);
    const bundle = await readBackupBundle(zip);
    const info = bundle.info;
    if (!info || info.app !== '개인·과 캘린더') {
      throw new Error('이 프로그램에서 만든 백업 ZIP이 아닙니다.');
    }

    const rawEvents = (Array.isArray(bundle.events) ? bundle.events : [])
      .filter(item => item?.scope === '과');
    const rawDocs = (Array.isArray(bundle.docs) ? bundle.docs : [])
      .filter(isSupportedBackupDoc);
    const meetingCount = rawDocs.filter(item => backupDocKind(item) === 'meeting').length;
    const tripCount = rawDocs.filter(item => backupDocKind(item) === 'trip').length;
    const mode = $('backupRestoreMode')?.value || 'skip';

    const accepted = confirm([
      `백업 범위: ${info.period?.label || '확인 불가'}`,
      `과 캘린더 일정 ${rawEvents.length}건`,
      `회의자료 ${meetingCount}건`,
      `출장복명서 ${tripCount}건`,
      '',
      mode === 'overwrite'
        ? '같은 ID의 자료는 백업본 내용으로 덮어씁니다.'
        : '현재 자료와 같은 ID가 있으면 건너뜁니다.',
      '이 ZIP 백업본을 불러올까요?'
    ].join('\n'));
    if (!accepted) return;

    restoreStatus('과 일정과 보관자료를 복원하는 중입니다.');
    const importedEvents = rawEvents.map(normalizeRestoredDeptEvent);
    const importedDocs = rawDocs.map(normalizeRestoredDoc);
    const eventMerge = mergeBackupRecords(data.events || [], importedEvents, mode);
    const docMerge = mergeBackupRecords(data.docs || [], importedDocs, mode);

    data.events = eventMerge.items;
    data.docs = docMerge.items;
    data.deletedEventIds = (data.deletedEventIds || []).filter(id => !importedEvents.some(item => String(item.id) === String(id)));
    data.deletedDocIds = (data.deletedDocIds || []).filter(id => !importedDocs.some(item => String(item.id) === String(id)));

    localSave();
    render();
    renderArchive();

    const [eventCloud, docCloud] = await Promise.all([
      writeRestoredRecordsToCloud('events', eventMerge.toWrite),
      writeRestoredRecordsToCloud('docs', docMerge.toWrite)
    ]);

    const failures = eventCloud.failed + docCloud.failed;
    const summary = [
      '복원 완료',
      `과 일정: 추가 ${eventMerge.added}건 / 덮어쓰기 ${eventMerge.overwritten}건 / 건너뜀 ${eventMerge.skipped}건`,
      `회의자료·출장복명: 추가 ${docMerge.added}건 / 덮어쓰기 ${docMerge.overwritten}건 / 건너뜀 ${docMerge.skipped}건`,
      failures ? `서버 반영 실패 ${failures}건` : '서버 반영까지 완료'
    ].join(' · ');

    restoreStatus(summary);
    alert(summary + (failures ? '\n일부 자료는 권한 또는 네트워크 문제로 서버에 반영되지 않았습니다. 현재 기기에는 가능한 자료가 복원되었습니다.' : ''));
    if (input) input.value = '';
  } catch (error) {
    console.error('ZIP 백업 복원 오류:', error);
    restoreStatus(`복원 실패: ${error.message || error}`);
    alert('ZIP 백업본을 불러오지 못했습니다.\n' + (error.message || error));
  }
}
