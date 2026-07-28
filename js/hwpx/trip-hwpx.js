'use strict';

async function buildTripPhotoAssets() {
  const picked = (photos || []);
  const assets = [];

  for (let index = 0; index < picked.length; index++) {
    const photo = picked[index];
    const dimensions = await hwpxImageDimensions(photo.data);
    const { bytes, format } = hwpxDataUrlToBytes(photo.data);

    assets.push({
      bytes,
      format,
      pixelWidth: dimensions.width,
      pixelHeight: dimensions.height,
      caption: String(photo.cap || `사진 ${index + 1}`),
      binaryId: ''
    });
  }

  return assets;
}


function hwpxAncestor(element, localName) {
  let current = element;
  while (current) {
    if (current.namespaceURI === HWPX_NS.hp && current.localName === localName) return current;
    current = current.parentNode;
  }
  return null;
}

function hwpxClearPhotoTable(doc, photoTable) {
  const imageSlots = [[0, 0], [0, 1], [2, 0], [2, 1], [4, 0], [4, 1]];
  const captionSlots = [[1, 0], [1, 1], [3, 0], [3, 1], [5, 0], [5, 1]];
  imageSlots.forEach(slot => hwpxSetCellText(doc, hwpxCell(photoTable, slot[0], slot[1]), ''));
  captionSlots.forEach(slot => hwpxSetCellText(doc, hwpxCell(photoTable, slot[0], slot[1]), ''));
}


function hwpxSetCellSize(cell, width, height) {
  const size = hwpxFirstChild(cell, HWPX_NS.hp, 'cellSz');
  if (!size) return;
  if (width !== null && width !== undefined) size.setAttribute('width', String(width));
  if (height !== null && height !== undefined) size.setAttribute('height', String(height));
}

function hwpxSetCellMargins(cell, margin = 90) {
  const cellMargin = hwpxFirstChild(cell, HWPX_NS.hp, 'cellMargin');
  if (!cellMargin) return;
  ['left', 'right', 'top', 'bottom'].forEach(key => cellMargin.setAttribute(key, String(margin)));
}

function hwpxCompactTripAttachmentTable(table) {
  if (!table) return;
  const sz = hwpxFirstChild(table, HWPX_NS.hp, 'sz');
  if (sz) {
    sz.setAttribute('width', '47624');
    sz.setAttribute('height', '2400');
  }
  const inMargin = hwpxFirstChild(table, HWPX_NS.hp, 'inMargin');
  if (inMargin) ['left', 'right', 'top', 'bottom'].forEach(key => inMargin.setAttribute(key, '80'));
  const widths = [5200, 700, 41724];
  Array.from(table.getElementsByTagNameNS(HWPX_NS.hp, 'tc')).forEach(cell => {
    const addr = hwpxFirstChild(cell, HWPX_NS.hp, 'cellAddr');
    const col = Number(addr?.getAttribute('colAddr') || 0);
    hwpxSetCellSize(cell, widths[col] || null, 2400);
    hwpxSetCellMargins(cell, 80);
  });
}

function hwpxCompactTripPhotoTable(table) {
  if (!table) return;
  const sz = hwpxFirstChild(table, HWPX_NS.hp, 'sz');
  if (sz) {
    sz.setAttribute('width', '47624');
    sz.setAttribute('height', '51000');
  }
  const inMargin = hwpxFirstChild(table, HWPX_NS.hp, 'inMargin');
  if (inMargin) ['left', 'right', 'top', 'bottom'].forEach(key => inMargin.setAttribute(key, '80'));
  const rowHeights = [15000, 1900, 15000, 1900, 15000, 1900];
  Array.from(table.getElementsByTagNameNS(HWPX_NS.hp, 'tc')).forEach(cell => {
    const addr = hwpxFirstChild(cell, HWPX_NS.hp, 'cellAddr');
    const row = Number(addr?.getAttribute('rowAddr') || 0);
    hwpxSetCellSize(cell, 23812, rowHeights[row] || 1900);
    hwpxSetCellMargins(cell, row % 2 === 0 ? 160 : 80);
  });
}

