// js/app.js
// 앱 초기화 담당

function init() {
  load();

  if ($('loginBtn')) $('loginBtn').innerText = '로그인 / 회원가입';
  if ($('login')) $('login').classList.toggle('hidden', Boolean(data.user));
  if ($('who')) $('who').innerText = `${data.user || '미로그인'}${USE_FIREBASE ? ' / 실시간 동기화' : ' / 브라우저 임시 저장'}`;
  if ($('userName')) $('userName').value = data.user || '';
  if ($('userColor')) $('userColor').value = data.userColors?.[ownerKey()] || '#2563eb';

  setHM('evStart', 9, 0);
  setHM('evEnd', 18, 0);
  setHM('tStart', 9, 0);
  setHM('tEnd', 18, 0);

  if ($('tDate') && !$('tDate').value) $('tDate').value = today();
  if ($('tReportDate') && !$('tReportDate').value) $('tReportDate').value = today();

  updateMeetingPeriod?.();
  initDeptMeetingDates?.();
  renderHwpxTemplateControls?.();
  if (![...document.body.classList].some(name => name.startsWith('theme-'))) setTheme('personal');
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  watchAuthState();
});
