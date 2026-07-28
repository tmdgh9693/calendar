'use strict';

// 승인 사용자와 역할별 접근 권한을 관리합니다.
window.REQUIRE_FIREBASE_APPROVAL = true;
window.SECURE_CLOUD_ONLY = true;

const ACCESS_ROLE_LABELS = Object.freeze({
  admin: '관리자',
  member: '일반 사용자',
  viewer: '조회 전용'
});

const ACCESS_STATUS_LABELS = Object.freeze({
  active: '사용 중',
  pending: '승인 대기',
  suspended: '이용 정지'
});

let currentAccessProfile = null;
let cloudAccessUsers = [];
let renderedAdminUsers = [];
let unsubAccessUsers = null;
let unsubOwnAccess = null;
let lastAccessMessage = '';

const SITE_ACCESS_LOCAL_KEY = 'atonCalendarSiteAccessApproval';
const SITE_ACCESS_SESSION_KEY = 'atonCalendarSiteAccessSession';
let siteAccessConfig = null;
let siteAccessUnlocked = false;
let siteAccessInitialized = false;
let siteAccessFailedAttempts = 0;
let siteAccessLockedUntil = 0;

function normalizeAccessRole(role) {
  return ['admin', 'member', 'viewer'].includes(String(role || ''))
    ? String(role)
    : 'viewer';
}

function normalizeAccessStatus(status) {
  return ['active', 'pending', 'suspended'].includes(String(status || ''))
    ? String(status)
    : 'pending';
}

function accessRole() {
  return normalizeAccessRole(currentAccessProfile?.role);
}

function accessRoleLabel() {
  return ACCESS_ROLE_LABELS[accessRole()] || '조회 전용';
}

function hasApprovedAccess() {
  return !!(
    currentAccessProfile &&
    currentAccessProfile.approved === true &&
    normalizeAccessStatus(currentAccessProfile.status) === 'active'
  );
}

function isAdminUser() {
  return hasApprovedAccess() && accessRole() === 'admin';
}

function isViewerUser() {
  return hasApprovedAccess() && accessRole() === 'viewer';
}

function canUseProtectedFeatures() {
  return hasApprovedAccess() && !isViewerUser();
}

function canWriteData() {
  return hasApprovedAccess() && accessRole() !== 'viewer';
}

function requireWriteAccess(action = '자료 변경') {
  if (!hasApprovedAccess()) {
    alert(`${action} 권한이 없습니다. 관리자 승인을 확인해 주세요.`);
    return false;
  }

  if (!canWriteData()) {
    alert(`현재 계정은 조회 전용입니다. ${action}은 관리자 또는 일반 사용자만 가능합니다.`);
    return false;
  }

  return true;
}

function requireAdminAccess(action = '관리 기능 사용') {
  if (!hasApprovedAccess()) {
    alert(`${action} 권한이 없습니다. 관리자 승인을 확인해 주세요.`);
    return false;
  }

  if (!isAdminUser()) {
    alert(`${action}은 관리자만 가능합니다.`);
    return false;
  }

  return true;
}

function setLoginStatus(message = '', tone = '') {
  lastAccessMessage = String(message || '');
  const element = document.getElementById('loginStatus');
  if (!element) return;
  element.textContent = lastAccessMessage;
  element.dataset.tone = tone || '';
  element.classList.toggle('hidden', !lastAccessMessage);
}

function syncRuntimeIdentityFromAccessProfile(profile = currentAccessProfile, user = auth?.currentUser) {
  if (!profile || !user) return;

  const profileName = String(profile.name || user.displayName || '').trim();
  const profileRank = String(profile.rank || '').trim();
  const profileColor = String(profile.color || '#2563eb').trim() || '#2563eb';

  data.uid = user.uid;
  if (profileName && !isEmailLike(profileName)) data.user = profileName;

  data.userRanks = data.userRanks || {};
  data.userColors = data.userColors || {};
  data.userRanks[user.uid] = profileRank;
  data.userColors[user.uid] = profileColor;
  if (data.user) {
    data.userRanks[data.user] = profileRank;
    data.userColors[data.user] = profileColor;
  }
}