function hwpxCompactTripPhotoLayout(attachment, photoTable) {
  hwpxCompactTripAttachmentTable(attachment);
  hwpxCompactTripPhotoTable(photoTable);
}

function hwpxFillPhotoTable(doc, photoTable, chunk, offset, emptyBorderFillId = '') {
  const imageSlots = [[0, 0], [0, 1], [2, 0], [2, 1], [4, 0], [4, 1]];
  const captionSlots = [[1, 0], [1, 1], [3, 0], [3, 1], [5, 0], [5, 1]];

  imageSlots.forEach((slot, index) => {
    const asset = chunk[index];
    const imageCell = hwpxCell(photoTable, slot[0], slot[1]);
    const captionCell = hwpxCell(photoTable, captionSlots[index][0], captionSlots[index][1]);

    if (asset) {
      hwpxSetCellPicture(doc, imageCell, asset);
      hwpxSetCellText(doc, captionCell, asset.caption || `사진 ${offset + index + 1}`);
    } else {
      hwpxSetCellText(doc, imageCell, '');
      hwpxSetCellText(doc, captionCell, '');
      if (emptyBorderFillId) imageCell.setAttribute('borderFillIDRef', String(emptyBorderFillId));
    }

    hwpxSetCellParagraphStyle(imageCell, '2');
    hwpxSetCellParagraphStyle(captionCell, '2');
  });
}

function hasTripPhotoLayout(sectionXml) {
  try {
    const doc = parseHwpxXml(sectionXml, '출장복명서 양식');
    const tables = Array.from(doc.getElementsByTagNameNS(HWPX_NS.hp, 'tbl'));
    const [main, attachment, photoTable] = tables;
    return Boolean(
      main?.getAttribute('rowCnt') === '5' && main?.getAttribute('colCnt') === '6' &&
      attachment?.getAttribute('rowCnt') === '1' && attachment?.getAttribute('colCnt') === '3' &&
      photoTable?.getAttribute('rowCnt') === '6' && photoTable?.getAttribute('colCnt') === '2'
    );
  } catch (error) {
    return false;
  }
}

