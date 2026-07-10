let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

async function installWebApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    return;
  }

  if (isIosDevice()) {
    alert('iPhone/iPad에서는 Safari 하단 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택하세요.');
    return;
  }

  alert('브라우저 주소창 또는 메뉴에서 “앱 설치”를 선택하세요. 설치 버튼은 HTTPS 또는 GitHub Pages/Vercel 배포 주소에서 활성화됩니다.');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('웹앱 서비스 워커 등록 실패:', error);
    });
  });
}
