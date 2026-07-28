let pendingLoginName = '';
let pendingLoginColor = '';
let pendingLoginRank = '';
let authStateStarted = false;
let authProcessingToken = 0;
let signupInProgress = false;

function isEmailLike(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || '').trim());
}

function requestedLoginProfile() {
  return {
    name: String(pendingLoginName || $('loginName')?.value || '').trim(),
    color: String(pendingLoginColor || $('loginColor')?.value || '#2563eb').trim() || '#2563eb',
    rank: String(pendingLoginRank || $('loginRank')?.value || '').trim()
  };
}


function setSignupStatus(message = '', tone = '') {
  const element = document.getElementById('signupStatus');
  if (!element) return;
  element.textContent = String(message || '');
  element.dataset.tone = tone || '';
  element.classList.toggle('hidden', !message);
}

function openSignup() {
  const modal = document.getElementById('signupModal');
  if (!modal) return;

  const loginName = document.getElementById('loginName')?.value || '';
  const loginRank = document.getElementById('loginRank')?.value || '';
  const loginEmail = document.getElementById('loginEmail')?.value || '';
  const loginColor = document.getElementById('loginColor')?.value || '#2563eb';

  if (document.getElementById('signupName')) document.getElementById('signupName').value = loginName;
  if (document.getElementById('signupRank')) document.getElementById('signupRank').value = loginRank;
  if (document.getElementById('signupEmail')) document.getElementById('signupEmail').value = loginEmail;
  if (document.getElementById('signupColor')) document.getElementById('signupColor').value = loginColor;
  if (document.getElementById('signupPassword')) document.getElementById('signupPassword').value = '';
  if (document.getElementById('signupPasswordConfirm')) document.getElementById('signupPasswordConfirm').value = '';

  setSignupStatus('', '');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('signupName')?.focus(), 60);
}

function closeSignup() {
  const modal = document.getElementById('signupModal');
  if (modal) modal.classList.add('hidden');

  const anotherModalOpen = ['modal', 'adminSecurityModal', 'decisionModal']
    .some(id => {
      const element = document.getElementById(id);
      return element && !element.classList.contains('hidden');
    });
  if (!anotherModalOpen) document.body.classList.remove('modal-open');
}

async function signup() {
  await initializeFirebase();

  if (!USE_FIREBASE || !auth) {
    setSignupStatus('회원가입 서비스에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', 'error');
    return;
  }

  if (signupInProgress) return;

  const name = String(document.getElementById('signupName')?.value || '').trim();
  const rank = String(document.getElementById('signupRank')?.value || '').trim();
  const email = String(document.getElementById('signupEmail')?.value || '').trim();
  const password = String(document.getElementById('signupPassword')?.value || '');
  const confirmPassword = String(document.getElementById('signupPasswordConfirm')?.value || '');
  const color = String(document.getElementById('signupColor')?.value || '#2563eb').trim() || '#2563eb';

  if (!name || isEmailLike(name)) {
    setSignupStatus('이름을 정확히 입력해 주세요.', 'warning');
    document.getElementById('signupName')?.focus();
    return;
  }
  if (!email || !isEmailLike(email)) {
    setSignupStatus('사용할 이메일 주소를 정확히 입력해 주세요.', 'warning');
    document.getElementById('signupEmail')?.focus();
    return;
  }
  if (password.length < 6) {
    setSignupStatus('비밀번호는 6자 이상으로 입력해 주세요.', 'warning');
    document.getElementById('signupPassword')?.focus();
    return;
  }
  if (password !== confirmPassword) {
    setSignupStatus('비밀번호 확인 값이 일치하지 않습니다.', 'warning');
    document.getElementById('signupPasswordConfirm')?.focus();
    return;
  }

  const button = document.getElementById('signupBtn');
  signupInProgress = true;
  if (button) button.disabled = true;
  setSignupStatus('가입 신청을 처리하는 중입니다.', '');

  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const user = credential.user;

    if (user && user.displayName !== name) {
      await user.updateProfile({ displayName: name });
    }

    await ensureAccessRequest(user, { name, rank, color });

    if (document.getElementById('loginName')) document.getElementById('loginName').value = name;
    if (document.getElementById('loginRank')) document.getElementById('loginRank').value = rank;
    if (document.getElementById('loginEmail')) document.getElementById('loginEmail').value = email;
    if (document.getElementById('loginColor')) document.getElementById('loginColor').value = color;
    if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';

    setLoginStatus('회원가입이 완료되었습니다. 관리자 승인 후 로그인해 주세요.', 'success');
    closeSignup();
    await auth.signOut();
    init();
  } catch (error) {
    console.error('회원가입 오류:', error);
    const messages = {
      'auth/email-already-in-use': '이미 사용 중인 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.',
      'auth/invalid-email': '이메일 주소 형식이 올바르지 않습니다.',
      'auth/weak-password': '비밀번호는 최소 6자 이상으로 입력해 주세요.',
      'auth/operation-not-allowed': '현재 회원가입이 허용되지 않습니다. 관리자에게 문의해 주세요.',
      'auth/admin-restricted-operation': '현재 회원가입이 제한되어 있습니다. 관리자에게 문의해 주세요.',
      'auth/network-request-failed': '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
      'auth/too-many-requests': '요청이 너무 많아 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.'
    };
    setSignupStatus(messages[error.code] || `회원가입을 완료하지 못했습니다: ${error.message}`, 'error');
  } finally {
    signupInProgress = false;
    if (button) button.disabled = false;
  }
}