function setCurrentAccessProfile(profile) {
  currentAccessProfile = profile
    ? {
        ...profile,
        role: normalizeAccessRole(profile.role),
        status: normalizeAccessStatus(profile.status)
      }
    : null;

  if (currentAccessProfile) syncRuntimeIdentityFromAccessProfile(currentAccessProfile);
  document.body.dataset.accessRole = currentAccessProfile ? accessRole() : '';
  updateAccessUi();
}

function clearSensitiveSessionData(options = {}) {
  const clearIdentity = options.clearIdentity !== false;

  data.events = [];
  data.docs = [];
  data.users = [];
  data.deletedEventIds = [];
  data.deletedDocIds = [];
  photos = [];

  if (clearIdentity) {
    data.user = '';
    data.uid = '';
  }

  try {
    localSave();
  } catch (error) {
    console.warn('민감한 로컬 자료 정리 실패:', error);
  }
}

function accessDenialMessage(profile) {
  if (!profile) {
    return '등록된 승인 정보가 없습니다. 관리자에게 계정 승인을 요청하세요.';
  }
  if (normalizeAccessStatus(profile.status) === 'suspended') {
    return '이 계정은 이용 정지 상태입니다. 관리자에게 문의하세요.';
  }
  if (profile.approved !== true || normalizeAccessStatus(profile.status) === 'pending') {
    return '로그인은 확인됐지만 아직 관리자 승인 전입니다. 승인 후 다시 확인해 주세요.';
  }
  return '이 계정은 프로그램 접근 권한이 없습니다.';
}

function pendingProfilePayload(user, requested = {}) {
  const now = new Date().toISOString();
  return {
    uid: user.uid,
    email: String(user.email || '').trim(),
    name: String(requested.name || user.displayName || '').trim(),
    rank: String(requested.rank || '').trim(),
    color: String(requested.color || '#2563eb').trim() || '#2563eb',
    approved: false,
    role: 'viewer',
    status: 'pending',
    createdAt: now,
    updatedAt: now
  };
}

async function ensureAccessRequest(user, requested = {}) {
  if (!USE_FIREBASE || !db || !user) return null;

  const ref = db.collection('users').doc(user.uid);
  const snapshot = await ref.get();
  if (snapshot.exists) return { id: snapshot.id, ...snapshot.data() };

  const payload = pendingProfilePayload(user, requested);
  await ref.set(payload);
  return payload;
}

async function readCurrentAccessProfile(user = auth?.currentUser) {
  if (!USE_FIREBASE || !db || !user) return null;
  const snapshot = await db.collection('users').doc(user.uid).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function updateAccessUi() {
  const allowed = hasApprovedAccess();
  document.body.classList.toggle('access-locked', !allowed);
  document.body.classList.toggle('role-viewer', allowed && accessRole() === 'viewer');
  document.body.classList.toggle('role-admin', allowed && accessRole() === 'admin');

  const roleBadge = document.getElementById('accessRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = '';
    roleBadge.classList.add('hidden');
  }

  const adminCard = document.getElementById('adminUserManagementCard');
  if (adminCard) adminCard.classList.toggle('hidden', !isAdminUser());
  if (!isAdminUser()) closeAdminSecurityModal();
  updateAdminSecuritySummary();

  const writeOnlyIds = [
    'photoVaultUpload',
    'photoVaultDeleteSelectedBtn',
    'saveTripEditBtn',
    'hwpxTemplateFile'
  ];
  writeOnlyIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.disabled = allowed && !canWriteData();
  });

  document.querySelectorAll('[data-requires-admin="true"]').forEach(element => {
    element.classList.toggle('hidden', !isAdminUser());
  });

  updateViewerModeUi();
}

function viewerNoticeText(sectionId) {
  if (sectionId === 'personal' || sectionId === 'dept') {
    return '조회 전용 계정입니다. 일정 내용은 표시되지 않으며 캘린더 조회·등록·수정 기능을 사용할 수 없습니다.';
  }
  return '조회 전용 계정에서는 이 메뉴의 기능과 자료를 사용할 수 없습니다. 상단 또는 하단 탭 이동과 로그아웃만 가능합니다.';
}

