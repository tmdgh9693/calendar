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

  if (data.hwpxTemplate) {
    await db
      .collection('settings')
      .doc('hwpxTemplate')
      .set(cleanForFirestore(data.hwpxTemplate), { merge: true });
  }
}

async function ensureCloudUser(name) {
  if (!USE_FIREBASE || !auth || !auth.currentUser) return;

  await db
    .collection('users')
    .doc(auth.currentUser.uid)
    .set({
      uid: auth.currentUser.uid,
      name,
      email: auth.currentUser.email || '',
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

    data.events = [...merged.values()];
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

    data.docs = [...merged.values()].sort((a, b) =>
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
    .doc('hwpxTemplate')
    .onSnapshot(doc => {
      data.hwpxTemplate = doc.exists ? doc.data() : null;

      if ($('hwpxStatus')) {
        $('hwpxStatus').innerText = data.hwpxTemplate
          ? '등록됨: ' + data.hwpxTemplate.name
          : '등록된 HWPX 템플릿 없음';
      }
    });

  unsubUsers = db.collection('users').onSnapshot(snapshot => {
  data.users = [];
  data.userColors = {};

  snapshot.docs.forEach(doc => {
    const user = doc.data();

    if (user.name) data.users.push(user.name);
    if (user.uid && user.color) data.userColors[user.uid] = user.color;

    if (auth.currentUser && user.uid === auth.currentUser.uid && $('userColor')) {
      $('userColor').value = user.color || '#2563eb';
    }
  });

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