async function readSavedNickname(user) {
  if (!USE_FIREBASE || !db || !user) return '';

  try {
    const [profileSnapshot, accessSnapshot] = await Promise.all([
      db.collection('profiles').doc(user.uid).get(),
      db.collection('users').doc(user.uid).get()
    ]);
    const savedName = String(
      profileSnapshot.data()?.name || accessSnapshot.data()?.name || ''
    ).trim();
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
    console.warn('표시 이름 저장 실패:', error);
  }
}

async function applyNickname(user, preferredName = '', preferredColor = '', preferredRank = '') {
  if (typeof hasApprovedAccess === 'function' && !hasApprovedAccess()) {
    throw new Error('관리자 승인이 확인되지 않았습니다.');
  }

  const requestedName = String(preferredName || '').trim();
  const accessName = String(currentAccessProfile?.name || '').trim();
  const savedName = await readSavedNickname(user);
  const profileName = String(user?.displayName || '').trim();

  let nickname = requestedName || accessName || savedName ||
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

  const requestedColor = String(preferredColor || pendingLoginColor || currentAccessProfile?.color || '').trim();
  const requestedRank = String(preferredRank || pendingLoginRank || currentAccessProfile?.rank || '').trim();
  data.userRanks = data.userRanks || {};
  data.userColors = data.userColors || {};

  if (requestedRank) {
    data.userRanks[user.uid] = requestedRank;
    data.userRanks[nickname] = requestedRank;
  }
  if (requestedColor) {
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

async function completeApprovedLogin(user, profile, preferred = {}) {
  setCurrentAccessProfile(profile);
  const viewerAccount = typeof isViewerUser === 'function' && isViewerUser();

  if (viewerAccount) {
    if (typeof syncRuntimeIdentityFromAccessProfile === 'function') {
      syncRuntimeIdentityFromAccessProfile(profile, user);
    }
    pendingLoginName = '';
    pendingLoginColor = '';
    pendingLoginRank = '';
    localSave();
  } else {
    await applyNickname(user, preferred.name, preferred.color, preferred.rank);
  }

  if (typeof syncRuntimeIdentityFromAccessProfile === 'function') {
    syncRuntimeIdentityFromAccessProfile({
      ...profile,
      name: data.user || profile?.name || user?.displayName || '',
      rank: data.userRanks?.[user.uid] || profile?.rank || '',
      color: data.userColors?.[user.uid] || profile?.color || '#2563eb'
    }, user);
  }
  if (viewerAccount) {
    stopRealtime();
    clearSensitiveSessionData({ clearIdentity: false });
    init();
  } else {
    init();
    startRealtime();
  }
  if (typeof startOwnAccessWatch === 'function') startOwnAccessWatch();
  setLoginStatus('', '');
}

async function processSignedInUser(user, token) {
  const preferred = requestedLoginProfile();
  if ($('loginPassword')) $('loginPassword').value = '';
  let profile = null;

  try {
    profile = await ensureAccessRequest(user, preferred);
  } catch (error) {
    console.error('접근 승인 요청 생성 실패:', error);
    clearSensitiveSessionData();
    setCurrentAccessProfile(null);
    setLoginStatus('승인 정보를 확인하지 못했습니다. 관리자 설정을 확인해 주세요.', 'error');
    init();
    return;
  }

  if (token !== authProcessingToken) return;

  if (!profile || profile.approved !== true || normalizeAccessStatus(profile.status) !== 'active') {
    setCurrentAccessProfile(profile);
    clearSensitiveSessionData();
    setLoginStatus(accessDenialMessage(profile), 'warning');
    init();
    return;
  }

  try {
    await completeApprovedLogin(user, profile, preferred);
  } catch (error) {
    console.error('승인 사용자 초기화 오류:', error);
    clearSensitiveSessionData();
    stopRealtime();
    setLoginStatus(error.message || '사용자 정보를 초기화하지 못했습니다.', 'error');
    init();
  }
}

async function login() {
  await initializeFirebase();

  if (!USE_FIREBASE || !auth) {
    setLoginStatus('로그인 서비스에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', 'error');
    alert('로그인 서비스에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
    return;
  }

  const name = $('loginName')?.value.trim() || '';
  const email = $('loginEmail')?.value.trim() || '';
  const password = $('loginPassword')?.value || '';
  const color = $('loginColor')?.value || '#2563eb';
  const rank = $('loginRank')?.value.trim() || '';

  if (name && isEmailLike(name)) {
    alert('이름 칸에는 이메일 주소가 아닌 표시 이름을 입력하세요.');
    return;
  }

  pendingLoginName = name;
  pendingLoginColor = color;
  pendingLoginRank = rank;

  if (auth.currentUser) {
    const approved = await recheckApproval();
    if (approved) {
      const profile = await readCurrentAccessProfile(auth.currentUser);
      await completeApprovedLogin(auth.currentUser, profile, requestedLoginProfile());
    }
    return;
  }

  if (!email || !password) {
    alert('이메일과 비밀번호를 입력하세요.');
    return;
  }

  setLoginStatus('로그인과 승인 상태를 확인하는 중입니다.', '');

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    console.error('로그인 오류:', error);

    const messages = {
      'auth/user-not-found': '등록되지 않은 계정입니다. 회원가입을 진행하거나 관리자에게 문의하세요.',
      'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않거나 등록되지 않은 계정입니다.',
      'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
      'auth/user-disabled': '사용이 중지된 계정입니다. 관리자에게 문의하세요.',
      'auth/too-many-requests': '로그인 시도가 너무 많아 일시적으로 차단되었습니다. 잠시 후 다시 시도하세요.',
      'auth/configuration-not-found': '로그인 방식이 설정되지 않았습니다. 관리자에게 문의하세요.',
      'auth/unauthorized-domain': '현재 사이트 주소가 로그인 허용 목록에 등록되지 않았습니다.',
      'auth/admin-restricted-operation': '관리자만 계정을 만들 수 있도록 설정된 프로젝트입니다.'
    };
    const message = messages[error.code] || `로그인 오류: ${error.message}`;
    setLoginStatus(message, 'error');
    alert(message);
  }
}


async function logout() {
  if (!confirm('현재 계정에서 로그아웃할까요?')) return;

  try {
    if (typeof stopRealtime === 'function') stopRealtime();
    if (typeof stopOwnAccessWatch === 'function') stopOwnAccessWatch();
    if (typeof stopAdminAccessWatch === 'function') stopAdminAccessWatch();
    setCurrentAccessProfile(null);
    clearSensitiveSessionData();
    if (auth?.currentUser) await auth.signOut();
    setLoginStatus('로그아웃했습니다. 승인된 계정으로 다시 로그인해 주세요.', 'success');
    document.getElementById('userMenu')?.classList.add('hidden');
    init();
  } catch (error) {
    console.error('로그아웃 실패:', error);
    alert('로그아웃하지 못했습니다: ' + (error.message || error));
  }
}

async function saveUserProfile() {
  await initializeFirebase();
  if (!hasApprovedAccess()) {
    alert('관리자 승인 후 사용자 정보를 변경할 수 있습니다.');
    return;
  }

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

    data.uid = auth.currentUser.uid;
    await saveNicknameToProfile(name);
    await ensureCloudUser(name, color, rank);

    currentAccessProfile = {
      ...currentAccessProfile,
      name,
      rank,
      color,
      updatedAt: new Date().toISOString()
    };

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
    clearSensitiveSessionData();
    setCurrentAccessProfile(null);
    setLoginStatus('로그인 서비스에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', 'error');
    init();
    return;
  }

  auth.onAuthStateChanged(async user => {
    const token = ++authProcessingToken;
    stopRealtime();
    if (typeof stopOwnAccessWatch === 'function') stopOwnAccessWatch();

    if (user) {
      if (signupInProgress) return;
      setLoginStatus('로그인과 승인 상태를 확인하는 중입니다.', '');
      await processSignedInUser(user, token);
      return;
    }
    pendingLoginName = '';
    pendingLoginColor = '';
    pendingLoginRank = '';
    setCurrentAccessProfile(null);
    clearSensitiveSessionData();
    if (!lastAccessMessage) setLoginStatus('승인된 계정으로 로그인해 주세요.', '');
    init();
  });
}
