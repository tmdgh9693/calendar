// js/firebase.js
// Firebase 초기화와 Firestore 실시간 동기화 담당

let auth = null;
let db = null;
let unsubEvents = null;
let unsubDocs = null;
let unsubTemplates = null;
let unsubUsers = null;
let syncReady = false;

const TEMPLATE_DOC_ID = 'hwpxTemplates';

const USE_FIREBASE = Boolean(
  window.firebase &&
  window.firebaseConfig &&
  window.firebaseConfig.apiKey &&
  !String(window.firebaseConfig.apiKey).includes('여기에')
);

if (USE_FIREBASE) {
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  console.info('Firebase 실시간 동기화 모드로 실행 중입니다.');
} else {
  console.info('Firebase 설정 또는 SDK가 없어 브라우저 임시 저장 모드로 실행 중입니다.');
}

function cleanForFirestore(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? null : item));
}

async function upsert(collectionName, object) {
  if (!USE_FIREBASE || !db || !object?.id) return;
  await db.collection(collectionName).doc(object.id).set(cleanForFirestore(object), { merge: true });
}

async function removeCloud(collectionName, id) {
  if (!USE_FIREBASE || !db || !id) return;
  await db.collection(collectionName).doc(id).delete();
}

async function saveHwpxTemplatesToCloud() {
  if (!USE_FIREBASE || !db || !auth?.currentUser) return;
  // 템플릿 파일 목록만 공용으로 동기화합니다.
  // 현재 선택한 템플릿은 각 사용자 기기에서 따로 유지해야 다른 사람의 선택을 바꾸지 않습니다.
  await db.collection('settings').doc(TEMPLATE_DOC_ID).set({
    templates: cleanForFirestore(data.hwpxTemplates || []),
    updatedAt: new Date().toISOString(),
    updatedByUid: auth.currentUser.uid,
    updatedByName: data.user || ''
  }, { merge: true });
}

async function saveAllToCloud() {
  if (!USE_FIREBASE || !auth?.currentUser) return;

  const myUid = auth.currentUser.uid;
  const writableEvents = (data.events || []).filter(event =>
    event.ownerUid === myUid ||
    event.createdByUid === myUid ||
    event.sourceOwnerUid === myUid
  );
  const writableDocs = (data.docs || []).filter(doc => doc.ownerUid === myUid);

  await Promise.all([
    ...writableEvents.map(event => upsert('events', event)),
    ...writableDocs.map(doc => upsert('docs', doc))
  ]);
}

async function ensureCloudUser(name) {
  if (!USE_FIREBASE || !db || !auth?.currentUser) return;
  const color = getCurrentUserColor();

  await db.collection('users').doc(auth.currentUser.uid).set({
    uid: auth.currentUser.uid,
    name,
    email: auth.currentUser.email || '',
    color,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  data.userColors[auth.currentUser.uid] = color;
}

function logSnapshotError(label, error) {
  console.error(`${label} 실시간 동기화 오류:`, error);
  if (error?.code === 'permission-denied') {
    console.warn('Firestore Rules에서 로그인 사용자 권한을 확인하세요.');
  }
}

function startRealtime() {
  if (!USE_FIREBASE || !db || !auth?.currentUser) return;

  stopRealtime();
  const currentUid = auth.currentUser.uid;
  let personalEvents = [];
  let deptEvents = [];
  let personalDocs = [];
  let deptDocs = [];

  const mergeEvents = () => {
    const merged = new Map();
    [...deptEvents, ...personalEvents].forEach(event => merged.set(event.id, event));
    data.events = [...merged.values()];
    render();
  };

  const mergeDocs = () => {
    const merged = new Map();
    [...deptDocs, ...personalDocs].forEach(doc => merged.set(doc.id, doc));
    data.docs = [...merged.values()].sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
    renderArchive?.();
  };

  const offPersonalEvents = db.collection('events').where('ownerUid', '==', currentUid).onSnapshot(snapshot => {
    personalEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    mergeEvents();
  }, error => logSnapshotError('개인 일정', error));

  const offDeptEvents = db.collection('events').where('scope', '==', '과').onSnapshot(snapshot => {
    deptEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    mergeEvents();
  }, error => logSnapshotError('과 일정', error));

  unsubEvents = () => {
    offPersonalEvents();
    offDeptEvents();
  };

  const offPersonalDocs = db.collection('docs').where('ownerUid', '==', currentUid).onSnapshot(snapshot => {
    personalDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    mergeDocs();
  }, error => logSnapshotError('개인 보관자료', error));

  const offDeptDocs = db.collection('docs').where('scope', '==', '과').onSnapshot(snapshot => {
    deptDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    mergeDocs();
  }, error => logSnapshotError('과 공유 보관자료', error));

  unsubDocs = () => {
    offPersonalDocs();
    offDeptDocs();
  };

  unsubTemplates = db.collection('settings').doc(TEMPLATE_DOC_ID).onSnapshot(snapshot => {
    if (snapshot.exists) {
      const templateData = snapshot.data() || {};
      const currentSelectedId = data.selectedHwpxTemplateId || '';
      data.hwpxTemplates = Array.isArray(templateData.templates) ? templateData.templates : [];

      // 예전 버전에서 전역으로 저장된 selectedTemplateId는 더 이상 적용하지 않습니다.
      // 선택값은 개인별로 로컬에 유지하고, 선택한 파일이 사라졌을 때만 기본 공용 초안으로 되돌립니다.
      const canKeepSelection = /^builtin-hwpx-(meeting|trip)-v1$/.test(currentSelectedId) ||
        data.hwpxTemplates.some(template => template.id === currentSelectedId);
      data.selectedHwpxTemplateId = canKeepSelection
        ? currentSelectedId
        : (data.hwpxTemplates[0]?.id || 'builtin-hwpx-meeting-v1');

      normalizeData();
      localSave();
      renderHwpxTemplateControls?.();
    }
  }, error => logSnapshotError('HWPX 템플릿', error));

  unsubUsers = db.collection('users').onSnapshot(snapshot => {
    data.users = [];
    data.userColors = {};

    snapshot.docs.forEach(doc => {
      const user = doc.data() || {};
      if (user.name) data.users.push(user.name);
      if (user.uid && user.color) data.userColors[user.uid] = user.color;
      if (user.uid === currentUid && $('userColor')) $('userColor').value = user.color || '#2563eb';
    });

    render();
  }, error => logSnapshotError('사용자 색상', error));

  syncReady = true;
}

function stopRealtime() {
  unsubEvents?.();
  unsubDocs?.();
  unsubTemplates?.();
  unsubUsers?.();
  unsubEvents = null;
  unsubDocs = null;
  unsubTemplates = null;
  unsubUsers = null;
  syncReady = false;
}