function updateViewerModeUi() {
  const viewer = isViewerUser();

  document.querySelectorAll('main > section.tab').forEach(section => {
    let notice = Array.from(section.children)
      .find(child => child.classList?.contains('viewer-access-notice'));

    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'card notice viewer-access-notice hidden';
      notice.setAttribute('role', 'status');
      section.prepend(notice);
    }

    notice.textContent = viewerNoticeText(section.id);
    notice.classList.toggle('hidden', !viewer);

    Array.from(section.children).forEach(child => {
      if (child === notice) return;
      const keepBlankCalendar = ['personal', 'dept'].includes(section.id) && !!child.querySelector?.('.cal');
      child.classList.toggle('viewer-section-hidden', viewer && !keepBlankCalendar);
    });
  });

  document.querySelectorAll('main button, main input, main select, main textarea').forEach(element => {
    if (viewer) {
      if (!element.disabled) {
        element.disabled = true;
        element.dataset.viewerDisabled = 'true';
      }
      element.setAttribute('aria-disabled', 'true');
    } else if (element.dataset.viewerDisabled === 'true') {
      element.disabled = false;
      delete element.dataset.viewerDisabled;
      element.removeAttribute('aria-disabled');
    }
  });

  if (viewer) {
    document.getElementById('dayEventsOverlay')?.remove();
    document.getElementById('modal')?.classList.add('hidden');
    document.getElementById('deptMeetingResultPanel')?.classList.add('hidden');
  }
}

function blockViewerMainInteraction(event) {
  if (!isViewerUser()) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('main')) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

['click', 'dblclick', 'input', 'change', 'submit', 'keydown'].forEach(type => {
  document.addEventListener(type, blockViewerMainInteraction, true);
});


function stopOwnAccessWatch() {
  if (unsubOwnAccess) unsubOwnAccess();
  unsubOwnAccess = null;
}

function startOwnAccessWatch() {
  stopOwnAccessWatch();
  if (!USE_FIREBASE || !db || !auth?.currentUser) return;

  const uid = auth.currentUser.uid;
  unsubOwnAccess = db.collection('users').doc(uid).onSnapshot(snapshot => {
    const profile = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    const allowed = !!(
      profile &&
      profile.approved === true &&
      normalizeAccessStatus(profile.status) === 'active'
    );

    if (!allowed) {
      setCurrentAccessProfile(profile);
      stopRealtime();
      clearSensitiveSessionData();
      setLoginStatus(accessDenialMessage(profile), 'warning');
      init();
      return;
    }

    const previousRole = accessRole();
    setCurrentAccessProfile(profile);
    if (previousRole !== accessRole()) {
      if (isViewerUser()) {
        stopRealtime();
        clearSensitiveSessionData({ clearIdentity: false });
        init();
      } else {
        if (typeof startRealtime === 'function') startRealtime();
        if (typeof render === 'function') render();
      }
    }
  }, error => {
    console.error('현재 사용자 권한 감시 실패:', error);
  });
}

function stopAdminAccessWatch() {
  if (unsubAccessUsers) unsubAccessUsers();
  unsubAccessUsers = null;
  cloudAccessUsers = [];
  renderedAdminUsers = [];
  renderAdminUserManagement();
}

function startAdminAccessWatch() {
  stopAdminAccessWatch();
  if (!USE_FIREBASE || !db || !isAdminUser()) return;

  unsubAccessUsers = db.collection('users').onSnapshot(snapshot => {
    cloudAccessUsers = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.name || a.rank || '').localeCompare(String(b.name || b.rank || ''), 'ko'));
    renderAdminUserManagement();
  }, error => {
    console.error('사용자 권한 목록 불러오기 실패:', error);
    const status = document.getElementById('adminUserStatus');
    if (status) status.textContent = '사용자 목록을 불러오지 못했습니다. 관리자 설정과 네트워크 연결을 확인하세요.';
  });
}

