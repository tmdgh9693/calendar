let pendingLoginName = '';
let pendingLoginColor = '';
let pendingLoginRank = '';
let authStateStarted = false;

function isEmailLike(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || '').trim());
}

async function readSavedNickname(user) {
  if (!USE_FIREBASE || !db || !user) return '';

  try {
    const snapshot = await db.collection('users').doc(user.uid).get();
    const savedName = String(snapshot.data()?.name || '').trim();

    return isEmailLike(savedName) ? '' : savedName;
  } catch (error) {
    console.warn('저장된 사용자 이름을 불러오지 못했습니다:', error);
    return '';
  }
}

async function saveNicknameToProfile(name) {
  if (!USE_FIREBASE || !auth?.currentUser || !name) return;

  try {
    if (auth.currentUser.displayName !== name) {
      await auth.currentUser.updateProfile({ displayName: name });
    }
  } catch (error) {
    console.warn('Firebase 표시 이름 저장 실패:', error);
  }
}

async function applyNickname(user, preferredName = '', preferredColor = '', preferredRank = '') {
  const requestedName = String(preferredName || '').trim();
  const savedName = await readSavedNickname(user);
  const localName = String(data.user || '').trim();
  const profileName = String(user?.displayName || '').trim();

  let nickname = requestedName || savedName ||
    (!isEmailLike(localName) ? localName : '') ||
    (!isEmailLike(profileName) ? profileName : '');

  if (!nickname) {
    nickname = String(window.prompt(
      '캘린더에 표시할 이름을 입력하세요. 이메일 주소는 로그인용으로만 사용됩니다.',
      ''
    ) || '').trim();
  }

  if (!nickname || isEmailLike(nickname)) {
    throw new Error('이메일 주소 대신 캘린더에 표시할 이름을 입력하세요.');
  }

  data.uid = user.uid;
  data.user = nickname;

  const requestedColor = String(preferredColor || pendingLoginColor || '').trim();
  const requestedRank = String(preferredRank || pendingLoginRank || '').trim();
  data.userRanks = data.userRanks || {};
  if (requestedRank) { data.userRanks[user.uid] = requestedRank; data.userRanks[nickname] = requestedRank; }
  if (requestedColor) {
    data.userColors = data.userColors || {};
    data.userColors[user.uid] = requestedColor;
    data.userColors[nickname] = requestedColor;
  }

  pendingLoginName = '';
  pendingLoginColor = '';
  pendingLoginRank = '';

  await ensureCloudUser(nickname, requestedColor, requestedRank);
  await saveNicknameToProfile(nickname);

  localSave();
  return nickname;
}

async function login() {
  await initializeFirebase();
  const name = $('loginName')?.value.trim() || '';
  const email = $('loginEmail')?.value.trim() || '';
  const password = $('loginPassword')?.value || '';
  const color = $('loginColor')?.value || '#2563eb';
  const rank = $('loginRank')?.value.trim() || '';

  if (!name) {
    alert('캘린더에 표시할 이름을 입력하세요. 이메일 주소는 로그인용으로만 사용됩니다.');
    return;
  }

  if (isEmailLike(name)) {
    alert('이메일 주소 대신 캘린더에 표시할 이름을 입력하세요.');
    return;
  }

  if (!USE_FIREBASE) {
    data.user = name;
    data.uid = name;
    data.userColors = data.userColors || {};
    data.userColors[name] = color;
    data.userRanks = data.userRanks || {};
    data.userRanks[name] = rank;
    localSave();
    init();
    alert('Firebase 설정 전이라 이 브라우저에서만 임시 로그인됩니다.');
    return;
  }

  pendingLoginName = name;
  pendingLoginColor = color;
  pendingLoginRank = rank;

  if (auth?.currentUser) {
    try {
      await applyNickname(auth.currentUser, name, color, rank);
      startRealtime();
      init();
      alert('사용자 이름을 저장했습니다.');
    } catch (error) {
      console.error('사용자 이름 저장 오류:', error);
      alert(error.message || '사용자 이름 저장에 실패했습니다.');
    }
    return;
  }

  if (!email || !password) {
    alert('이메일과 비밀번호를 입력하세요.');
    return;
  }

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

  try {
    await applyNickname(auth.currentUser, name, color, rank);
    startRealtime();
    init();
  } catch (error) {
    console.error('로그인 후 이름 저장 오류:', error);
    alert(error.message || '로그인 후 사용자 이름을 저장하지 못했습니다.');
  }
}

async function logout() {
  await initializeFirebase();
  pendingLoginName = '';
  pendingLoginColor = '';
  pendingLoginRank = '';

  try {
    if (USE_FIREBASE && auth?.currentUser) {
      await auth.signOut();
    }
  } catch (error) {
    console.error('로그아웃 오류:', error);
    alert('로그아웃에 실패했습니다: ' + error.message);
    return;
  }

  data.user = '';
  data.uid = '';
  stopRealtime();
  localSave();
  init();
}

async function saveUserProfile() {
  await initializeFirebase();
  const name = $('userName')?.value.trim() || '';
  const rank = $('userRank')?.value.trim() || '';
  const color = $('userColor')?.value || '#2563eb';

  if (!name) { alert('이름을 입력하세요.'); return; }
  if (isEmailLike(name)) { alert('이메일 주소 대신 캘린더에 표시할 이름을 입력하세요.'); return; }

  try {
    data.user = name;
    data.userColors = data.userColors || {};
    data.userRanks = data.userRanks || {};
    const userId = ownerKey() || name;
    data.userColors[userId] = color;
    data.userColors[name] = color;
    data.userRanks[userId] = rank;
    data.userRanks[name] = rank;

    if (USE_FIREBASE && auth?.currentUser) {
      data.uid = auth.currentUser.uid;
      await saveNicknameToProfile(name);
      await ensureCloudUser(name, color, rank);
    }

    localSave();
    init();
    render();
    alert('사용자 정보를 저장했습니다.');
  } catch (error) {
    console.error('사용자 정보 저장 오류:', error);
    alert('사용자 정보 저장에 실패했습니다: ' + error.message);
  }
}

async function setUser() { return saveUserProfile(); }

async function watchAuthState() {
  if (authStateStarted) return;
  authStateStarted = true;

  await initializeFirebase();
  if (!USE_FIREBASE || !auth) {
    init();
    return;
  }

  auth.onAuthStateChanged(async user => {
    if (user) {
      try {
        await applyNickname(user, pendingLoginName, pendingLoginColor, pendingLoginRank);
        startRealtime();
      } catch (error) {
        console.error('로그인 사용자 이름 처리 오류:', error);
        data.uid = user.uid;
        data.user = '';
        localSave();
        stopRealtime();
        alert(error.message || '이름을 확인하지 못했습니다. 로그인 화면에서 이름을 입력해 주세요.');
      }
    } else {
      pendingLoginName = '';
      pendingLoginColor = '';
      pendingLoginRank = '';
      data.user = '';
      data.uid = '';
      stopRealtime();
      localSave();
    }

    init();
  });
}
