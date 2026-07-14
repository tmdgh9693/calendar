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
      (USE_FIREBASE ? ' / 실시간 동기화' : ' / 설정 필요');
  }

  if ($('userName')) {
    $('userName').value = data.user || '';
  }

  if ($('userColor')) {
    $('userColor').value = data.userColors?.[ownerKey()] || '#2563eb';
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

  updateMeetingPeriod();
  initDeptMeetingDates();

  if (!document.body.className.includes('theme-')) {
    setTheme('personal');
  }

  requestAnimationFrame(() => {
    render();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (typeof loadSections === "function") {
            await loadSections();
        }
        init();

        window.addEventListener("load", () => {

            requestAnimationFrame(() => {

                window.dispatchEvent(new Event("resize"));

                render();

            });

        });

    } catch (e) {

        console.error(e);

    }
});
