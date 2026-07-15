const SECTION_CACHE_PREFIX = 'ys_calendar_section_cache_v3:';

function embeddedSectionHtml(url) {
  return window.EMBEDDED_SECTIONS?.[url] || window.EMBEDDED_SECTIONS?.[String(url).replace(/^\.\//, './')] || '';
}

async function refreshSectionCache(url) {
  if (location.protocol === 'file:') return;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return;
    const html = await response.text();
    if (html.trim()) sessionStorage.setItem(SECTION_CACHE_PREFIX + url, html);
  } catch (_) {}
}

function sectionHtmlNow(url) {
  const embedded = embeddedSectionHtml(url);
  if (embedded) {
    queueMicrotask(() => refreshSectionCache(url));
    return embedded;
  }
  try {
    const cached = sessionStorage.getItem(SECTION_CACHE_PREFIX + url);
    if (cached) {
      queueMicrotask(() => refreshSectionCache(url));
      return cached;
    }
  } catch (_) {}
  return '';
}

window.sectionsReady = (async function loadSections() {
  const placeholders = [...document.querySelectorAll('[data-include-section]')];
  for (const placeholder of placeholders) {
    const url = placeholder.getAttribute('data-include-section');
    let html = sectionHtmlNow(url);
    if (!html) {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${url} 로드 실패 (${response.status})`);
      html = await response.text();
    }
    const container = document.createElement('div');
    container.innerHTML = html;
    const section = container.firstElementChild;
    if (!section) throw new Error(`${url}에 유효한 section이 없습니다.`);
    placeholder.replaceWith(section);
  }
  document.dispatchEvent(new CustomEvent('sectionsloaded'));
  return true;
})().catch(error => {
  console.error('화면 구성 로드 오류:', error);
  const main = document.querySelector('main');
  if (main) {
    main.innerHTML = '<div class="card notice section-load-error"><h2>화면을 불러오지 못했습니다.</h2><p>배포 파일이 누락되었는지 확인해 주세요.</p><button class="p" type="button" onclick="location.reload()">다시 불러오기</button><details><summary>오류 내용</summary><pre></pre></details></div>';
    const pre = main.querySelector('pre');
    if (pre) pre.textContent = String(error.message || error);
  }
  document.body.classList.remove('app-booting');
  return false;
});
