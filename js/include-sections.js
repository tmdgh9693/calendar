async function loadSections() {
  const placeholders = [...document.querySelectorAll('[data-include-section]')];

  for (const placeholder of placeholders) {
    const url = placeholder.getAttribute('data-include-section');
    const response = await fetch(url, { cache: 'no-cache' });

    if (!response.ok) {
      throw new Error(`${url} 로드 실패 (${response.status})`);
    }

    placeholder.outerHTML = await response.text();
  }
}
