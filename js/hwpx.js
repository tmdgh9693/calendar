function bufToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function b64ToBuf(base64) {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }

  return buffer.buffer;
}

function loadHwpxTemplate(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.hwpx')) {
    alert('HWPX 파일을 선택하세요.');
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const base64 = bufToB64(reader.result);

      data.hwpxTemplate = {
        name: file.name,
        size: file.size,
        b64: base64
      };

      localSave();

      if (USE_FIREBASE && db && auth && auth.currentUser) {
        db.collection('settings')
          .doc('hwpxTemplate')
          .set(cleanForFirestore(data.hwpxTemplate), { merge: true });
      }

      if ($('hwpxStatus')) {
        $('hwpxStatus').innerText =
          '등록됨: ' + file.name + ' (' + Math.round(file.size / 1024) + 'KB)';
      }

      alert('HWPX 템플릿을 등록했습니다.');
    } catch (error) {
      console.error(error);
      alert('템플릿 저장 실패: ' + error.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

function clearHwpxTemplate() {
  if (!confirm('등록된 HWPX 템플릿을 삭제할까요?')) return;

  data.hwpxTemplate = null;
  localSave();

  if (USE_FIREBASE && db && auth && auth.currentUser) {
    db.collection('settings')
      .doc('hwpxTemplate')
      .delete();
  }

  if ($('hwpxStatus')) {
    $('hwpxStatus').innerText = '등록된 HWPX 템플릿 없음';
  }
}

function xmlTextEscape(text) {
  return String(text || '').replace(/[&<>]/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  }[match]));
}

function stripHtmlText(id) {
  const target = $(id);

  if (!target) return [];

  return target.innerText
    .replace(/\u00a0/g, ' ')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function hwpxMap(kind, sourceId) {
  const lines = stripHtmlText(sourceId);

  const map = {
    '{{본문}}': lines.join('\n'),
    '{{회의자료}}': lines.join('\n'),
    '{{제목}}': lines[0] || '',
    '{{작성일}}': kdate(today())
  };

  if (kind === 'trip') {
    map['{{출장자}}'] = $('tPerson') ? $('tPerson').value || data.user || '' : '';
    map['{{성명}}'] = $('tPerson') ? $('tPerson').value || data.user || '' : '';
    map['{{출장지}}'] = $('tPlace') ? $('tPlace').value || '' : '';

    map['{{출발}}'] =
      mdate($('tDate') ? $('tDate').value || today() : today()) +
      ' ' +
      timeText(
        $('tStartH') ? $('tStartH').value : 9,
        $('tStartM') ? $('tStartM').value : 0
      );

    map['{{귀청}}'] =
      mdate($('tDate') ? $('tDate').value || today() : today()) +
      ' ' +
      timeText(
        $('tEndH') ? $('tEndH').value : 18,
        $('tEndM') ? $('tEndM').value : 0
      );

    map['{{복명}}'] = mdate(
      $('tReportDate')
        ? $('tReportDate').value || ($('tDate') ? $('tDate').value : today())
        : today()
    );

    map['{{복명일}}'] = kdate(
      $('tReportDate')
        ? $('tReportDate').value || ($('tDate') ? $('tDate').value : today())
        : today()
    );

    map['{{직급}}'] = $('tRank') ? $('tRank').value || '' : '';
    map['{{출장목적}}'] = $('tPurpose') ? $('tPurpose').value || '' : '';
    map['{{수행상황}}'] = $('tBody') ? $('tBody').value || '' : '';
    map['{{향후계획}}'] = $('tPlan') ? $('tPlan').value || '' : '';
    map['{{붙임}}'] = typeof tripAttachmentText === 'function'
      ? tripAttachmentText()
      : '끝.';
  }

  return map;
}

function replacePlaceholders(xml, map) {
  let output = xml;

  for (const [key, value] of Object.entries(map)) {
    output = output.split(key).join(xmlTextEscape(value));
  }

  return output;
}

function compactHwpxLines(sourceId) {
  return stripHtmlText(sourceId)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 120);
}

