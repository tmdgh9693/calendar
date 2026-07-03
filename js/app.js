const KEY = 'ys_aton_calendar_v12_firebase';
let data = {users: [], user: '', uid: '', events: [], docs: [], hwpxTemplate: null };
let month = new Date(), photos = [];
let auth = null, db = null, unsbuEvents = null, unsubDocs = null,unsubTemplate = null, unsubUsers = null, syncReady = false;
const $ = id => document.getElementById(id);

const USE_FIREBASE = !!(window.firebase && window.firebaseConfig && window.firebaseConfig.apiKey && !String(window.firebaseConfig.apiKey).includes('여기에'));

if (USE_FIREBASE) {
  if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }
  auth = firebase.auth();
  db = firebase.firestore();
}
function localDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function today() { return localDate(new Date()) }
function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) }
function nl(s) { return esc(s).replace(/\n/g, '<br>') }
function localSave() { localStorage.setItem(KEY, JSON.stringify({ user: data.user, uid: data.uid })) }
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    data.user = saved.user || data.user || '';
    data.uid = saved.uid || data.uid || '';
  } catch (e) { }
  data.users = data.users || [];
  data.events = data.events || [];
  data.docs = data.docs || [];
  data.hwpxTemplate = data.hwpxTemplate || null;
}

function save() {
  localSave();

  if (!USE_FIREBASE || !auth || !auth.currentUser) return;

  saveAllToCloud().catch(err => {
    console.error('Firestore 저장 실패:', err);
    alert('Firebase 저장 실패: ' + err.message);
  });
}

function ownerKey() { return data.uid || data.user }

function mine(e) { return e.scope === '과' || e.ownerUid === ownerKey() || e.owner === data.user || (!e.owner && e.person === data.user) }
function inR(x, s, e) { return (!s || x >= s) && (!e || x <= e) }
function sortEv(a, b) { return (a.date || '').localeCompare(b.date || '') || (String(a.startH || 0).padStart(2, '0') + String(a.startM || 0).padStart(2, '0')).localeCompare(String(b.startH || 0).padStart(2, '0') + String(b.startM || 0).padStart(2, '0')) }

function opts(a, b, v) { let o = ''; for (let i = a; i < b; i++) o += `<option value="${i}" ${Number(v) === i ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`; return o }
function setHM(p, h = 9, m = 0) { $(p + 'H').innerHTML = opts(0, 24, h); $(p + 'M').innerHTML = opts(0, 60, m) }
function getHM(p) { return { h: Number($(p + 'H').value || 0), m: Number($(p + 'M').value || 0) } }
function hm(e) { return String(e.startH || 0).padStart(2, '0') + ':' + String(e.startM || 0).padStart(2, '0') }
function timeText(h, m) { return Number(h) + '시 ' + String(Number(m)).padStart(2, '0') + '분' }
function kdate(v) { if (!v) return ''; let [y, m, d] = v.split('-'); return `${y}년 ${Number(m)}월 ${Number(d)}일` }
function mdate(v) { if (!v) return ''; let [y, m, d] = v.split('-'); return `${Number(m)}월 ${Number(d)}일` }

function cleanForFirestore(obj) { return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v)) }

async function upsert(col, obj) { if (!USE_FIREBASE || !obj || !obj.id) return; await db.collection(col).doc(obj.id).set(cleanForFirestore(obj), { merge: true }) }
async function removeCloud(col, id) { if (!USE_FIREBASE || !id) return; await db.collection(col).doc(id).delete() }
async function saveAllToCloud() {
  if (!USE_FIREBASE) return;
  await Promise.all([
    ...(data.events || []).map(e => upsert('events', e)),
    ...(data.docs || []).map(d => upsert('docs', d))
  ]);
  if (data.hwpxTemplate) await db.collection('settings').doc('hwpxTemplate').set(cleanForFirestore(data.hwpxTemplate));
}

function startRealtime() {
  if (!USE_FIREBASE || !auth.currentUser) return;
  if (unsubEvents) unsubEvents();
  if (unsubDocs) unsubDocs();
  if (unsubTemplate) unsubTemplate();
  if (unsubUsers) unsubUsers();

  let personalEvents = [], deptEvents = [];
  const mergeEvents = () => {
    const merged = new Map();
    [...deptEvents, ...personalEvents].forEach(e => merged.set(e.id, e));
    data.events = [...merged.values()];
    render();
  };

  // 개인 일정
  const unsubPersonal = db.collection('events').where('ownerUid', '==', ownerKey()).onSnapshot(snap => {
    personalEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    mergeEvents();
  });

  // 과 일정
  const unsubDept = db.collection('events').where('scope', '==', '과').onSnapshot(snap => {
    deptEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    mergeEvents();
  });

  unsubEvents = () => { unsubPersonal(); unsubDept(); };

  // 보관자료
  let personalDocs = [], deptDocs = [];
  const mergeDocs = () => {
    const merged = new Map();
    [...deptDocs, ...personalDocs].forEach(d => merged.set(d.id, d));
    data.docs = [...merged.values()].sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
    renderArchive();
  };

  const unsubMyDocs = db.collection('docs').where('ownerUid', '==', ownerKey()).onSnapshot(snap => {
    personalDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    mergeDocs();
  });

  const unsubDeptDocs = db.collection('docs').where('scope', '==', '과').onSnapshot(snap => {
    deptDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    mergeDocs();
  });

  unsubDocs = () => { unsubMyDocs(); unsubDeptDocs(); };

  unsubTemplate = db.collection('settings').doc('hwpxTemplate').onSnapshot(doc => {
    data.hwpxTemplate = doc.exists ? doc.data() : null;
    if ($('hwpxStatus')) $('hwpxStatus').innerText = data.hwpxTemplate ? '등록됨: ' + data.hwpxTemplate.name : '등록된 HWPX 템플릿 없음';
  });

  unsubUsers = db.collection('users').onSnapshot(snap => {
    data.users = snap.docs.map(d => d.data().name).filter(Boolean);
  });

  syncReady = true;
}

