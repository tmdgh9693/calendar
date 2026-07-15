const SECTION_CACHE_PREFIX = 'ys_calendar_section_cache_v2:';

function embeddedSectionHtml(url) {
  return window.EMBEDDED_SECTIONS?.[url] || window.EMBEDDED_SECTIONS?.[String(url).replace(/^\.\//, './')] || '';
}

async function fetchSectionHtml(url) {
  const embedded = embeddedSectionHtml(url);
  const cacheKey = SECTION_CACHE_PREFIX + url;

  // file:// 또는 일시적인 네트워크 오류에서도 화면이 반드시 열리도록 내장본을 우선 확보합니다.
  if (location.protocol === 'file:' && embedded) return embedded;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} 로드 실패 (${response.status})`);
    const html = await response.text();
    if (!html.trim()) throw new Error(`${url}에 화면 내용이 없습니다.`);
    try { sessionStorage.setItem(cacheKey, html); } catch (_) {}
    return html;
  } catch (error) {
    if (embedded) return embedded;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return cached;
    } catch (_) {}
    throw new Error(`${url}을 불러오지 못했습니다: ${error.message || error}`);
  }
}

window.sectionsReady = (async function loadSections() {
  const placeholders = [...document.querySelectorAll('[data-include-section]')];
  const results = await Promise.all(placeholders.map(async placeholder => {
    const url = placeholder.getAttribute('data-include-section');
    const html = await fetchSectionHtml(url);
    const container = document.createElement('div');
    container.innerHTML = html;
    const section = container.firstElementChild;
    if (!section) throw new Error(`${url}에 유효한 section이 없습니다.`);
    return { placeholder, section };
  }));
  results.forEach(({ placeholder, section }) => placeholder.replaceWith(section));
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
