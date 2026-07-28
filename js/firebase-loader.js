const FIREBASE_SDK_VERSION = '10.12.5';
const FIREBASE_LOAD_TIMEOUT_MS = 4500;

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

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('연결 시간 초과')), milliseconds))
  ]);
}

window.firebaseSdkReady = (async () => {
  if (!navigator.onLine) return null;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  await withTimeout(loadExternalScript(`${base}/firebase-app-compat.js`), FIREBASE_LOAD_TIMEOUT_MS);
  await withTimeout(Promise.all([
    loadExternalScript(`${base}/firebase-auth-compat.js`),
    loadExternalScript(`${base}/firebase-firestore-compat.js`)
  ]), FIREBASE_LOAD_TIMEOUT_MS);
  return window.firebase;
})().catch(error => {
  console.warn('보안 로그인을 시작할 수 없습니다.', error);
  return null;
});