function applyTripFormLayout(sectionXml, map, assets, emptyBorderFillId = '') {
  const doc = parseHwpxXml(sectionXml, '출장복명서');
  const tables = Array.from(doc.getElementsByTagNameNS(HWPX_NS.hp, 'tbl'));
  const [main, attachment, photoTable] = tables;

  if (!hasTripPhotoLayout(sectionXml)) {
    return { xml: sectionXml, applied: false };
  }

  const by = key => String(map[key] || '');

  hwpxSetCellText(doc, hwpxCell(main, 1, 0), by('{{출장자}}'));
  hwpxSetCellText(doc, hwpxCell(main, 0, 1), `출발: ${by('{{출발}}')}\n귀청: ${by('{{귀청}}')}`);
  hwpxSetCellText(doc, hwpxCell(main, 0, 3), `복명: ${by('{{복명}}')}`);
  hwpxSetCellText(doc, hwpxCell(main, 1, 5), by('{{출장지}}'));
  hwpxSetCellText(doc, hwpxCell(main, 2, 0), [
    '1. 출장목적', by('{{출장목적}}'), '',
    '2. 출장목적 수행상황', by('{{수행상황}}'), '',
    '3. 향후계획', by('{{향후계획}}'), '',
    (assets.length ? `붙임  사진대지 ${Math.ceil(assets.length / 6)}부. 끝.` : '끝.'), '',
    '위와 같이 복명함', by('{{복명일}}')
  ].join('\n'));
  hwpxSetCellText(doc, hwpxCell(main, 4, 0), by('{{직급}}'));
  hwpxSetCellText(doc, hwpxCell(main, 4, 2), by('{{출장자서명}}') || `성명  ${by('{{성명}}')}  (인)`);
  hwpxSetCellText(doc, hwpxCell(main, 3, 4), '과 장');

  if (!assets.length) {
    [attachment, photoTable].forEach(table => {
      let paragraph = table;
      while (paragraph && !(paragraph.namespaceURI === HWPX_NS.hp && paragraph.localName === 'p')) {
        paragraph = paragraph.parentNode;
      }
      if (paragraph && paragraph.parentNode) paragraph.parentNode.removeChild(paragraph);
    });
    return { xml: serializeHwpxXml(doc), applied: true };
  }

  const chunks = [];
  for (let index = 0; index < assets.length; index += 6) chunks.push(assets.slice(index, index + 6));

  hwpxCompactTripPhotoLayout(attachment, photoTable);

  const attachmentParagraph = hwpxAncestor(attachment, 'p');
  const photoParagraph = hwpxAncestor(photoTable, 'p');

  if (attachmentParagraph) attachmentParagraph.setAttribute('pageBreak', '1');
  if (photoParagraph) photoParagraph.setAttribute('pageBreak', '0');

  let insertAfter = photoParagraph;

  hwpxSetCellText(doc, hwpxCell(attachment, 0, 0), '붙임');
  hwpxSetCellText(doc, hwpxCell(attachment, 0, 1), '');
  hwpxSetCellText(doc, hwpxCell(attachment, 0, 2), chunks.length > 1 ? '사진대지 1' : '사진대지');
  hwpxFillPhotoTable(doc, photoTable, chunks[0] || [], 0, emptyBorderFillId);

  for (let pageIndex = 1; pageIndex < chunks.length; pageIndex++) {
    if (!attachmentParagraph || !photoParagraph || !insertAfter?.parentNode) break;

    const attachmentClone = attachmentParagraph.cloneNode(true);
    attachmentClone.setAttribute('pageBreak', '1');
    const attachmentCloneTable = attachmentClone.getElementsByTagNameNS(HWPX_NS.hp, 'tbl')[0];
    hwpxCompactTripAttachmentTable(attachmentCloneTable);
    hwpxSetCellText(doc, hwpxCell(attachmentCloneTable, 0, 0), '붙임');
    hwpxSetCellText(doc, hwpxCell(attachmentCloneTable, 0, 1), '');
    hwpxSetCellText(doc, hwpxCell(attachmentCloneTable, 0, 2), `사진대지 ${pageIndex + 1}`);

    const photoClone = photoParagraph.cloneNode(true);
    const photoCloneTable = photoClone.getElementsByTagNameNS(HWPX_NS.hp, 'tbl')[0];
    hwpxCompactTripPhotoTable(photoCloneTable);
    hwpxClearPhotoTable(doc, photoCloneTable);
    hwpxFillPhotoTable(doc, photoCloneTable, chunks[pageIndex], pageIndex * 6, emptyBorderFillId);

    insertAfter.parentNode.insertBefore(attachmentClone, insertAfter.nextSibling);
    insertAfter.parentNode.insertBefore(photoClone, attachmentClone.nextSibling);
    insertAfter = photoClone;
  }

  return { xml: serializeHwpxXml(doc), applied: true };
}


function hwpxEnsureEmptyPhotoBorderFill(header) {
  const refList = header.getElementsByTagNameNS(HWPX_NS.hh, 'refList')[0];
  const borderFills = refList?.getElementsByTagNameNS(HWPX_NS.hh, 'borderFills')[0];
  if (!borderFills) throw new Error('템플릿 헤더에서 borderFills를 찾지 못했습니다.');

  const existing = Array.from(borderFills.getElementsByTagNameNS(HWPX_NS.hh, 'borderFill'))
    .find(item => item.getAttribute('data-empty-photo-diagonal') === '1');
  if (existing) return existing.getAttribute('id');

  const items = Array.from(borderFills.getElementsByTagNameNS(HWPX_NS.hh, 'borderFill'));
  const base = items.find(item => item.getAttribute('id') === '4') || items[0];
  if (!base) throw new Error('빈 사진칸용 테두리 기준을 찾지 못했습니다.');

  const nextId = String(items.reduce((max, item) => Math.max(max, Number(item.getAttribute('id')) || 0), 0) + 1);
  const diagonalFill = base.cloneNode(true);
  diagonalFill.setAttribute('id', nextId);
  diagonalFill.setAttribute('data-empty-photo-diagonal', '1');

  const slash = diagonalFill.getElementsByTagNameNS(HWPX_NS.hh, 'slash')[0];
  const backSlash = diagonalFill.getElementsByTagNameNS(HWPX_NS.hh, 'backSlash')[0];


  if (slash) {
    slash.setAttribute('type', 'NONE');
    slash.setAttribute('Crooked', '0');
    slash.setAttribute('isCounter', '0');
  }
  if (backSlash) {
    backSlash.setAttribute('type', 'CENTER');
    backSlash.setAttribute('Crooked', '0');
    backSlash.setAttribute('isCounter', '0');
  }

  borderFills.appendChild(diagonalFill);
  borderFills.setAttribute('itemCnt', String(borderFills.getElementsByTagNameNS(HWPX_NS.hh, 'borderFill').length));
  return nextId;
}

