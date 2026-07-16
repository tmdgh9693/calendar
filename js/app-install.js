let deferredInstallPrompt = null;

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function installButtons() {
  return [
    document.getElementById('installAppBtnPersonal'),
    document.getElementById('installAppBtnSettings')
  ].filter(Boolean);
}

function updateInstallButtons() {
  const installed = isStandaloneMode();
  installButtons().forEach(button => {
    button.textContent = installed ? '웹앱 설치 완료' : '홈 화면에 설치';
    button.disabled = installed;
    button.setAttribute('aria-disabled', installed ? 'true' : 'false');
  });
}

function showInstallGuide(title, message, steps = []) {
  let guide = document.getElementById('webAppInstallGuide');
  if (!guide) {
    guide = document.createElement('div');
    guide.id = 'webAppInstallGuide';
    guide.className = 'install-guide hidden';
    guide.innerHTML = `
      <div class="install-guide-backdrop" data-install-close></div>
      <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="installGuideTitle">
        <button class="install-guide-close" type="button" aria-label="닫기" data-install-close>×</button>
        <h2 id="installGuideTitle"></h2>
        <p id="installGuideMessage"></p>
        <ol id="installGuideSteps"></ol>
        <button class="p install-guide-ok" type="button" data-install-close>확인</button>
      </section>`;
    document.body.appendChild(guide);
    guide.querySelectorAll('[data-install-close]').forEach(element => {
      element.addEventListener('click', () => guide.classList.add('hidden'));
    });
  }

  guide.querySelector('#installGuideTitle').textContent = title;
  guide.querySelector('#installGuideMessage').textContent = message;
  guide.querySelector('#installGuideSteps').innerHTML = steps
    .map(step => `<li>${step}</li>`)
    .join('');
  guide.classList.remove('hidden');
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtons();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButtons();
  alert('웹앱 설치가 완료되었습니다. 홈 화면이나 바탕화면에서 실행할 수 있습니다.');
});

async function installWebApp() {
  if (isStandaloneMode()) {
    alert('이미 웹앱으로 설치되어 있습니다.');
    return;
  }

  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);

    if (choice?.outcome === 'accepted') {
      updateInstallButtons();
    } else {
      alert('웹앱 설치가 취소되었습니다. 다시 설치하려면 버튼을 눌러주세요.');
    }
    return;
  }

  if (isIosDevice()) {
    showInstallGuide(
      'iPhone 홈 화면에 설치',
      'iPhone에서는 웹사이트가 설치 창을 직접 띄울 수 없어 Safari의 홈 화면 추가 기능을 사용해야 합니다.',
      [
        '이 페이지를 Safari에서 엽니다.',
        '화면 아래의 공유 버튼(□ 위쪽 화살표)을 누릅니다.',
        '목록에서 “홈 화면에 추가”를 선택합니다.',
        '오른쪽 위의 “추가”를 누릅니다.'
      ]
    );
    return;
  }

  const isSecure = window.isSecureContext &&
    (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname));

  if (!isSecure) {
    showInstallGuide(
      '설치 가능한 주소에서 열어주세요',
      '웹앱 설치는 HTTPS로 배포된 주소 또는 localhost에서만 작동합니다.',
      [
        'ZIP 파일의 index.html을 직접 더블 클릭한 file:// 주소에서는 설치할 수 없습니다.',
        'GitHub Pages 또는 Vercel에 올린 HTTPS 주소로 접속합니다.',
        'Chrome 또는 Edge에서 다시 “홈 화면에 설치” 버튼을 누릅니다.'
      ]
    );
    return;
  }

  showInstallGuide(
    '브라우저 설치 메뉴를 확인해주세요',
    '현재 브라우저가 자동 설치 창을 제공하지 않았습니다.',
    [
      'Chrome/Edge 주소창 오른쪽의 설치 아이콘을 확인합니다.',
      '또는 브라우저 메뉴에서 “앱 설치” 또는 “이 페이지를 앱으로 설치”를 선택합니다.',
      '페이지를 한 번 새로고침한 뒤 버튼을 다시 눌러도 됩니다.'
    ]
  );
}

window.installWebApp = installWebApp;

if ('serviceWorker' in navigator) {
  const SERVICE_WORKER_BUILD = 'photo-original-sync-20260716-4';
  let serviceWorkerReloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (serviceWorkerReloading) return;
    const marker = `aton-sw-reloaded:${SERVICE_WORKER_BUILD}`;
    try {
      if (sessionStorage.getItem(marker) === '1') return;
      sessionStorage.setItem(marker, '1');
    } catch (_) {}
    serviceWorkerReloading = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', {
        scope: './',
        updateViaCache: 'none'
      });
      await registration.update().catch(() => {});
      if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
      await navigator.serviceWorker.ready;
      if (typeof window.markOfflineReady === 'function') window.markOfflineReady();
    } catch (error) {
      console.warn('웹앱 서비스 워커 등록 실패:', error);
    }
    updateInstallButtons();
  });
} else {
  window.addEventListener('DOMContentLoaded', updateInstallButtons);
}
