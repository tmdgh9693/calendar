function init() {
  load();

  if ($('loginBtn')) $('loginBtn').innerText = '로그인 / 회원가입';

  if ($('login')) {
    if (!data.user) $('login').classList.remove('hidden');
    else $('login').classList.add('hidden');
  }

  if ($('who')) $('who').innerText = (data.user || '미로그인') + (USE_FIREBASE ? ' / 실시간 동기화' : ' / Firebase 설정 필요');
  if ($('userName')) $('userName').value = data.user || '';

  if ($('hwpxStatus')) {
    $('hwpxStatus').innerText = data.hwpxTemplate ? '등록됨: ' + data.hwpxTemplate.name : '등록된 HWPX 템플릿 없음';
  }

  if ($('userColor')) {
    $('userColor').value = (auth?.currentUser && data.userColors?.[auth.currentUser.uid]) || '#2563eb';
  }

  setHM('evStart', 9, 0);
  setHM('evEnd', 18, 0);
  setHM('tStart', 9, 0);
  setHM('tEnd', 18, 0);

  if ($('tDate') && !$('tDate').value) $('tDate').value = today();
  if ($('tReportDate') && !$('tReportDate').value) $('tReportDate').value = today();

  if (typeof updateMeetingPeriod === 'function') updateMeetingPeriod();
  if (typeof initDeptMeetingDates === 'function') initDeptMeetingDates();

  if (!document.body.className.includes('theme-')) setTheme('personal');
  if (typeof render === 'function') render();
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof watchAuthState === 'function') watchAuthState();
  else init();
});