function accessUserRow(user, rowIndex) {
  const uid = String(user.uid || user.id || '');
  const isSelf = uid === auth?.currentUser?.uid;
  const approved = user.approved === true;
  const role = normalizeAccessRole(user.role);
  const status = normalizeAccessStatus(user.status);
  const rankText = String(user.rank || '').trim() || '직급 미등록';

  return `
    <div class="access-user-row" data-access-index="${rowIndex}">
      <div class="access-user-summary">
        <strong>${esc(user.name || '이름 미등록')}</strong>
        <small>${esc(rankText)}${isSelf ? ' · 현재 관리자' : ''}</small>
      </div>
      <label>
        <span>승인</span>
        <select class="access-approved" ${isSelf ? 'disabled' : ''}>
          <option value="true" ${approved ? 'selected' : ''}>승인</option>
          <option value="false" ${!approved ? 'selected' : ''}>미승인</option>
        </select>
      </label>
      <label>
        <span>권한</span>
        <select class="access-role" ${isSelf ? 'disabled' : ''}>
          <option value="admin" ${role === 'admin' ? 'selected' : ''}>관리자</option>
          <option value="member" ${role === 'member' ? 'selected' : ''}>일반 사용자</option>
          <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>조회 전용</option>
        </select>
      </label>
      <label>
        <span>상태</span>
        <select class="access-status" ${isSelf ? 'disabled' : ''}>
          <option value="active" ${status === 'active' ? 'selected' : ''}>사용 중</option>
          <option value="pending" ${status === 'pending' ? 'selected' : ''}>승인 대기</option>
          <option value="suspended" ${status === 'suspended' ? 'selected' : ''}>이용 정지</option>
        </select>
      </label>
      <button class="p access-save-button" type="button" onclick="saveManagedUserAccess(${rowIndex})" ${isSelf ? 'disabled' : ''}>권한 저장</button>
    </div>
  `;
}

function renderAdminUserManagement() {
  const list = document.getElementById('adminUserList');
  if (!list) return;

  if (!isAdminUser()) {
    renderedAdminUsers = [];
    list.innerHTML = '';
    return;
  }

  const filter = String(document.getElementById('adminUserFilter')?.value || 'all');
  renderedAdminUsers = cloudAccessUsers.filter(user => {
    const status = normalizeAccessStatus(user.status);
    if (filter === 'pending' && status !== 'pending') return false;
    if (filter === 'active' && status !== 'active') return false;
    if (filter === 'suspended' && status !== 'suspended') return false;
    if (filter === 'unapproved' && user.approved === true) return false;
    return true;
  });

  const count = document.getElementById('adminUserCount');
  if (count) count.textContent = `표시 ${renderedAdminUsers.length}명 · 전체 ${cloudAccessUsers.length}명`;

  list.innerHTML = renderedAdminUsers.length
    ? renderedAdminUsers.map((user, index) => accessUserRow(user, index)).join('')
    : '<p class="small empty-state">조건에 맞는 사용자가 없습니다.</p>';
  updateAdminSecuritySummary();
}

async function saveManagedUserAccess(rowIndex) {
  if (!isAdminUser()) {
    alert('관리자만 사용자 권한을 변경할 수 있습니다.');
    return;
  }

  const index = Number(rowIndex);
  const user = Number.isInteger(index) ? renderedAdminUsers[index] : null;
  const uid = String(user?.uid || user?.id || '');
  if (!uid || uid === auth?.currentUser?.uid) {
    alert('현재 로그인한 관리자 자신의 보안 권한은 이 화면에서 변경할 수 없습니다.');
    return;
  }

  const row = document.querySelector(`[data-access-index="${index}"]`);
  if (!row) return;

  const approved = row.querySelector('.access-approved')?.value === 'true';
  const role = normalizeAccessRole(row.querySelector('.access-role')?.value);
  const status = normalizeAccessStatus(row.querySelector('.access-status')?.value);
  const now = new Date().toISOString();

  try {
    const batch = db.batch();
    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
      uid,
      approved,
      role,
      status,
      approvedAt: approved && status === 'active' ? now : null,
      approvedByUid: auth.currentUser.uid,
      updatedAt: now
    }, { merge: true });

    const profileRef = db.collection('profiles').doc(uid);
    if (approved && status === 'active') {
      batch.set(profileRef, {
        uid,
        name: String(user?.name || '').trim(),
        rank: String(user?.rank || '').trim(),
        color: String(user?.color || '#2563eb').trim() || '#2563eb',
        updatedAt: now
      }, { merge: true });
    } else {
      batch.delete(profileRef);
    }

    await batch.commit();
    const statusElement = document.getElementById('adminUserStatus');
    if (statusElement) statusElement.textContent = '사용자 권한을 저장했습니다.';
  } catch (error) {
    console.error('사용자 권한 저장 실패:', error);
    alert('사용자 권한을 저장하지 못했습니다. 관리자 설정과 네트워크 연결을 확인하세요.\n' + (error.message || error));
  }
}