async function ensureCloudUser(n) {
  if (!USE_FIREBASE || !auth.currentUser) return;
  await db.collection('users').doc(auth.currentUser.uid).set({
    uid: auth.currentUser.uid,
    name: n,
    email: auth.currentUser.email || '',
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

function init() {
  load();
  if ($('loginBtn')) $('loginBtn').innerText = '로그인 / 회원가입';
  if (!data.user) {
    $('login').classList.remove('hidden');
  } else {
    $('login').classList.add('hidden');
  }
  $('who').innerText = (data.user || '미로그인') + (USE_FIREBASE ? ' / 실시간 동기화' : ' / Firebase 설정 필요');
  $('userName').value = data.user || '';
  if ($('hwpxStatus')) $('hwpxStatus').innerText = data.hwpxTemplate ? '등록됨: ' + data.hwpxTemplate.name : '등록된 HWPX 템플릿 없음';
  setHM('evStart', 9, 0);
  setHM('evEnd', 18, 0);
  setHM('tStart', 9, 0);
  setHM('tEnd', 18, 0);
  $('tDate').value = $('tDate').value || today();
  $('tReportDate').value = $('tReportDate').value || today();
  updateMeetingPeriod();
  render();
}

async function login() {
  let n = $('loginName').value.trim();
  let email = $('loginEmail') ? $('loginEmail').value.trim() : '';
  let pw = $('loginPassword') ? $('loginPassword').value : '';

  if (!n) return alert('이름을 입력하세요.');

  if (!USE_FIREBASE) {
    data.user = n;
    data.uid = n;
    localSave();
    init();
    alert('실시간 동기화가 켜집니다.');
    return;
  }

  if (!email || !pw) return alert('이메일과 비밀번호를 입력하세요.');

  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch (e) {
    console.error('Firebase 로그인 오류:', e);

    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      try {
        await auth.createUserWithEmailAndPassword(email, pw);
      } catch (joinError) {
        console.error('Firebase 회원가입 오류:', joinError);
        alert('회원가입 오류: ' + joinError.message);
        return;
      }
    } else if (e.code === 'auth/configuration-not-found') {
      alert('이메일/비밀번호 로그인을 사용 설정했는지 확인하세요.');
      return;
    } else if (e.code === 'auth/unauthorized-domain') {
      alert('');
      return;
    } else {
      alert('로그인 오류: ' + e.message);
      return;
    }
  }

  data.user = n;
  data.uid = auth.currentUser.uid;
  await ensureCloudUser(n);
  localSave();
  startRealtime();
  init();
}

async function logout() {
  if (USE_FIREBASE && auth.currentUser) await auth.signOut();
  data.user = '';
  data.uid = '';
  syncReady = false;
  if (unsubEvents) unsubEvents();
  if (unsubDocs) unsubDocs();
  if (unsubTemplate) unsubTemplate();
  if (unsubUsers) unsubUsers();
  localSave();
  init();
}

async function setUser() {
  let n = $('userName').value.trim();
  if (!n) return alert('이름을 입력하세요.');

  data.user = n;
  localSave();

  if (USE_FIREBASE && auth.currentUser) {
    await ensureCloudUser(n);
  }

  $('who').innerText = data.user + (USE_FIREBASE ? ' / 실시간 동기화' : ' / Firebase 설정 필요');

  alert('사용자 이름을 저장했습니다.');
}

function tab(id, btn) {
  document.querySelectorAll('.tab').forEach(x => x.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function moveMonth(n) {
  month.setMonth(month.getMonth() + n);
  render();
}

function openEvent(scope, date, idv = '') {
  $('modal').classList.remove('hidden');
  $('evScope').value = scope;

  if (idv) {
    let e = data.events.find(x => x.id === idv);
    fillEvent(e);
    return;
  }

  $('modalTitle').innerText = (scope === '개인' ? '내 일정' : '과 일정') + ' 등록';
  $('evId').value = '';
  $('evDate').value = date || today();
  $('evType').value = '출장';
  $('evPerson').value = scope === '개인' ? data.user : '';
  $('evTitle').value = '';
  $('evPlace').value = '';
  $('evDeptReflect').checked = scope === '개인';
  $('evDeptReflect').disabled = scope === '과';
  $('evMeetingInclude').checked = true;
  $('evPart').value = '자동';
  $('evSummary').value = '';
  $('evResult').value = '';
  $('evPlan').value = '';
  setHM('evStart', 9, 0);
  setHM('evEnd', 18, 0);
}

function closeModal() { $('modal').classList.add('hidden') }
function fillEvent(e) {
  if (!e) return;

   $('modalTitle').innerText = (e.scope === '개인' ? '내 일정' : '과 일정') + ' 수정';
  $('evId').value = e.id;
  $('evScope').value = e.scope;
  $('evDate').value = e.date;
  $('evType').value = e.type;
  $('evPerson').value = e.person;
  $('evTitle').value = e.title;
  $('evPlace').value = e.place;
  $('evDeptReflect').checked = !!e.deptReflect;
  $('evDeptReflect').disabled = e.scope === '과';
  $('evMeetingInclude').checked = !!e.meetingInclude;
  $('evPart').value = e.part || '자동';
  $('evSummary').value = e.summary || '';
  $('evResult').value = e.result || '';
  $('evPlan').value = e.plan || '';
  setHM('evStart', e.startH ?? 9, e.startM ?? 0);
  setHM('evEnd', e.endH ?? 18, e.endM ?? 0);
}

function readEvent() {
  let sh = getHM('evStart');
  let eh = getHM('evEnd');
  let scope = $('evScope').value;

  return {
    id: $('evId').value || uid(),
    scope,
    owner: scope === '개인' ? data.user : '과',
    ownerUid: scope === '개인' ? ownerKey() : 'dept',
    visibleTo: scope === '개인' ? [ownerKey()] : ['dept', ownerKey()],
    sourceId: null,
    date: $('evDate').value || today(),
    startH: sh.h,
    startM: sh.m,
    endH: eh.h,
    endM: eh.m,
    type: $('evType').value,
    person: $('evPerson').value.trim() || (scope === '개인' ? data.user : ''),
    title: $('evTitle').value.trim() || '제목 없음',
    place: $('evPlace').value.trim(),
    deptReflect: $('evDeptReflect').checked,
    meetingInclude: $('evMeetingInclude').checked,
    part: $('evPart').value,
    summary: $('evSummary').value.trim(),
    result: $('evResult').value.trim(),
    plan: $('evPlan').value.trim()
  };
}

async function saveEvent() {
  if (!confirm('작성한 일정을 저장하시겠습니까?')) return;

  let v = readEvent();
  let i = data.events.findIndex(e => e.id === v.id);

  // 개인 일정 수정 시 기존 과 일정 복사본 삭제
  const oldMirrors = data.events
    .filter(e => e.scope === '과' && e.sourceId === v.id)
    .map(e => e.id);

  if (USE_FIREBASE && oldMirrors.length) {
    await Promise.all(oldMirrors.map(id => removeCloud('events', id)));
  }

  if (i >= 0) data.events[i] = v;
  else data.events.push(v);

  // 과 일정 자동 반영
  if (v.scope === '개인') {
    syncDept(v);
  }

  save();

  // 현재 일정 + 자동 생성된 과 일정 업로드
  if (USE_FIREBASE) {
    await Promise.all(
      data.events
        .filter(e => e.id === v.id || e.sourceId === v.id)
        .map(e => upsert('events', e))
    );
  }

  closeModal();
  render();
  alert('저장되었습니다.');
}

// 개인 일정에서 "과 일정 반영" 체크 시 과 일정 자동 생성
function syncDept(p) {
  data.events = data.events.filter(
    e => !(e.scope === '과' && e.sourceId === p.id)
  );

  // 체크되어 있으면 새로 생성
  if (p.deptReflect) {
    data.events.push({
      ...p,
      id: uid(),
      scope: '과',
      owner: '과',
      ownerUid: 'dept',
      visibleTo: ['dept', ownerKey()],
      sourceId: p.id,
      deptReflect: false
    });
  }
}

async function deleteEvent() {
  let id = $('evId').value;
  if (!id) return alert('삭제할 일정이 없습니다.');
  if (!confirm('삭제하시겠습니까?')) return;

  let e = data.events.find(x => x.id === id);

  // 개인 일정 삭제하면 연결된 과 일정도 삭제
  const deleteIds = data.events
    .filter(
      x =>
        x.id === id ||
        (e && e.scope === '개인' && x.sourceId === id)
    )
    .map(x => x.id);

  data.events = data.events.filter(
    x => !deleteIds.includes(x.id)
  );

  if (USE_FIREBASE) {
    await Promise.all(
      deleteIds.map(id => removeCloud('events', id))
    );
  }

  save();
  closeModal();
  render();
}

function render() {
  renderCal('개인');
  renderCal('과');
  tripOptions();
  renderArchive();
}

function renderCal(scope) {
  let y = month.getFullYear();
  let m = month.getMonth();

  $(scope === '개인' ? 'personalTitle' : 'deptTitle').innerText =
    (scope === '개인' ? '내 캘린더' : '과 캘린더') +
    ` · ${y}년 ${m + 1}월`;

  let first = new Date(y, m, 1);
  let start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  let html = ['일', '월', '화', '수', '목', '금', '토']
    .map(n => `<div class="dayname">${n}</div>`)
    .join('');

  for (let i = 0; i < 42; i++) {
    let d = new Date(start);
    d.setDate(start.getDate() + i);

    let day = localDate(d);
    let other = d.getMonth() !== m;

    let evs = data.events
      .filter(
        e =>
          e.scope === scope &&
          e.date === day &&
          (scope === '과' || mine(e))
      )
      .sort(sortEv);

    html += `<div class="cell ${other ? 'other' : ''}" onclick="openEvent('${scope}','${day}')">
      <div class="date">${d.getDate()}</div>`;

    evs.slice(0, 5).forEach(e => {
      let c =
        e.type === '출장'
          ? 'trip'
          : e.type === '점검'
          ? 'check'
          : e.type === '공사'
          ? 'work'
          : e.type === '보고'
          ? 'report'
          : '';

      html += `<div class="event ${c}"
        onclick="event.stopPropagation();openEvent('${scope}','${day}','${e.id}')">
        ${hm(e)} ${esc(e.title)}
        ${e.meetingInclude ? '●' : ''}
      </div>`;
    });

    if (evs.length > 5) {
      html += `<div class="small">+${evs.length - 5}건</div>`;
    }

    html += `</div>`;
  }

  $(scope === '개인' ? 'personalCal' : 'deptCal').innerHTML = html;
}
function weekStart(d) {
  let x = new Date(d), day = x.getDay(), diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  let x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }

function normForKey(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function dedupeMeetingEvents(list) {
  const deptSourceIds = new Set(
    list.filter(e => e.scope === '과' && e.sourceId).map(e => e.sourceId)
  );

  const seen = new Set(), out = [];

  for (const e of list) {
    if (e.scope === '개인' && deptSourceIds.has(e.id)) continue;

    const k = [
      e.sourceId || '',
      e.date || '',
      e.startH ?? '',
      e.startM ?? '',
      e.endH ?? '',
      e.endM ?? '',
      normForKey(e.title),
      normForKey(e.place),
      normForKey(e.summary)
    ].join('|');

    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }

  return out;
}

function dedupeAllEvents() {
  const seen = new Set(), out = [];

  for (const e of data.events || []) {
    const k = [
      e.scope || '',
      e.sourceId || '',
      e.date || '',
      e.startH ?? '',
      e.startM ?? '',
      e.endH ?? '',
      e.endM ?? '',
      normForKey(e.title),
      normForKey(e.place),
      normForKey(e.summary)
    ].join('|');

    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }

  data.events = out;
}

function periodInfo() {
  let now = new Date();

  if ($('mType').value === 'weekly') {
    let ws = weekStart(now);
    let we = addDays(ws, 6);
    let ns = addDays(ws, 7);
    let ne = addDays(ws, 13);

    return {
      aS: localDate(ws),
      aE: localDate(we),
      pS: localDate(ns),
      pE: localDate(ne),
      label: `금주 실적: ${localDate(ws)}~${localDate(we)} / 다음주 계획: ${localDate(ns)}~${localDate(ne)}`
    };
  }

  let cs = monthStart(now);
  let ce = monthEnd(now);
  let ns = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let ne = monthEnd(ns);

  return {
    aS: localDate(cs),
    aE: localDate(ce),
    pS: localDate(ns),
    pE: localDate(ne),
    label: `현재월 실적: ${localDate(cs)}~${localDate(ce)} / 다음월 계획: ${localDate(ns)}~${localDate(ne)}`
  };
}

function updateMeetingPeriod() {
  $('periodGuide').innerText = periodInfo().label;
}

function sourceFilter(e) {
  let s = $('mSource').value;

  return (
    (s === 'dept' && e.scope === '과') ||
    (s === 'personal' && e.scope === '개인' && mine(e)) ||
    (s === 'dept_personal' && (e.scope === '과' || (e.scope === '개인' && mine(e))))
  );
}

function sent(e) {
  let d = e.date
    ? `${Number(e.date.slice(5, 7))}.${Number(e.date.slice(8, 10))}.`
    : '';

  let head = `ㅇ ${e.title}(${[d, hm(e), e.place, e.person].filter(Boolean).join(', ')})`;
  let body = e.summary || '관련 일정 추진';

  return `<p>${esc(head)}<br><span class="indent">- ${nl(
    body +
      (e.result ? ' ' + e.result : '') +
      (e.plan ? ' 향후 ' + e.plan : '')
  )}</span></p>`;
}

function makeMeeting() {
  updateMeetingPeriod();

  let p = periodInfo();

  let raw = data.events.filter(
    e =>
      e.meetingInclude &&
      sourceFilter(e) &&
      (inR(e.date, p.aS, p.aE) || inR(e.date, p.pS, p.pE))
  );

  let evs = dedupeMeetingEvents(raw).sort(sortEv);
  let a = evs.filter(e => e.part !== '현안' && inR(e.date, p.aS, p.aE));
  let pl = evs.filter(e => e.part !== '현안' && inR(e.date, p.pS, p.pE));
  let is = evs.filter(e => e.part === '현안');

  let type = $('mType').value;
  let dept = $('mDept').value || '항행정보시설과';
  let memo = $('mMemo').value.trim();

  $('meetingReport').innerHTML = `
    <h1>${esc(dept)}</h1>
    <p style="text-align:right"><b>작성기준:</b> ${esc(p.label)}</p>

    <h2>${type === 'weekly' ? 'Ⅰ. 금주 주요 실적' : 'Ⅰ. 현재월 주요 실적'}</h2>
    ${a.length ? a.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>${type === 'weekly' ? 'Ⅱ. 다음주 주요 계획' : 'Ⅱ. 다음월 주요 계획'}</h2>
    ${pl.length ? pl.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>Ⅲ. 주요 현안 및 협조사항</h2>
    ${is.length ? is.map(sent).join('') : '<p>ㅇ 해당사항 없음</p>'}

    <h2>Ⅳ. 추가 메모</h2>
    ${memo ? `<p>ㅇ ${nl(memo)}</p>` : '<p>ㅇ 해당사항 없음</p>'}
  `;
}

function tripOptions() {
  let ev = data.events
    .filter(e => ['출장', '점검', '공사'].includes(e.type) && (e.scope === '과' || mine(e)))
    .sort(sortEv);

  $('tripSelect').innerHTML =
    '<option value="">직접 입력 또는 일정 선택</option>' +
    ev.map(e => `<option value="${e.id}">${esc(e.date)} [${esc(e.scope)}] ${esc(e.title)}</option>`).join('');
}

function loadTrip() {
  let e = data.events.find(x => x.id === $('tripSelect').value);
  if (!e) return;

  $('tDate').value = e.date;
  $('tReportDate').value = e.date;
  $('tStartH').value = e.startH ?? 9;
  $('tStartM').value = e.startM ?? 0;
  $('tEndH').value = e.endH ?? 18;
  $('tEndM').value = e.endM ?? 0;
  $('tPerson').value = e.person || data.user;
  $('tPlace').value = e.place || '';
  $('tPurpose').value = e.summary || e.title || '';
  $('tBody').value = [e.summary, e.result].filter(Boolean).map(x => '- ' + x).join('\n');
  $('tPlan').value = e.plan || '';
}

async function addPhotos(files) {
  for (const f of files) {
    let r = await compressSmart(f);
    photos.push({
      data: r.data,
      cap: '',
      original: f.size || 0,
      compressed: r.bytes
    });
  }
  renderPhotos();
}

function dataBytes(u) {
  let b = u.split(',')[1] || '';
  return Math.round((b.length * 3) / 4);
}

function kb(n) {
  return Math.max(1, Math.round((n || 0) / 1024)).toLocaleString() + 'KB';
}

function compress(file, maxW, q) {
  return new Promise((res, rej) => {
    let img = new Image();
    let r = new FileReader();

    r.onload = e => {
      img.onload = () => {
        let ratio = Math.min(1, maxW / img.width);
        let c = document.createElement('canvas');

        c.width = Math.round(img.width * ratio);
        c.height = Math.round(img.height * ratio);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);

        let dataUrl = c.toDataURL('image/jpeg', q);
        res({ data: dataUrl, bytes: dataBytes(dataUrl) });
      };

      img.src = e.target.result;
    };

    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function compressSmart(file) {
  let target = 800 * 1024;
  let maxW = 1280;
  let q = 0.76;
  let out = await compress(file, maxW, q);

  while (out.bytes > target && q > 0.48) {
    q -= 0.08;
    out = await compress(file, maxW, q);
  }

  while (out.bytes > target && maxW > 900) {
    maxW -= 160;
    q = 0.58;
    out = await compress(file, maxW, q);
  }

  return out;
}

function renderPhotos() {
  let o = photos.reduce((s, p) => s + (p.original || 0), 0);
  let c = photos.reduce((s, p) => s + (p.compressed || 0), 0);

  $('photoSizeInfo').innerText = photos.length
    ? `첨부 ${photos.length}장 / 원본 ${kb(o)} → 압축 후 ${kb(c)}`
    : '';

  $('photoPreview').innerHTML = photos
    .map(
      (p, i) => `<div>
        <img src="${p.data}">
        <div class="small">${kb(p.original)} → ${kb(p.compressed)}</div>
        <input placeholder="사진 ${i + 1} 설명" value="${esc(p.cap)}" oninput="photos[${i}].cap=this.value">
        <button class="d" onclick="photos.splice(${i},1);renderPhotos()">삭제</button>
      </div>`
    )
    .join('');
}

function clearPhotos() {
  photos = [];
  renderPhotos();
}

function lines(t) {
  return (t || '')
    .split(/\n+/)
    .map(x => x.replace(/^[-ㅇ•\*]\s*/, '').trim())
    .filter(Boolean);
}

function bullets(t) {
  let a = lines(t);
  return a.length ? a.map(x => `<p>ㅇ ${esc(x)}</p>`).join('') : '<p>ㅇ 해당사항 없음</p>';
}

function subs(t) {
  let a = lines(t);
  return a.length ? a.map(x => `<p>- ${esc(x)}</p>`).join('') : '<p>- 해당사항 없음</p>';
}

function makeTrip() {
  let date = $('tDate').value || today();
  let report = $('tReportDate').value || date;
  let person = $('tPerson').value || data.user;
  let rank = $('tRank').value || '해양수산주사';
  let place = $('tPlace').value || '';

  let ph = '';

  if (photos.length) {
    ph = `<section class="photo-page">
      <h1 class="trip-title">사진대지</h1>
      <div class="photo-grid">
        ${photos
          .slice(0, 8)
          .map(
            (p, i) => `<div class="photo-card">
              <img src="${p.data}">
              <div class="cap">${esc(p.cap || '사진 ' + (i + 1))}</div>
            </div>`
          )
          .join('')}
      </div>
    </section>`;
  }

  $('tripReport').innerHTML = `<section class="trip-page">
    <h1 class="trip-title">출 장 복 명 서</h1>
    <table class="trip-one">
      <colgroup>
        <col style="width:14%">
        <col style="width:18%">
        <col style="width:32%">
        <col style="width:16%">
        <col style="width:20%">
      </colgroup>

      <tr>
        <th>출 장 자</th>
        <td class="center">${esc(person)}</td>
        <td>
          출발: ${esc(mdate(date))} ${esc(timeText($('tStartH').value, $('tStartM').value))}<br>
          귀청: ${esc(mdate(date))} ${esc(timeText($('tEndH').value, $('tEndM').value))}
        </td>
        <td class="center">복명: ${esc(mdate(report))}</td>
        <td class="center">출장지<br>${esc(place)}</td>
      </tr>

      <tr><th colspan="5" style="text-align:left">1. 출장목적</th></tr>
      <tr><td colspan="5" class="bodycell">${bullets($('tPurpose').value)}</td></tr>

      <tr><th colspan="5" style="text-align:left">2. 출장목적 수행상황</th></tr>
      <tr><td colspan="5" class="bodycell">${subs($('tBody').value)}</td></tr>

      <tr><th colspan="5" style="text-align:left">3. 향후계획</th></tr>
      <tr><td colspan="5" class="bodycell">${bullets($('tPlan').value)}</td></tr>

      <tr>
        <td colspan="5">
          붙임&nbsp;&nbsp;사진대지 1부. 끝.<br><br>
          <div style="text-align:center">위와 같이 복명함<br>${esc(kdate(report))}</div>
        </td>
      </tr>

      <tr>
        <td class="center">출장자</td>
        <td colspan="2">${esc(rank)}&nbsp;&nbsp;성명&nbsp;&nbsp;${esc(person)}&nbsp;&nbsp;(인)</td>
        <td class="center">담 당</td>
        <td></td>
      </tr>
    </table>
  </section>${ph}`;
}
function bufToB64(buf) {
  let bytes = new Uint8Array(buf), bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64) {
  let bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function loadHwpxTemplate(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.hwpx')) return alert('HWPX 파일을 선택하세요.');

  let r = new FileReader();

  r.onload = () => {
    try {
      let b64 = bufToB64(r.result);
      data.hwpxTemplate = { name: file.name, size: file.size, b64 };
      save();

      if ($('hwpxStatus')) {
        $('hwpxStatus').innerText =
          '등록됨: ' + file.name + ' (' + Math.round(file.size / 1024) + 'KB)';
      }

      alert('HWPX 템플릿을 등록했습니다.');
    } catch (e) {
      alert('템플릿 저장 실패: ' + e.message);
    }
  };

  r.readAsArrayBuffer(file);
}

function clearHwpxTemplate() {
  if (confirm('등록된 HWPX 템플릿을 삭제할까요?')) {
    data.hwpxTemplate = null;
    save();

    if ($('hwpxStatus')) {
      $('hwpxStatus').innerText = '등록된 HWPX 템플릿 없음';
    }
  }
}

function xmlTextEscape(s) {
  return String(s || '').replace(/[&<>]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  }[m]));
}

function stripHtmlText(id) {
  return $(id).innerText
    .replace(/\u00a0/g, ' ')
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function hwpxMap(kind, sourceId) {
  let map = {};
  map['{{본문}}'] = stripHtmlText(sourceId).join('\n');
  map['{{회의자료}}'] = map['{{본문}}'];
  map['{{제목}}'] = stripHtmlText(sourceId)[0] || '';
  map['{{작성일}}'] = kdate(today());

  if (kind === 'trip') {
    map['{{출장자}}'] = $('tPerson').value || data.user || '';
    map['{{성명}}'] = $('tPerson').value || data.user || '';
    map['{{출장지}}'] = $('tPlace').value || '';
    map['{{출발}}'] = mdate($('tDate').value || today()) + ' ' + timeText($('tStartH').value, $('tStartM').value);
    map['{{귀청}}'] = mdate($('tDate').value || today()) + ' ' + timeText($('tEndH').value, $('tEndM').value);
    map['{{복명}}'] = mdate($('tReportDate').value || $('tDate').value || today());
    map['{{복명일}}'] = kdate($('tReportDate').value || $('tDate').value || today());
    map['{{직급}}'] = $('tRank').value || '';
    map['{{출장목적}}'] = $('tPurpose').value || '';
    map['{{수행상황}}'] = $('tBody').value || '';
    map['{{향후계획}}'] = $('tPlan').value || '';
  }

  return map;
}

function replacePlaceholders(xml, map) {
  let out = xml;

  for (const [k, v] of Object.entries(map)) {
    out = out.split(k).join(xmlTextEscape(v));
  }

  return out;
}

function compactHwpxLines(sourceId) {
  let lines = stripHtmlText(sourceId)
    .map(x => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return lines.slice(0, 120);
}

function cleanParaForHwpx(sample, idx) {
  let s = sample.replace(/id="[^"]*"/, 'id="' + idx + '"');

  s = s
    .replace(/pageBreak="1"/g, 'pageBreak="0"')
    .replace(/columnBreak="1"/g, 'columnBreak="0"')
    .replace(/paraPrIDRef="[^"]*"/, 'paraPrIDRef="0"')
    .replace(/styleIDRef="[^"]*"/, 'styleIDRef="0"')
    .replace(/charPrIDRef="[^"]*"/g, 'charPrIDRef="0"');

  if (idx > 0) {
    s = s.replace(/<hp:secPr[\s\S]*?<\/hp:secPr>/, '');
    s = s.replace(/<hp:ctrl>\s*<hp:colPr[\s\S]*?<\/hp:ctrl>/, '');
  }

  s = s
    .replace(/vertsize="\d+"/g, 'vertsize="1000"')
    .replace(/textheight="\d+"/g, 'textheight="1000"')
    .replace(/baseline="\d+"/g, 'baseline="850"')
    .replace(/spacing="\d+"/g, 'spacing="300"');

  return s;
}

function makeParaFromSample(sample, line, idx) {
  let s = cleanParaForHwpx(sample, idx);

  if (/<hp:t[\s\S]*?<\/hp:t>/.test(s)) {
    let done = false;

    s = s.replace(/<hp:t([^>]*)>[\s\S]*?<\/hp:t>/g, (m, attr) => {
      if (done) return '<hp:t' + attr + '></hp:t>';
      done = true;
      return '<hp:t' + attr + '>' + xmlTextEscape(line) + '</hp:t>';
    });
  } else {
    s = s.replace(/<\/hp:run>/, '<hp:t>' + xmlTextEscape(line) + '</hp:t></hp:run>');
  }

  return s;
}

function rebuildSectionXml(xml, lines) {
  let paras = xml.match(/<hp:p\b[\s\S]*?<\/hp:p>/g);
  if (!paras || !paras.length) return xml;

  lines = (lines && lines.length ? lines : ['']).map(x => String(x || ''));

  let firstWithSec =
    paras.find(p => /<hp:secPr[\s\S]*?<\/hp:secPr>/.test(p)) || paras[0];

  let textPara =
    paras.find(p => /<hp:t[\s\S]*?<\/hp:t>/.test(p)) || firstWithSec;

  let body = lines
    .map((line, i) => makeParaFromSample(i === 0 ? firstWithSec : textPara, line, i))
    .join('\n');

  let start = xml.indexOf(paras[0]);
  let end = xml.lastIndexOf(paras[paras.length - 1]) + paras[paras.length - 1].length;

  return xml.slice(0, start) + body + xml.slice(end);
}

async function downloadHwpx(sourceId, filename, kind) {
  try {
    if (!window.JSZip) {
      alert('HWPX 저장에 필요한 JSZip을 불러오지 못했습니다. 인터넷 연결 상태를 확인하세요.');
      return;
    }

    if (!data.hwpxTemplate) {
      alert('먼저 설정·백업 메뉴에서 HWPX 템플릿 파일(.hwpx)을 등록하세요.');
      return;
    }

    let zip = await JSZip.loadAsync(b64ToBuf(data.hwpxTemplate.b64));
    let secNames = Object.keys(zip.files).filter(n => /^Contents\/section\d+\.xml$/i.test(n));

    if (!secNames.length) {
      alert('템플릿에서 Contents/section*.xml을 찾지 못했습니다. 다른 HWPX 템플릿을 등록해 주세요.');
      return;
    }

    let map = hwpxMap(kind, sourceId);
    let hasPlaceholder = false;

    for (const n of secNames) {
      let xml = await zip.file(n).async('string');
      let replaced = replacePlaceholders(xml, map);
      if (replaced !== xml) hasPlaceholder = true;
      zip.file(n, replaced);
    }

    if (!hasPlaceholder) {
      let n = secNames[0];
      let xml = await zip.file(n).async('string');
      let lines = compactHwpxLines(sourceId);

      zip.file(n, rebuildSectionXml(xml, lines));

      for (const other of secNames.slice(1)) {
        zip.file(
          other,
          '<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"></hs:sec>'
        );
      }
    }

    if (zip.file('Preview/PrvText.txt')) {
      zip.file('Preview/PrvText.txt', compactHwpxLines(sourceId).join('\n'));
    }

    let blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    let a = document.createElement('a');

    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    URL.revokeObjectURL(a.href);

    alert(hasPlaceholder
      ? 'HWPX 저장 완료: 템플릿 표시값을 치환했습니다.'
      : 'HWPX 저장 완료: 1페이지용으로 내용을 보정했습니다.');
  } catch (e) {
    console.error(e);
    alert('HWPX 생성 오류: ' + e.message);
  }
}

// 생성된 회의자료/출장복명서를 보관함에 저장합니다.
// 저장 시 개인 보관 / 과 공유 선택이 가능하도록 수정했습니다.
function saveGenerated(type, src) {
  let el = $(src);
  if (!el.innerText.trim()) return alert('먼저 자료를 생성하세요.');

  let title = prompt('보관 제목', `${type}_${today()}`);
  if (!title) return;

  let share = confirm('이 자료를 과 공유 보관자료로 저장할까요?\n\n확인: 과 공유\n취소: 개인 보관');

  let doc = {
    id: uid(),
    type,
    title,
    date: new Date().toLocaleString(),
    createdAt: new Date().toISOString(),
    html: el.innerHTML,
    owner: data.user,
    ownerUid: ownerKey(),
    scope: share ? '과' : '개인',
    updated: ''
  };

  data.docs.unshift(doc);
  save();

  if (USE_FIREBASE) upsert('docs', doc);

  renderArchive();
  alert(share ? '과 공유 보관자료로 저장했습니다.' : '개인 보관자료로 저장했습니다.');
}

function canEditDoc(d) {
  return !d.ownerUid || d.ownerUid === ownerKey() || d.owner === data.user;
}

function renderArchive() {
  let box = $('archiveList');
  if (!box) return;

  let docs = (data.docs || []).filter(d =>
    d.scope === '과' ||
    !d.ownerUid ||
    d.ownerUid === ownerKey() ||
    d.owner === data.user
  );

  box.innerHTML = docs.length
    ? docs.map(d => {
      let shareLabel = d.scope === '과' ? '과 공유' : '개인';
      let editable = canEditDoc(d);

      return `<div class="list-item">
        <b>${esc(d.title)}</b>
        <div class="small">
          ${esc(d.type)} / ${esc(shareLabel)} / 작성자: ${esc(d.owner || '')} / 저장: ${esc(d.date)}
          ${d.updated ? ` / 수정: ${esc(d.updated)}` : ''}
        </div>

        <button class="s" onclick="viewDoc('${d.id}')">보기</button>
        ${editable ? `<button class="g" onclick="editDoc('${d.id}')">수정</button>` : ''}
        <button class="s" onclick="printDoc('${d.id}')">인쇄/PDF</button>
        <button class="s" onclick="downloadArchivedDoc('${d.id}')">한글 열기용 저장</button>
        ${editable ? `<button class="d" onclick="deleteDoc('${d.id}')">삭제</button>` : ''}
      </div>`;
    }).join('')
    : '<p class="small">보관자료가 없습니다.</p>';
}

function viewDoc(id) {
  let d = data.docs.find(x => x.id === id);
  if (d) $('archiveView').innerHTML = d.html;
}

function editDoc(id) {
  let d = data.docs.find(x => x.id === id);
  if (!d) return;

  if (!canEditDoc(d)) {
    return alert('다른 사용자가 공유한 자료는 수정할 수 없습니다.');
  }

  $('archiveView').innerHTML = `<div class="notice small">
    아래 제목과 내용을 수정한 뒤 <b>수정내용 저장</b>을 누르세요.
  </div>
  <label>제목</label>
  <input id="editDocTitle" value="${esc(d.title)}">

  <label>내용</label>
  <div id="editDocBody" contenteditable="true" style="min-height:480px;border:1px solid #cdd3dd;border-radius:10px;padding:14px;background:white;line-height:1.7;overflow:auto">${d.html}</div>

  <button class="p" onclick="saveEditedDoc('${id}')">수정내용 저장</button>
  <button class="s" onclick="viewDoc('${id}')">취소</button>
  <button class="s" onclick="printEditedDoc()">현재 수정화면 인쇄/PDF</button>`;
}

function saveEditedDoc(id) {
  let d = data.docs.find(x => x.id === id);
  if (!d) return;

  if (!canEditDoc(d)) {
    return alert('다른 사용자가 공유한 자료는 수정할 수 없습니다.');
  }

  d.title = $('editDocTitle').value.trim() || d.title;
  d.html = $('editDocBody').innerHTML;
  d.updated = new Date().toLocaleString();
  d.updatedAt = new Date().toISOString();

  save();

  if (USE_FIREBASE) upsert('docs', d);

  renderArchive();
  viewDoc(id);
  alert('수정내용을 저장했습니다.');
}

function printEditedDoc() {
  let body = $('editDocBody');
  if (!body) return;

  $('printRoot').innerHTML = `<div class="reportbox">${body.innerHTML}</div>`;

  setTimeout(() => {
    window.print();
    setTimeout(() => $('printRoot').innerHTML = '', 300);
  }, 100);
}

function printDoc(id) {
  let d = data.docs.find(x => x.id === id);
  if (!d) return;

  $('printRoot').innerHTML = `<div class="reportbox">${d.html}</div>`;

  setTimeout(() => {
    window.print();
    setTimeout(() => $('printRoot').innerHTML = '', 300);
  }, 100);
}

function downloadArchivedDoc(id) {
  let d = data.docs.find(x => x.id === id);
  if (!d) return;

  let tmp = document.createElement('div');
  tmp.id = 'tmpArchiveDownload';
  tmp.style.display = 'none';
  tmp.innerHTML = d.html;
  document.body.appendChild(tmp);

  downloadDoc('tmpArchiveDownload', (d.title || '보관자료') + '.doc');
  tmp.remove();
}

async function deleteDoc(id) {
  let d = data.docs.find(x => x.id === id);
  if (!d) return;

  if (!canEditDoc(d)) {
    return alert('다른 사용자가 공유한 자료는 삭제할 수 없습니다.');
  }

  if (confirm('삭제할까요?')) {
    data.docs = data.docs.filter(d => d.id !== id);
    save();

    if (USE_FIREBASE) await removeCloud('docs', id);

    renderArchive();
    $('archiveView').innerHTML = '<p class="small">저장된 자료를 선택하세요.</p>';
  }
}

function printOnly(id) {
  $('printRoot').innerHTML = $(id).outerHTML;

  setTimeout(() => {
    window.print();
    setTimeout(() => $('printRoot').innerHTML = '', 300);
  }, 100);
}

function downloadDoc(id, filename) {
  let content = $(id).innerHTML;

  let css = `<style>
    body{font-family:Malgun Gothic,Arial;line-height:1.7}
    .trip-one{border-collapse:collapse;width:100%;border:2px solid #000}
    .trip-one th,.trip-one td{border:1px solid #000;padding:8px}
    .photo-grid{display:grid;grid-template-columns:1fr 1fr;border:2px solid #000}
    .photo-card{border:1px solid #000;text-align:center;padding:8px}
    .photo-card img{max-width:100%;max-height:240px}
  </style>`;

  let b = new Blob(
    [`<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${content}</body></html>`],
    { type: 'application/msword;charset=utf-8' }
  );

  let a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = filename;
  a.click();

  URL.revokeObjectURL(a.href);
}

function exportData() {
  let b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  let a = document.createElement('a');

  a.href = URL.createObjectURL(b);
  a.download = '캘린더_보관자료_백업.json';
  a.click();

  URL.revokeObjectURL(a.href);
}

function importData() {
  try {
    data = JSON.parse($('importText').value);
    save();
    init();
    alert('가져왔습니다.');
  } catch (e) {
    alert('JSON 형식이 맞지 않습니다.');
  }
}

async function clearEvents() {
  if (confirm('일정만 모두 삭제할까요? 보관자료는 유지됩니다.')) {
    const ids = data.events.map(e => e.id);
    data.events = [];

    save();

    if (USE_FIREBASE) {
      await Promise.all(ids.map(id => removeCloud('events', id)));
    }

    render();
  }
}

function sample() {
  let now = new Date();
  let ws = weekStart(now);
  let ns = addDays(ws, 7);
  let cur = localDate(addDays(ws, 2));
  let nxt = localDate(addDays(ns, 1));

  data.events = [
    {
      id: uid(),
      scope: '개인',
      owner: data.user,
      ownerUid: ownerKey(),
      visibleTo: [ownerKey()],
      date: cur,
      startH: 13,
      startM: 0,
      endH: 16,
      endM: 30,
      type: '출장',
      person: data.user,
      title: '사설항로표지 실태점검',
      place: '광양',
      deptReflect: true,
      meetingInclude: true,
      part: '자동',
      summary: '사설항로표지 실태점검 실시[여수광양항만공사 / 등대 1]',
      result: '허가사항, 시설물 관리, 관리자 등록 및 자격사항을 확인한 결과 대체로 적정',
      plan: '사설항로표지 실태점검 계속 추진'
    },
    {
      id: uid(),
      scope: '과',
      owner: '과',
      ownerUid: 'dept',
      visibleTo: ['dept', ownerKey()],
      sourceId: 'sample1',
      date: cur,
      startH: 13,
      startM: 0,
      endH: 16,
      endM: 30,
      type: '출장',
      person: data.user,
      title: '사설항로표지 실태점검',
      place: '광양',
      deptReflect: false,
      meetingInclude: true,
      part: '자동',
      summary: '사설항로표지 실태점검 실시[여수광양항만공사 / 등대 1]',
      result: '허가사항, 시설물 관리, 관리자 등록 및 자격사항을 확인한 결과 대체로 적정',
      plan: '사설항로표지 실태점검 계속 추진'
    },
    {
      id: uid(),
      scope: '과',
      owner: '과',
      ownerUid: 'dept',
      visibleTo: ['dept', ownerKey()],
      date: nxt,
      startH: 9,
      startM: 30,
      endH: 10,
      endM: 30,
      type: '회의',
      person: '담당자 A',
      title: '주간업무 검토회의',
      place: '우리 청 회의실',
      deptReflect: false,
      meetingInclude: true,
      part: '자동',
      summary: '부서 주요 현안 및 다음 주 추진계획 공유',
      result: '',
      plan: '담당자별 일정 정리'
    }
  ];

  save();
  render();
  alert('샘플자료를 넣었습니다.');
}

function cleanupDuplicates() {
  const before = (data.events || []).length;
  dedupeAllEvents();
  save();
  render();

  alert('중복 일정 ' + (before - data.events.length) + '건을 정리했습니다.');
}

if (USE_FIREBASE) {
  auth.onAuthStateChanged(async user => {
    if (user) {
      data.uid = user.uid;
      data.user = data.user || (user.email || '사용자');
      localSave();
      startRealtime();
    }

    init();
  });
} else {
  init();
}

console.info(
  USE_FIREBASE
    ? 'Firebase 실시간 동기화 모드로 실행 중입니다.'
    : 'Firebase 설정 또는 SDK가 없어 브라우저 임시 저장 모드로 실행 중입니다.'
);
