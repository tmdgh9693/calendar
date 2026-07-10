let auth = null;
let db = null;

let unsubEvents = null;
let unsubDocs = null;
let unsubTemplate = null;
let unsubUsers = null;

let syncReady = false;

const USE_FIREBASE = !!(
  window.firebase &&
  window.firebaseConfig &&
  window.firebaseConfig.apiKey &&
  !String(window.firebaseConfig.apiKey).includes('여기에')
);

if (USE_FIREBASE) {
  if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }

  auth = firebase.auth();
  db = firebase.firestore();

  console.info('Firebase 실시간 동기화 모드로 실행 중입니다.');
} else {
  console.info('Firebase 설정 또는 SDK가 없어 브라우저 임시 저장 모드로 실행 중입니다.');
}

function cleanForFirestore(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) => value === undefined ? null : value)
  );
}

async function upsert(col, obj) {
  if (!USE_FIREBASE || !db || !obj || !obj.id) return;

  await db
    .collection(col)
    .doc(obj.id)
    .set(cleanForFirestore(obj), { merge: true });
}

async function removeCloud(col, id) {
  if (!USE_FIREBASE || !db || !id) return;

  await db
    .collection(col)
    .doc(id)
    .delete();
}

async function saveAllToCloud() {
  if (!USE_FIREBASE || !auth || !auth.currentUser) return;

  await Promise.all([
    ...(data.events || []).map(event => upsert('events', event)),
    ...(data.docs || []).map(doc => upsert('docs', doc))
  ]);

  if (data.hwpxTemplates) {
    await db
      .collection('settings')
      .doc('hwpxTemplates')
      .set({
        templates: cleanForFirestore(normalizeHwpxTemplates()),
        updatedAt: new Date().toISOString()
      }, { merge: true });
  }
}

async function ensureCloudUser(name) {
  if (!USE_FIREBASE || !auth || !auth.currentUser) return;

  const userId = auth.currentUser.uid;
  data.userColors = data.userColors || {};

  // 중요: 로그인/새로고침 시 색상 입력칸의 기본값(#2563eb)이
  // 기존 개인 색상을 덮어쓰지 않도록 서버/로컬에 저장된 색상을 먼저 사용합니다.
  let cloudColor = '';
  try {
    const userSnapshot = await db.collection('users').doc(userId).get();
    cloudColor = String(userSnapshot.data()?.color || '').trim();
  } catch (error) {
    console.warn('저장된 사용자 색상을 불러오지 못했습니다:', error);
  }

  const localColor = String(data.userColors[userId] || data.userColors[name] || '').trim();
  const inputColor = String($('userColor')?.value || '').trim();
  const color = cloudColor || localColor || inputColor || '#2563eb';

  data.userColors[userId] = color;
  if (name) data.userColors[name] = color;
  if ($('userColor')) $('userColor').value = color;

  await db
    .collection('users')
    .doc(userId)
    .set({
      uid: userId,
      name,
      email: auth.currentUser.email || '',
      color,
      updatedAt: new Date().toISOString()
    }, { merge: true });
}

function startRealtime() {
  if (!USE_FIREBASE || !auth || !auth.currentUser) return;

  if (unsubEvents) unsubEvents();
  if (unsubDocs) unsubDocs();
  if (unsubTemplate) unsubTemplate();
  if (unsubUsers) unsubUsers();

  let personalEvents = [];
  let deptEvents = [];

  const mergeEvents = () => {
    const merged = new Map();

    [...deptEvents, ...personalEvents].forEach(event => {
      merged.set(event.id, event);
    });

    const hidden = new Set((data.deletedEventIds || []).map(String));
    data.events = [...merged.values()].filter(event => !hidden.has(String(event.id)));
    render();
  };

  const unsubPersonal = db
    .collection('events')
    .where('ownerUid', '==', ownerKey())
    .onSnapshot(snapshot => {
      personalEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      mergeEvents();
    });

  const unsubDept = db
    .collection('events')
    .where('scope', '==', '과')
    .onSnapshot(snapshot => {
      deptEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      mergeEvents();
    });

  unsubEvents = () => {
    unsubPersonal();
    unsubDept();
  };

  let personalDocs = [];
  let deptDocs = [];

  const mergeDocs = () => {
    const merged = new Map();

    [...deptDocs, ...personalDocs].forEach(doc => {
      merged.set(doc.id, doc);
    });

    const hidden = new Set((data.deletedDocIds || []).map(String));
    data.docs = [...merged.values()]
      .filter(doc => !hidden.has(String(doc.id)))
      .sort((a, b) =>
      String(b.createdAt || b.date || '').localeCompare(
        String(a.createdAt || a.date || '')
      )
    );

    renderArchive();
  };

  const unsubMyDocs = db
    .collection('docs')
    .where('ownerUid', '==', ownerKey())
    .onSnapshot(snapshot => {
      personalDocs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      mergeDocs();
    });

  const unsubDeptDocs = db
    .collection('docs')
    .where('scope', '==', '과')
    .onSnapshot(snapshot => {
      deptDocs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      mergeDocs();
    });

  unsubDocs = () => {
    unsubMyDocs();
    unsubDeptDocs();
  };

  unsubTemplate = db
    .collection('settings')
    .doc('hwpxTemplates')
    .onSnapshot(doc => {
      if (doc.exists) {
        const shared = doc.data() || {};
        const remoteTemplates = shared.templates || {
          meeting: shared.meeting || [],
          trip: shared.trip || []
        };

        if (typeof mergeHwpxTemplateLists === 'function') {
          data.hwpxTemplates = mergeHwpxTemplateLists(data.hwpxTemplates, remoteTemplates);
        } else {
          data.hwpxTemplates = remoteTemplates;
        }

        if (typeof normalizeHwpxTemplates === 'function') {
          normalizeHwpxTemplates();
        }

        localSave();
      }

      if (typeof renderHwpxTemplateStatus === 'function') {
        renderHwpxTemplateStatus();
      }
    }, error => {
      console.warn('공용 HWPX 템플릿 불러오기 실패:', error);
      if (typeof renderHwpxTemplateStatus === 'function') {
        renderHwpxTemplateStatus();
      }
    });

  unsubUsers = db.collection('users').onSnapshot(snapshot => {
  const savedColors = { ...(data.userColors || {}) };
  data.users = [];
  data.userColors = savedColors;

  snapshot.docs.forEach(doc => {
    const user = doc.data();

    if (user.name) data.users.push(user.name);
    if (user.uid && user.color) {
      data.userColors[user.uid] = user.color;
      if (user.name) data.userColors[user.name] = user.color;
    }

    if (auth.currentUser && user.uid === auth.currentUser.uid && $('userColor')) {
      $('userColor').value = data.userColors[user.uid] || user.color || '#2563eb';
    }
  });

  localSave();
  render();
});
}

function stopRealtime() {
  if (unsubEvents) unsubEvents();
  if (unsubDocs) unsubDocs();
  if (unsubTemplate) unsubTemplate();
  if (unsubUsers) unsubUsers();

  unsubEvents = null;
  unsubDocs = null;
  unsubTemplate = null;
  unsubUsers = null;

  syncReady = false;
}