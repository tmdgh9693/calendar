
function validateAppStructure() {
  const requiredSections = ['personal', 'dept', 'monthlySchedule', 'meeting', 'trip', 'archive', 'settings', 'photoVault'];
  const missingSections = requiredSections.filter(id => !document.getElementById(id));
  const requiredFunctions = ['tab', 'render', 'openEvent', 'makeMeeting', 'makeTrip', 'renderArchive'];
  const missingFunctions = requiredFunctions.filter(name => typeof window[name] !== 'function');

  if (missingSections.length || missingFunctions.length) {
    console.warn('앱 구성 점검:', { missingSections, missingFunctions });
  }
}

function init() {
  load();

  if ($('loginBtn')) {
    $('loginBtn').innerText = '로그인 / 회원가입';
  }

  if ($('login')) {
    if (!data.user) {
      $('login').classList.remove('hidden');
    } else {
      $('login').classList.add('hidden');
    }
  }

  if ($('who')) {
    $('who').innerText =
      (data.user || '미로그인') +
      (USE_FIREBASE ? '' : (navigator.onLine ? '' : ''));
  }

  if ($('userName')) {
    $('userName').value = data.user || '';
  }

  const savedColor = data.userColors?.[ownerKey()] || data.userColors?.[data.user] || '#2563eb';

  const savedRank = data.userRanks?.[ownerKey()] || data.userRanks?.[data.user] || '';
  if ($('userRank')) $('userRank').value = savedRank;
  if ($('loginRank')) $('loginRank').value = savedRank;
  if ($('tRank') && !$('tRank').value) $('tRank').value = savedRank;

  if ($('userColor')) {
    $('userColor').value = savedColor;
  }

  if ($('loginColor')) {
    $('loginColor').value = savedColor;
  }

  if (typeof renderHwpxTemplateStatus === 'function') {
    renderHwpxTemplateStatus();
  }

  setHM('evStart', 9, 0);
  setHM('evEnd', 18, 0);
  setHM('tStart', 9, 0);
  setHM('tEnd', 18, 0);

  if ($('tDate') && !$('tDate').value) {
    $('tDate').value = today();
  }

  if ($('tReportDate') && !$('tReportDate').value) {
    $('tReportDate').value = today();
  }

  if (typeof initTripDraft === 'function') {
    initTripDraft();
  }

  if (typeof initBackupPeriodInputs === 'function') {
    initBackupPeriodInputs();
  }

  updateMeetingPeriod();
  initDeptMeetingDates();

  if (!document.body.className.includes('theme-')) {
    setTheme('personal');
  }

  render();
  tab(typeof requestedTab === 'function' ? requestedTab() : 'personal', null, {
    skipHash: true,
    scrollTop: false,
    instant: true
  });
}

function finishInitialLayout() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.remove('app-booting'));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.sectionsReady) await window.sectionsReady;
  validateAppStructure();
  init();
  if (typeof watchAuthState === 'function') {
    watchAuthState();
  } else {
    console.error('로그인 초기화 함수를 찾지 못했습니다. auth.js 파일을 확인하세요.');
  }

  const logo = document.querySelector('.brand-button img');
  if (logo && !logo.complete) {
    logo.addEventListener('load', finishInitialLayout, { once: true });
    logo.addEventListener('error', finishInitialLayout, { once: true });
    setTimeout(finishInitialLayout, 1200);
  } else {
    finishInitialLayout();
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;

  const eventModal = document.getElementById('modal');
  if (eventModal && !eventModal.classList.contains('hidden') && typeof closeModal === 'function') {
    closeModal();
    return;
  }

  const meetingPanel = document.getElementById('deptMeetingResultPanel');
  if (meetingPanel && !meetingPanel.classList.contains('hidden') && typeof closeDeptMeetingReport === 'function') {
    closeDeptMeetingReport();
  }
});

function toggleUserMenu(event) {
  event?.stopPropagation();
  const menu = $('userMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
}

document.addEventListener('click', event => {
  const menu = $('userMenu');
  if (!menu || menu.classList.contains('hidden')) return;
  if (!event.target.closest('.user-area')) menu.classList.add('hidden');
});
