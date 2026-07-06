async function login() {
  const name = $('loginName')?.value.trim() || '';
  const email = $('loginEmail') ? $('loginEmail').value.trim() : '';
  const password = $('loginPassword') ? $('loginPassword').value : '';

  if (!name) return alert('이름을 입력하세요.');

  if (!USE_FIREBASE) {
    data.user = name;
    data.uid = name;
    localSave();
    init();
    alert('Firebase 설정 전이라 이 브라우저에서만 임시 로그인됩니다.');
    return;
  }

  if (!email || !password) return alert('이메일과 비밀번호를 입력하세요.');

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    console.error('Firebase 로그인 오류:', error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      try {
        await auth.createUserWithEmailAndPassword(email, password);
      } catch (joinError) {
        console.error('Firebase 회원가입 오류:', joinError);
        alert('회원가입 오류: ' + joinError.message);
        return;
      }
    } else if (error.code === 'auth/configuration-not-found') {
      alert('Firebase Authentication에서 이메일/비밀번호 로그인을 사용 설정했는지 확인하세요.');
      return;
    } else if (error.code === 'auth/unauthorized-domain') {
      alert('Firebase Authentication 승인된 도메인에 현재 사이트 주소를 추가하세요.');
      return;
    } else {
      alert('로그인 오류: ' + error.message);
      return;
    }
  }

  data.user = name;
  data.uid = auth.currentUser.uid;
  await ensureCloudUser(name);
  localSave();
  startRealtime();
  init();
}

async function logout() {
  if (USE_FIREBASE && auth && auth.currentUser) await auth.signOut();
  data.user = '';
  data.uid = '';
  stopRealtime();
  localSave();
  init();
}

async function setUser() {
  const name = $('userName')?.value.trim() || '';
  if (!name) return alert('이름을 입력하세요.');
  data.user = name;
  localSave();
  if (USE_FIREBASE && auth && auth.currentUser) await ensureCloudUser(name);
  if ($('who')) $('who').innerText = data.user + (USE_FIREBASE ? ' / 실시간 동기화' : ' / Firebase 설정 필요');
  alert('사용자 이름을 저장했습니다.');
}

function watchAuthState() {
  if (!USE_FIREBASE || !auth) {
    init();
    return;
  }

  auth.onAuthStateChanged(async user => {
    if (user) {
      data.uid = user.uid;
      if (!data.user) data.user = user.email || '사용자';
      localSave();
      await ensureCloudUser(data.user);
      startRealtime();
    } else {
      stopRealtime();
    }
    init();
  });
}
