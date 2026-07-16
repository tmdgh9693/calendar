'use strict';

async function loadBundledTripTemplateZip() {
  await ensureBundledHwpxTemplates();
  if (window.BUNDLED_HWPX_TEMPLATES?.trip) {
    return JSZip.loadAsync(bundledTemplateBuffer('trip'));
  }
  const response = await fetch(DEFAULT_HWPX_TEMPLATE_PATHS.trip, { cache: 'no-store' });
  if (!response.ok) throw new Error('기본 출장복명서 양식을 찾지 못했습니다.');
  return JSZip.loadAsync(await response.arrayBuffer());
}

async function downloadHwpx(sourceId, filename, kind, options = {}) {
  try {
    await ensureJSZip();

    if (kind === 'meeting' && !$(sourceId)?.querySelector('h2')) {
      alert('먼저 회의자료 생성 버튼을 눌러 내용을 만든 뒤 저장하세요.');
      return;
    }

    const template = selectedHwpxTemplate(kind) || data.hwpxTemplate || null;
    let zip;
    if (kind === 'meeting') {
      const meetingType = options.meetingType || $(sourceId)?.dataset?.meetingType || $('mType')?.value || window.lastDeptMeetingType || 'weekly';
      options.meetingType = meetingType;
      zip = template?.b64
        ? await JSZip.loadAsync(b64ToBuf(template.b64))
        : await loadBundledMeetingTemplateZip(meetingType);
    } else if (template?.b64) {
      zip = await JSZip.loadAsync(b64ToBuf(template.b64));
    } else {
      zip = await loadBundledTripTemplateZip();
    }
    let sectionNames = Object.keys(zip.files).filter(name => /^Contents\/section\d+\.xml$/i.test(name));
    if (!sectionNames.length) {
      alert('템플릿에서 Contents/section*.xml을 찾지 못했습니다. 다른 HWPX 템플릿을 등록해 주세요.');
      return;
    }

    let usedBundledTripForm = false;
    if (kind === 'trip') {
      const currentSections = await Promise.all(sectionNames.map(name => zip.file(name).async('string')));
      const isPhotoForm = currentSections.some(hasTripPhotoLayout);

      if (!isPhotoForm) {
        zip = await loadBundledTripTemplateZip();
        sectionNames = Object.keys(zip.files).filter(name => /^Contents\/section\d+\.xml$/i.test(name));
        usedBundledTripForm = true;
      }
    }

    const map = hwpxMap(kind, sourceId, options);
    const photoAssets = kind === 'trip' ? await buildTripPhotoAssets() : [];
    let replacedAny = false;
    let tripLayoutApplied = false;
    let emptyPhotoBorderFillId = '';

    if (kind === 'trip' && photoAssets.length) {
      const headerFile = zip.file('Contents/header.xml');
      const contentFile = zip.file('Contents/content.hpf');
      if (!headerFile || !contentFile) throw new Error('사진을 넣을 HWPX 헤더 파일을 찾지 못했습니다.');

      const packageUpdate = addTripImagesToPackage(
        zip,
        await headerFile.async('string'),
        await contentFile.async('string'),
        photoAssets
      );
      zip.file('Contents/header.xml', packageUpdate.headerXml);
      zip.file('Contents/content.hpf', packageUpdate.contentHpfXml);
      emptyPhotoBorderFillId = packageUpdate.emptyBorderFillId || '';
    }

    for (const sectionName of sectionNames) {
      const original = await zip.file(sectionName).async('string');
      let replaced = replacePlaceholders(original, map);

      if (kind === 'meeting') {
        const applied = applyMeetingFormLayout(replaced, sourceId, options);
        replaced = applied.xml;
        replacedAny = replacedAny || applied.applied;
      }

      if (kind === 'trip') {
        const applied = applyTripFormLayout(replaced, map, photoAssets, emptyPhotoBorderFillId);
        replaced = applied.xml;
        tripLayoutApplied = tripLayoutApplied || applied.applied;
      }

      validateHwpxXml(replaced, sectionName);
      if (replaced !== original) replacedAny = true;
      zip.file(sectionName, replaced);
    }

    if (!replacedAny && !(kind === 'trip' && tripLayoutApplied)) {
      alert('이 템플릿에는 필요한 표시값이 없습니다. 회의자료용 또는 출장복명서용 서식 초안을 등록해 주세요.');
      return;
    }

    if (zip.file('Preview/PrvText.txt')) {
      const photoNote = kind === 'trip' ? `\n사진대지 ${photoAssets.length}장 첨부` : '';
      zip.file('Preview/PrvText.txt', compactHwpxLines(sourceId).join('\n') + photoNote);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    alert(`${hwpxKindLabel(kind)} HWPX 저장이 완료되었습니다.`);
  } catch (error) {
    console.error(error);
    alert('HWPX 생성 오류: ' + error.message);
  }
}