async function recheckApproval() {
  if (!auth?.currentUser) {
    setLoginStatus('이메일과 비밀번호로 로그인해 주세요.');
    return false;
  }

  try {
    const profile = await readCurrentAccessProfile(auth.currentUser);
    if (!profile || profile.approved !== true || normalizeAccessStatus(profile.status) !== 'active') {
      setCurrentAccessProfile(profile);
      setLoginStatus(accessDenialMessage(profile), 'warning');
      return false;
    }

    setCurrentAccessProfile(profile);
    setLoginStatus('승인이 확인되었습니다. 프로그램을 불러오는 중입니다.', 'success');
    return true;
  } catch (error) {
    console.error('승인 상태 재확인 실패:', error);
    setLoginStatus('승인 상태를 확인하지 못했습니다. 네트워크 연결과 관리자 설정을 확인하세요.', 'error');
    return false;
  }
}


function updateAdminSecuritySummary() {
  const summary = document.getElementById('adminSecuritySummary');
  if (!summary || !isAdminUser()) return;
  const pending = cloudAccessUsers.filter(user => user.approved !== true || normalizeAccessStatus(user.status) === 'pending').length;
  const active = cloudAccessUsers.filter(user => user.approved === true && normalizeAccessStatus(user.status) === 'active').length;
  summary.textContent = `승인 대기 ${pending}명 · 사용 중 ${active}명 · 접속 코드 ${siteAccessConfig?.enabled === true ? '사용 중' : '사용 안 함'}`;
}