function addTripImagesToPackage(zip, headerXml, contentHpfXml, assets) {
  const header = parseHwpxXml(headerXml, 'HWPX 헤더');
  const content = parseHwpxXml(contentHpfXml, 'HWPX 목록');
  const emptyBorderFillId = hwpxEnsureEmptyPhotoBorderFill(header);
  const refList = header.getElementsByTagNameNS(HWPX_NS.hh, 'refList')[0];
  if (!refList) throw new Error('템플릿 헤더에서 refList를 찾지 못했습니다.');

  let binDataList = refList.getElementsByTagNameNS(HWPX_NS.hh, 'binDataList')[0];
  if (!binDataList) {
    binDataList = header.createElementNS(HWPX_NS.hh, 'hh:binDataList');
    binDataList.setAttribute('itemCnt', '0');
    refList.appendChild(binDataList);
  }

  const manifest = content.getElementsByTagNameNS(HWPX_NS.opf, 'manifest')[0];
  if (!manifest) throw new Error('템플릿 목록에서 manifest를 찾지 못했습니다.');

  const usedIds = new Set();
  Array.from(binDataList.getElementsByTagNameNS(HWPX_NS.hh, 'binItem')).forEach(item => {
    const name = item.getAttribute('BinData');
    if (name) usedIds.add(name.replace(/\.[^.]+$/, ''));
  });
  Array.from(manifest.getElementsByTagNameNS(HWPX_NS.opf, 'item')).forEach(item => {
    const id = item.getAttribute('id');
    if (id) usedIds.add(id);
  });

  let nextImageNumber = 1;
  const nextBinaryId = () => {
    while (usedIds.has(`image${nextImageNumber}`)) nextImageNumber++;
    const id = `image${nextImageNumber}`;
    usedIds.add(id);
    nextImageNumber++;
    return id;
  };

  let binItemId = Array.from(binDataList.getElementsByTagNameNS(HWPX_NS.hh, 'binItem'))
    .reduce((max, item) => Math.max(max, Number(item.getAttribute('id')) || 0), -1) + 1;

  assets.forEach(asset => {
    asset.binaryId = nextBinaryId();
    const binName = `${asset.binaryId}.${asset.format}`;
    zip.file(`BinData/${binName}`, asset.bytes);

    const manifestItem = content.createElementNS(HWPX_NS.opf, 'opf:item');
    manifestItem.setAttribute('id', asset.binaryId);
    manifestItem.setAttribute('href', `BinData/${binName}`);
    manifestItem.setAttribute('media-type', asset.format === 'png' ? 'image/png' : 'image/jpeg');
    manifestItem.setAttribute('isEmbeded', '1');
    manifest.appendChild(manifestItem);

    const binItem = header.createElementNS(HWPX_NS.hh, 'hh:binItem');
    binItem.setAttribute('id', String(binItemId++));
    binItem.setAttribute('Type', 'Embedding');
    binItem.setAttribute('BinData', binName);
    binItem.setAttribute('Format', asset.format);
    binDataList.appendChild(binItem);
  });

  binDataList.setAttribute('itemCnt', String(binDataList.getElementsByTagNameNS(HWPX_NS.hh, 'binItem').length));
  return {
    headerXml: serializeHwpxXml(header),
    contentHpfXml: serializeHwpxXml(content),
    emptyBorderFillId
  };
}


