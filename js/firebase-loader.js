const FIREBASE_SDK_VERSION = '10.12.5';

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') resolve();
      else {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.dynamic = '1';
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`${src} 로드 실패`)), { once: true });
    document.head.appendChild(script);
  });
}

window.firebaseSdkReady = (async () => {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  await loadExternalScript(`${base}/firebase-app-compat.js`);
  await Promise.all([
    loadExternalScript(`${base}/firebase-auth-compat.js`),
    loadExternalScript(`${base}/firebase-firestore-compat.js`)
  ]);
  return window.firebase;
})().catch(error => {
  console.warn('Firebase SDK를 불러오지 못해 로컬 저장 모드로 시작합니다.', error);
  return null;
});