function openAdminSecurityModal() {
  if (!requireAdminAccess('사용자·접속 코드 관리')) return;
  const modal = document.getElementById('adminSecurityModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  renderAdminUserManagement();
  updateAdminSiteCodeStatus();
  setTimeout(() => document.getElementById('adminUserFilter')?.focus(), 50);
}

function closeAdminSecurityModal() {
  const modal = document.getElementById('adminSecurityModal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function setSiteAccessStatus(message = '', tone = '') {
  const element = document.getElementById('siteAccessStatus');
  if (!element) return;
  element.textContent = String(message || '');
  element.dataset.tone = tone || '';
  element.classList.toggle('hidden', !message);
}

function normalizedSiteAccessConfig(raw = {}) {
  return {
    enabled: raw.enabled === true && /^[a-f0-9]{64}$/i.test(String(raw.codeHash || '')),
    version: String(raw.version || raw.updatedAt || '1'),
    codeHash: String(raw.codeHash || '').toLowerCase(),
    source: String(raw.source || '')
  };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function siteAccessMarker(config = siteAccessConfig) {
  if (!config?.enabled) return '';
  return `${config.version}:${config.codeHash.slice(0, 16)}`;
}

function hasRememberedSiteAccess(config = siteAccessConfig) {
  const marker = siteAccessMarker(config);
  if (!marker) return true;
  try {
    return localStorage.getItem(SITE_ACCESS_LOCAL_KEY) === marker ||
      sessionStorage.getItem(SITE_ACCESS_SESSION_KEY) === marker;
  } catch (_) {
    return false;
  }
}

function rememberSiteAccess(config = siteAccessConfig) {
  const marker = siteAccessMarker(config);
  if (!marker) return;
  const remember = document.getElementById('siteAccessRemember')?.checked !== false;
  try {
    if (remember) {
      localStorage.setItem(SITE_ACCESS_LOCAL_KEY, marker);
      sessionStorage.removeItem(SITE_ACCESS_SESSION_KEY);
    } else {
      sessionStorage.setItem(SITE_ACCESS_SESSION_KEY, marker);
      localStorage.removeItem(SITE_ACCESS_LOCAL_KEY);
    }
  } catch (error) {
    console.warn('접속 코드 확인 상태 저장 실패:', error);
  }
}

function clearRememberedSiteAccess() {
  try {
    localStorage.removeItem(SITE_ACCESS_LOCAL_KEY);
    sessionStorage.removeItem(SITE_ACCESS_SESSION_KEY);
  } catch (_) {}
}

async function fetchSiteAccessConfig() {
  const bootstrap = normalizedSiteAccessConfig({ ...(window.siteAccessBootstrap || {}), source: 'bootstrap' });
  await initializeFirebase();
  if (!USE_FIREBASE || !db) return bootstrap;

  try {
    const snapshot = await db.collection('settings').doc('siteAccess').get();
    if (!snapshot.exists) return bootstrap;
    return normalizedSiteAccessConfig({ ...snapshot.data(), source: 'firestore' });
  } catch (error) {
    console.warn('접속 코드 설정을 읽지 못해 기본 설정을 사용합니다:', error);
    return bootstrap;
  }
}

function showSiteAccessGate() {
  document.body.classList.remove('site-code-checking');
  document.body.classList.add('site-code-locked');
  document.getElementById('siteCodeGate')?.classList.remove('hidden');
  document.getElementById('login')?.classList.add('hidden');
  setTimeout(() => document.getElementById('siteAccessCodeInput')?.focus(), 60);
}

function unlockSiteAccessGate() {
  siteAccessUnlocked = true;
  document.body.classList.remove('site-code-checking', 'site-code-locked');
  document.getElementById('siteCodeGate')?.classList.add('hidden');
  setSiteAccessStatus('', '');
}

async function initializeSiteAccessGate(options = {}) {
  if (siteAccessInitialized && !options.force) return siteAccessUnlocked;
  siteAccessInitialized = true;
  siteAccessUnlocked = false;
  document.body.classList.add('site-code-checking');
  setSiteAccessStatus('접속 코드 설정을 확인하는 중입니다.', '');

  siteAccessConfig = await fetchSiteAccessConfig();
  updateAdminSecuritySummary();

  if (!siteAccessConfig.enabled || hasRememberedSiteAccess(siteAccessConfig)) {
    unlockSiteAccessGate();
    return true;
  }

  showSiteAccessGate();
  setSiteAccessStatus('접속 코드를 입력해 주세요.', '');
  return false;
}

async function verifySiteAccessCode() {
  const now = Date.now();
  if (siteAccessLockedUntil > now) {
    const seconds = Math.ceil((siteAccessLockedUntil - now) / 1000);
    setSiteAccessStatus(`입력 오류가 반복되어 ${seconds}초 동안 확인할 수 없습니다.`, 'warning');
    return;
  }

  const input = document.getElementById('siteAccessCodeInput');
  const button = document.getElementById('siteAccessConfirmBtn');
  const code = String(input?.value || '').trim();
  if (!code) {
    setSiteAccessStatus('접속 코드를 입력하세요.', 'warning');
    input?.focus();
    return;
  }

  if (button) button.disabled = true;
  try {
    const hash = await sha256Hex(code);
    if (!siteAccessConfig?.enabled || hash !== siteAccessConfig.codeHash) {
      siteAccessFailedAttempts += 1;
      if (siteAccessFailedAttempts >= 5) {
        siteAccessLockedUntil = Date.now() + 30000;
        siteAccessFailedAttempts = 0;
        setSiteAccessStatus('접속 코드가 올바르지 않습니다. 30초 후 다시 시도하세요.', 'error');
      } else {
        setSiteAccessStatus(`접속 코드가 올바르지 않습니다. (${siteAccessFailedAttempts}/5)`, 'error');
      }
      if (input) {
        input.value = '';
        input.focus();
      }
      return;
    }

    siteAccessFailedAttempts = 0;
    rememberSiteAccess(siteAccessConfig);
    unlockSiteAccessGate();
    if (typeof init === 'function') init();
    if (typeof watchAuthState === 'function') await watchAuthState();
  } catch (error) {
    console.error('접속 코드 확인 실패:', error);
    setSiteAccessStatus('접속 코드를 확인하지 못했습니다. 브라우저 보안 기능을 확인하세요.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function reloadSiteAccessConfig() {
  siteAccessInitialized = false;
  await initializeSiteAccessGate({ force: true });
}

function lockSiteAccessAndReload() {
  clearRememberedSiteAccess();
  location.reload();
}

function updateAdminSiteCodeStatus(message = '') {
  const element = document.getElementById('adminSiteCodeStatus');
  if (!element) return;
  if (message) {
    element.textContent = message;
    return;
  }
  const source = siteAccessConfig?.source === 'firestore' ? '관리자 설정' : '기본 설정';
  element.textContent = siteAccessConfig?.enabled
    ? `현재 접속 코드 사용 중 · ${source} · 버전 ${siteAccessConfig.version}`
    : '현재 사이트 접속 코드를 사용하지 않습니다.';
}

async function saveSiteAccessCode() {
  if (!requireAdminAccess('사이트 접속 코드 변경')) return;
  const code = String(document.getElementById('adminSiteCode')?.value || '').trim();
  const confirmCode = String(document.getElementById('adminSiteCodeConfirm')?.value || '').trim();
  if (code.length < 8) {
    alert('접속 코드는 8자 이상으로 입력하세요. 영문, 숫자, 특수문자를 함께 사용하는 것을 권장합니다.');
    return;
  }
  if (code !== confirmCode) {
    alert('접속 코드 확인 값이 일치하지 않습니다.');
    return;
  }

  try {
    const codeHash = await sha256Hex(code);
    const now = new Date().toISOString();
    const version = `${Date.now()}`;
    await db.collection('settings').doc('siteAccess').set({
      enabled: true,
      codeHash,
      version,
      updatedAt: now,
      updatedByUid: auth.currentUser.uid
    }, { merge: true });
    siteAccessConfig = normalizedSiteAccessConfig({ enabled: true, codeHash, version, source: 'firestore' });
    rememberSiteAccess(siteAccessConfig);
    document.getElementById('adminSiteCode').value = '';
    document.getElementById('adminSiteCodeConfirm').value = '';
    updateAdminSiteCodeStatus('접속 코드를 변경했습니다. 다른 브라우저는 다음 접속 시 새 코드를 입력해야 합니다.');
    updateAdminSecuritySummary();
  } catch (error) {
    console.error('접속 코드 저장 실패:', error);
    alert('접속 코드를 저장하지 못했습니다. 관리자 설정과 네트워크 연결을 확인하세요.\n' + (error.message || error));
  }
}

async function disableSiteAccessCode() {
  if (!requireAdminAccess('사이트 접속 코드 해제')) return;
  if (!confirm('사이트 접속 코드 확인을 사용하지 않도록 변경할까요? 사용자 로그인과 승인 기능은 계속 유지됩니다.')) return;
  try {
    const now = new Date().toISOString();
    const version = `${Date.now()}`;
    await db.collection('settings').doc('siteAccess').set({
      enabled: false,
      codeHash: '',
      version,
      updatedAt: now,
      updatedByUid: auth.currentUser.uid
    }, { merge: true });
    siteAccessConfig = normalizedSiteAccessConfig({ enabled: false, codeHash: '', version, source: 'firestore' });
    clearRememberedSiteAccess();
    updateAdminSiteCodeStatus('사이트 접속 코드 사용을 해제했습니다.');
    updateAdminSecuritySummary();
  } catch (error) {
    console.error('접속 코드 해제 실패:', error);
    alert('접속 코드 설정을 변경하지 못했습니다.\n' + (error.message || error));
  }
}

document.addEventListener('sectionsloaded', updateAccessUi);
document.addEventListener('DOMContentLoaded', updateAccessUi);