function cleanParaForHwpx(sample, index) {
  let output = sample.replace(/id="[^"]*"/, 'id="' + index + '"');

  output = output
    .replace(/pageBreak="1"/g, 'pageBreak="0"')
    .replace(/columnBreak="1"/g, 'columnBreak="0"')
    .replace(/paraPrIDRef="[^"]*"/, 'paraPrIDRef="0"')
    .replace(/styleIDRef="[^"]*"/, 'styleIDRef="0"')
    .replace(/charPrIDRef="[^"]*"/g, 'charPrIDRef="0"');

  if (index > 0) {
    output = output.replace(/<hp:secPr[\s\S]*?<\/hp:secPr>/, '');
    output = output.replace(/<hp:ctrl>\s*<hp:colPr[\s\S]*?<\/hp:ctrl>/, '');
  }

  output = output
    .replace(/vertsize="\d+"/g, 'vertsize="1000"')
    .replace(/textheight="\d+"/g, 'textheight="1000"')
    .replace(/baseline="\d+"/g, 'baseline="850"')
    .replace(/spacing="\d+"/g, 'spacing="300"');

  return output;
}

function makeParaFromSample(sample, line, index) {
  let output = cleanParaForHwpx(sample, index);

  if (/<hp:t[\s\S]*?<\/hp:t>/.test(output)) {
    let done = false;

    output = output.replace(/<hp:t([^>]*)>[\s\S]*?<\/hp:t>/g, (match, attr) => {
      if (done) return '<hp:t' + attr + '></hp:t>';

      done = true;
      return '<hp:t' + attr + '>' + xmlTextEscape(line) + '</hp:t>';
    });
  } else {
    output = output.replace(
      /<\/hp:run>/,
      '<hp:t>' + xmlTextEscape(line) + '</hp:t></hp:run>'
    );
  }

  return output;
}

function rebuildSectionXml(xml, lines) {
  const paragraphs = xml.match(/<hp:p\b[\s\S]*?<\/hp:p>/g);

  if (!paragraphs || !paragraphs.length) return xml;

  const safeLines = (lines && lines.length ? lines : ['']).map(line =>
    String(line || '')
  );

  const firstWithSection =
    paragraphs.find(paragraph => /<hp:secPr[\s\S]*?<\/hp:secPr>/.test(paragraph)) ||
    paragraphs[0];

  const textParagraph =
    paragraphs.find(paragraph => /<hp:t[\s\S]*?<\/hp:t>/.test(paragraph)) ||
    firstWithSection;

  const body = safeLines
    .map((line, index) =>
      makeParaFromSample(index === 0 ? firstWithSection : textParagraph, line, index)
    )
    .join('\n');

  const start = xml.indexOf(paragraphs[0]);
  const end = xml.lastIndexOf(paragraphs[paragraphs.length - 1]) +
    paragraphs[paragraphs.length - 1].length;

  return xml.slice(0, start) + body + xml.slice(end);
}

async function downloadHwpx(sourceId, filename, kind) {
  try {
    if (!window.JSZip) {
      alert('HWPX 저장에 필요한 JSZip을 불러오지 못했습니다. 인터넷 연결 상태를 확인하세요.');
      return;
    }

    if (!data.hwpxTemplate) {
      alert('먼저 설정·백업 메뉴에서 HWPX 템플릿 파일(.hwpx)을 등록하세요.');
      return;
    }

    const zip = await JSZip.loadAsync(b64ToBuf(data.hwpxTemplate.b64));

    const sectionNames = Object.keys(zip.files).filter(name =>
      /^Contents\/section\d+\.xml$/i.test(name)
    );

    if (!sectionNames.length) {
      alert('템플릿에서 Contents/section*.xml을 찾지 못했습니다. 다른 HWPX 템플릿을 등록해 주세요.');
      return;
    }

    const map = hwpxMap(kind, sourceId);
    let hasPlaceholder = false;

    for (const sectionName of sectionNames) {
      const xml = await zip.file(sectionName).async('string');
      const replaced = replacePlaceholders(xml, map);

      if (replaced !== xml) {
        hasPlaceholder = true;
      }

      zip.file(sectionName, replaced);
    }

    if (!hasPlaceholder) {
      alert(
        '이 템플릿에는 {{본문}} 또는 필요한 표시값이 없습니다'
      );
      return;
    }

    if (zip.file('Preview/PrvText.txt')) {
      zip.file('Preview/PrvText.txt', compactHwpxLines(sourceId).join('\n'));
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE'
    });

    const a = document.createElement('a');

    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    URL.revokeObjectURL(a.href);

    alert('HWPX 저장 완료');
  } catch (error) {
    console.error(error);
    alert('HWPX 생성 오류: ' + error.message);
  }
}
