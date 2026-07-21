'use strict';

function backupStatus(message) {
  const status = $('backupStatus');
  if (status) status.textContent = message || '';
}

function initBackupPeriodInputs() {
  const now = new Date();
  const year = $('backupYear');
  const month = $('backupMonth');

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
  const type = $('backupPeriodType')?.value || 'month';
  $('backupYearField')?.classList.toggle('hidden', type === 'all');
  $('backupMonthField')?.classList.toggle('hidden', type !== 'month');
}

function backupPeriod() {
  const type = $('backupPeriodType')?.value || 'month';
  const year = String(Number($('backupYear')?.value || new Date().getFullYear())).padStart(4, '0');
  const monthValue = String($('backupMonth')?.value || '01').padStart(2, '0');

  if (type === 'all') return { type, label: '전체', prefix: '', filename: 'all' };
  if (type === 'year') return { type, year, label: `${year}년`, prefix: `${year}-`, filename: year };
  return { type, year, month: monthValue, label: `${year}년 ${Number(monthValue)}월`, prefix: `${year}-${monthValue}`, filename: `${year}_${monthValue}` };
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

function itemBackupDate(item, kind = '') {
  if (!item) return '';
  if (kind === 'doc' && item.tripSnapshot) {
    return dateStringFromValue(item.tripSnapshot.date || item.tripSnapshot.reportDate || item.createdAt || item.date);
  }
  if (kind === 'draft') {
    return dateStringFromValue(item.snapshot?.date || item.snapshot?.reportDate || item.savedAt || item.createdAt);
  }
  if (kind === 'photo') return dateStringFromValue(item.savedAt || item.createdAt || item.updatedAt);
  return dateStringFromValue(item.date || item.createdAt || item.updatedAt);
}

function isInBackupPeriod(dateValue, period) {
  if (period.type === 'all') return true;
  const date = dateStringFromValue(dateValue);
  if (!date) return false;
  return period.type === 'year' ? date.startsWith(`${period.year}-`) : date.startsWith(`${period.year}-${period.month}`);
}

function jsonFile(value) {
  return JSON.stringify(value, null, 2);
}

function backupSafeName(value, fallback) {
  return String(value || fallback || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
}

async function createPeriodBackup() {
  try {
    if (typeof ensureJSZip === 'function') await ensureJSZip();
  } catch (error) {
    alert('ZIP 생성 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    return;
  }
  if (!window.JSZip) {
    alert('ZIP 생성 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    return;
  }

  const includeEvents = $('backupIncludeEvents')?.checked !== false;
  const includeDocs = $('backupIncludeDocs')?.checked !== false;
  const includeDrafts = $('backupIncludeDrafts')?.checked !== false;
  const includeCompressed = !!$('backupIncludeCompressedPhotos')?.checked;
  const includeOriginal = !!$('backupIncludeOriginalPhotos')?.checked;

  if (![includeEvents, includeDocs, includeDrafts, includeCompressed, includeOriginal].some(Boolean)) {
    alert('백업할 자료를 하나 이상 선택하세요.');
    return;
  }

  const period = backupPeriod();
  const zip = new JSZip();
  const warnings = [];
  const counts = { events: 0, docs: 0, drafts: 0, compressedPhotos: 0, originalPhotos: 0 };

  backupStatus(`${period.label} 백업 자료를 정리하는 중입니다.`);

  const events = includeEvents
    ? (data.events || []).filter(item => isInBackupPeriod(itemBackupDate(item, 'event'), period))
    : [];
  const docs = includeDocs
    ? (data.docs || []).filter(item => isInBackupPeriod(itemBackupDate(item, 'doc'), period))
    : [];
  const drafts = includeDrafts && typeof listNamedTripDrafts === 'function'
    ? (await listNamedTripDrafts()).filter(item => isInBackupPeriod(itemBackupDate(item, 'draft'), period))
    : [];

  if (includeEvents) zip.file('data/events.json', jsonFile(events));
  if (includeDocs) zip.file('data/archive-documents.json', jsonFile(docs));
  if (includeDrafts) zip.file('data/trip-drafts.json', jsonFile(drafts));

  counts.events = events.length;
  counts.docs = docs.length;
  counts.drafts = drafts.length;

  zip.file('data/user-settings.json', jsonFile({
    user: data.user || '',
    uid: ownerKey() || '',
    userColors: data.userColors || {},
    userRanks: data.userRanks || {},
    hwpxTemplateSelections: data.hwpxTemplateSelections || {}
  }));

  if (includeCompressed || includeOriginal) {
    backupStatus('사진 보관함 목록을 불러오는 중입니다.');
    try {
      if (typeof ensurePhotoVaultRealtime === 'function') await ensurePhotoVaultRealtime();
      const records = typeof photoVaultRecords === 'function' ? await photoVaultRecords() : [];
      const selected = records.filter(item => isInBackupPeriod(itemBackupDate(item, 'photo'), period));
      const photoIndex = [];

      for (let index = 0; index < selected.length; index += 1) {
        const record = selected[index];
        const base = `${String(index + 1).padStart(4, '0')}_${backupSafeName(filenameBase(record.name || ''), '사진')}`;
        const entry = {
          key: record.key,
          name: record.name || '',
          savedAt: record.savedAt || null,
          originalSize: record.originalSize || 0,
          compressedBytes: record.compressedBytes || 0,
          compressedFile: '',
          originalFile: ''
        };

        backupStatus(`사진 백업 중 ${index + 1}/${selected.length}`);

        if (includeCompressed) {
          try {
            const blob = await getCompressedPhotoBlob(record);
            const path = `photos/compressed/${base}_압축본.jpg`;
            zip.file(path, await blob.arrayBuffer());
            entry.compressedFile = path;
            counts.compressedPhotos += 1;
          } catch (error) {
            warnings.push(`${record.name || base} 압축본: ${error.message || error}`);
          }
        }

        if (includeOriginal) {
          try {
            const blob = await getOriginalPhotoBlob(record);
            const extension = typeof photoExtension === 'function'
              ? photoExtension(record.originalMimeType, record.name)
              : 'jpg';
            const path = `photos/original/${base}_원본.${extension}`;
            zip.file(path, await blob.arrayBuffer());
            entry.originalFile = path;
            counts.originalPhotos += 1;
          } catch (error) {
            warnings.push(`${record.name || base} 원본: ${error.message || error}`);
          }
        }
        photoIndex.push(entry);
      }
      zip.file('photos/index.json', jsonFile(photoIndex));
    } catch (error) {
      warnings.push(`사진 보관함: ${error.message || error}`);
    }
  }

  const info = {
    app: '개인·과 캘린더',
    backupVersion: 1,
    createdAt: new Date().toISOString(),
    period,
    owner: { uid: ownerKey() || '', name: data.user || '' },
    includes: { includeEvents, includeDocs, includeDrafts, includeCompressed, includeOriginal },
    counts,
    warnings
  };

  zip.file('backup-info.json', jsonFile(info));
  zip.file('백업안내.txt', [
    `백업 범위: ${period.label}`,
    `일정: ${counts.events}건`,
    `보관자료: ${counts.docs}건`,
    `출장복명 임시저장: ${counts.drafts}건`,
    `압축 사진: ${counts.compressedPhotos}장`,
    `원본 사진: ${counts.originalPhotos}장`,
    warnings.length ? `주의: ${warnings.length}건의 자료는 백업하지 못했습니다. backup-info.json을 확인하세요.` : '모든 선택 자료를 백업했습니다.'
  ].join('\n'));

  backupStatus('ZIP 파일을 생성하는 중입니다.');
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  const filename = `calendar_backup_${period.filename}_${today().replace(/-/g, '')}.zip`;

  if (typeof saveBlobFile === 'function') {
    saveBlobFile(blob, filename);
  } else {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  backupStatus(warnings.length
    ? `백업 완료 · 일부 누락 ${warnings.length}건 (ZIP의 backup-info.json 확인)`
    : `백업 완료 · 일정 ${counts.events}건, 보관자료 ${counts.docs}건, 임시저장 ${counts.drafts}건`);
}
