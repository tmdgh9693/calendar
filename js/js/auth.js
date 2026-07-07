// js/auth.js
// 이메일/비밀번호 로그인, 로그아웃, 사용자 표시 이름 담당

async function login() {
  const name = $('loginName')?.value.trim();
  const email = $('loginEmail')?.value.trim();
  const password = $('loginPassword')?.value || '';

  if (!name) return alert('이름을 입력하세요.');

  if (!USE_FIREBASE) {
    data.user = name;
    data.uid = name;
    data.userColors[data.uid] = getCurrentUserColor();
    localSave();
    init();
    alert('Firebase 설정 전이라 이 브라우저에서만 임시 로그인됩니다.');
    return;
  }

  if (!email || !password) return alert('이메일과 비밀번호를 입력하세요.');

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    // Firebase 최신 버전은 존재하지 않는 계정에도 invalid-credential을 줄 수 있습니다.
    if (['auth/user-not-found', 'auth/invalid-credential'].includes(error.code)) {
      const createNew = confirm('로그인에 실패했습니다. 새 계정으로 회원가입을 진행할까요?\n기존 계정이면 이메일과 비밀번호를 다시 확인하세요.');
      if (!createNew) return;

      try {
        await auth.createUserWithEmailAndPassword(email, password);
      } catch (joinError) {
        const message = joinError.code === 'auth/email-already-in-use'
          ? '이미 가입된 이메일입니다. 비밀번호를 확인하세요.'
          : `회원가입 오류: ${joinError.message}`;
        console.error('Firebase 회원가입 오류:', joinError);
        alert(message);
        return;
      }
    } else if (error.code === 'auth/configuration-not-found') {
      alert('Firebase Authentication에서 이메일/비밀번호 로그인을 사용 설정했는지 확인하세요.');
      return;
    } else if (error.code === 'auth/unauthorized-domain') {
      alert('Firebase Authentication 승인된 도메인에 tmdgh9693.github.io를 추가하세요.');
      return;
    } else {
      console.error('Firebase 로그인 오류:', error);
      alert(`로그인 오류: ${error.message}`);
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
  try {
    if (USE_FIREBASE && auth?.currentUser) await auth.signOut();
  } catch (error) {
    console.error('로그아웃 오류:', error);
    alert(`로그아웃 오류: ${error.message}`);
    return;
  }

  stopRealtime();
  data.user = '';
  data.uid = '';
  localSave();
  init();
}

async function setUser() {
  const name = $('userName')?.value.trim();
  if (!name) return alert('이름을 입력하세요.');

  data.user = name;
  if (!data.users.includes(name)) data.users.push(name);

  if (USE_FIREBASE && auth?.currentUser) {
    await ensureCloudUser(name);
  }

  localSave();
  init();
  alert('현재 계정의 표시 이름을 저장했습니다. 계정 전환은 로그아웃 후 다른 이메일로 로그인하세요.');
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
      startRealtime();
    } else {
      stopRealtime();
      data.uid = '';
      data.user = '';
      localSave();
    }

    init();
  });
}
