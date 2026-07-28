
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
    $('loginBtn').innerText = auth?.currentUser && typeof hasApprovedAccess === 'function' && !hasApprovedAccess() ? '승인 상태 다시 확인' : '로그인';
  }

  const accessAllowed = typeof hasApprovedAccess === 'function' ? hasApprovedAccess() : !!data.user;
  const authenticatedUser = auth?.currentUser || null;
  const profileName = String(currentAccessProfile?.name || '').trim();
  const accountName = String(authenticatedUser?.displayName || '').trim();
  const displayName = String(data.user || profileName || (!isEmailLike(accountName) ? accountName : '') || '').trim();

  if (accessAllowed && authenticatedUser) {
    data.uid = authenticatedUser.uid;
    if (displayName) data.user = displayName;
  }

  if ($('login')) {
    $('login').classList.toggle('hidden', accessAllowed);
  }

  document.body.classList.toggle('access-locked', !accessAllowed);

  if ($('who')) {
    const roleText = accessAllowed && typeof accessRoleLabel === 'function' ? ` · ${accessRoleLabel()}` : '';
    $('who').innerText = accessAllowed && displayName ? displayName + roleText : '미로그인';
  }

  if ($('userName')) {
    $('userName').value = accessAllowed ? displayName : '';
  }

  const profileColor = String(currentAccessProfile?.color || '').trim();
  const savedColor = profileColor || data.userColors?.[ownerKey()] || data.userColors?.[displayName] || '#2563eb';

  const profileRank = String(currentAccessProfile?.rank || '').trim();
  const savedRank = profileRank || data.userRanks?.[ownerKey()] || data.userRanks?.[displayName] || '';
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

  if (typeof updateAccessUi === 'function') updateAccessUi();

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

  let siteUnlocked = true;
  if (typeof initializeSiteAccessGate === 'function') {
    siteUnlocked = await initializeSiteAccessGate();
  }

  init();
  if (siteUnlocked && typeof watchAuthState === 'function') {
    watchAuthState();
  } else if (siteUnlocked) {
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

  const signupModal = document.getElementById('signupModal');
  if (signupModal && !signupModal.classList.contains('hidden') && typeof closeSignup === 'function') {
    closeSignup();
    return;
  }

  const adminSecurityModal = document.getElementById('adminSecurityModal');
  if (adminSecurityModal && !adminSecurityModal.classList.contains('hidden') && typeof closeAdminSecurityModal === 'function') {
    closeAdminSecurityModal();
    return;
  }

  const meetingPanel = document.getElementById('deptMeetingResultPanel');
  if (meetingPanel && !meetingPanel.classList.contains('hidden') && typeof closeDeptMeetingReport === 'function') {
    closeDeptMeetingReport();
  }
});


function openSettingsFromUserMenu() {
  document.getElementById('userMenu')?.classList.add('hidden');
  tab('settings', document.querySelector('[data-tab="settings"]'));
}

function toggleUserMenu(event) {
  event?.stopPropagation();
  const menu = $('userMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
  const button = event?.currentTarget;
  if (button) button.setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
}

document.addEventListener('click', event => {
  const menu = $('userMenu');
  if (!menu || menu.classList.contains('hidden')) return;
  if (!event.target.closest('.user-area')) {
    menu.classList.add('hidden');
    document.querySelector('.user-profile-button')?.setAttribute('aria-expanded', 'false');
  }
});
