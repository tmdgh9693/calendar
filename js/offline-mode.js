(function () {
  const OFFLINE_KEY = 'ys_calendar_offline_ready_v1';

  function statusElement() {
    return document.getElementById('connectionStatus');
  }

  function updateConnectionStatus() {
    const online = navigator.onLine;
    const element = statusElement();
    document.documentElement.classList.toggle('is-offline', !online);
    if (element) {
      element.textContent = online ? '온라인' : '오프라인';
      element.classList.toggle('online', online);
      element.classList.toggle('offline', !online);
      element.title = online
        ? '서버 동기화를 사용할 수 있습니다.'
        : '현재 기기에 저장하며, 인터넷 연결 후 서버 동기화를 다시 시도합니다.';
    }
    window.dispatchEvent(new CustomEvent('appconnectionchange', { detail: { online } }));
  }

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  document.addEventListener('DOMContentLoaded', updateConnectionStatus);

  window.markOfflineReady = function markOfflineReady() {
    try { localStorage.setItem(OFFLINE_KEY, '1'); } catch (_) {}
  };

  window.isOfflineReady = function isOfflineReady() {
    try { return localStorage.getItem(OFFLINE_KEY) === '1'; } catch (_) { return false; }
  };
})();
