import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  setPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import {
  getFirestore,
  enableIndexedDbPersistence,
  serverTimestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const appEl = document.getElementById('app');
const toastRoot = document.getElementById('toast-root');
const popupRoot = document.getElementById('popup-root');
const levels = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7', 'HSK8', 'HSK9', 'HSKK'];
const LOCAL_KEY = 'hoanguhsk-ui-cache-v3';

const state = {
  initialized: false,
  authReady: false,
  firebaseError: '',
  user: null,
  profile: null,
  adminUsers: [],
  histories: [],
  levelDataCache: {},
  studyCache: readLocalStudyCache(),
  currentLevel: 'HSK1',
  currentModule: 'typing',
  flashcards: [],
  flashIndex: 0,
  reflexIndex: 0,
  reflexCountdown: 3,
  reflexTimer: null,
  flashTimer: null,
  examSelections: {},
  dialogueIndex: 0,
  adminFilters: { search: '', status: 'all', access: 'all' },
  studyUnsub: null,
  profileUnsub: null,
  adminUsersUnsub: null,
  historyUnsub: null,
  loading: false,
  loadingText: 'Đang tải...',
  authTab: 'login'
};

let fbApp;
let auth;
let db;

function usernameToEmail(username) {
  const cleaned = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${cleaned}@hoanguhsk.app`;
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
function escapeJs(str = '') {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function nowVN() {
  return new Date().toLocaleString('vi-VN');
}
function prettyDate(value) {
  if (!value) return '';
  if (value?.toDate) return value.toDate().toLocaleString('vi-VN');
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('vi-VN');
}
function normalizeMeaning(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/;:!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeHanzi(str = '') {
  return String(str).replace(/\s+/g, '').trim().toLowerCase();
}
function splitMeaningVariants(meaning = '') {
  return normalizeMeaning(meaning).split(/[,;]|\s+hoac\s+|\s+va\s+/).map(v => v.trim()).filter(Boolean);
}
function fisherYates(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}
function saveLocalStudyCache() {
  const payload = {
    currentLevel: state.currentLevel,
    currentModule: state.currentModule,
    flashIndex: state.flashIndex,
    reflexIndex: state.reflexIndex,
    dialogueIndex: state.dialogueIndex,
    studyCache: state.studyCache
  };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
}
function readLocalStudyCache() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}').studyCache || {};
  } catch {
    return {};
  }
}
function readLocalUiCache() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch {
    return {};
  }
}
function applyLocalUiCache() {
  const ui = readLocalUiCache();
  if (ui.currentLevel) state.currentLevel = ui.currentLevel;
  if (ui.currentModule) state.currentModule = ui.currentModule;
  if (typeof ui.flashIndex === 'number') state.flashIndex = ui.flashIndex;
  if (typeof ui.reflexIndex === 'number') state.reflexIndex = ui.reflexIndex;
  if (typeof ui.dialogueIndex === 'number') state.dialogueIndex = ui.dialogueIndex;
}
function speakText(text) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}
function showToast(message, type = 'success') {
  const stack = toastRoot.querySelector('.toast-stack') || (() => {
    toastRoot.innerHTML = '<div class="toast-stack"></div>';
    return toastRoot.querySelector('.toast-stack');
  })();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<strong>${type === 'error' ? 'Lỗi' : 'Thông báo'}</strong><div style="margin-top:6px">${escapeHtml(message)}</div>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}
function setLoading(on, text = 'Đang tải...') {
  state.loading = on;
  state.loadingText = text;
  renderLoading();
}
function renderLoading() {
  let overlay = document.getElementById('loading-overlay');
  if (!state.loading) {
    overlay?.remove();
    return;
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="loader-card"><div class="loader-ring"></div><h3 style="margin:0 0 8px">${escapeHtml(state.loadingText)}</h3><div class="muted">Đang đồng bộ dữ liệu</div></div>`;
}
function showPopup({ title, content, actions = [] }) {
  popupRoot.innerHTML = `
    <div class="popup" onclick="window.closePopup(event)">
      <div class="popup-card" onclick="event.stopPropagation()">
        <div class="section-title"><h3>${escapeHtml(title)}</h3></div>
        <div>${content}</div>
        <div class="popup-actions">${actions.join('')}</div>
      </div>
    </div>`;
}
window.closePopup = function closePopup(event) {
  if (!event || event.target.classList.contains('popup')) popupRoot.innerHTML = '';
};

async function initFirebase() {
  applyLocalUiCache();
  try {
    const config = window.FIREBASE_CONFIG;
    if (!config || !config.apiKey || String(config.apiKey).includes('PASTE_')) {
      state.firebaseError = 'Chưa có cấu hình Firebase';
      state.authReady = true;
      render();
      return;
    }
    fbApp = initializeApp(config);
    auth = initializeAuth(fbApp, { persistence: indexedDBLocalPersistence });
    await setPersistence(auth, indexedDBLocalPersistence);
    db = getFirestore(fbApp);
    try { await enableIndexedDbPersistence(db); } catch {}
    onAuthStateChanged(auth, async user => {
      state.user = user || null;
      state.authReady = true;
      await handleAuthChanged();
    });
    state.initialized = true;
  } catch (error) {
    console.error(error);
    state.firebaseError = error.message || 'Không thể kết nối Firebase';
    state.authReady = true;
    render();
  }
}

async function handleAuthChanged() {
  cleanupSubscriptions();
  stopAutoFlash();
  stopReflex();
  if (!state.user) {
    state.profile = null;
    state.adminUsers = [];
    state.histories = [];
    render();
    return;
  }
  setLoading(true, 'Đang tải hồ sơ');
  await ensureProfileForSignedInUser();
  subscribeProfile();
  subscribeHistory();
  if (state.profile?.role === 'admin') subscribeAdminUsers();
  setLoading(false);
  render();
}

async function ensureProfileForSignedInUser() {
  const ref = doc(db, 'profiles', state.user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const adminQuery = await getDocs(query(collection(db, 'profiles'), where('role', '==', 'admin'), limit(1)));
    const isFirstAdmin = adminQuery.empty;
    const username = (state.user.email || '').split('@')[0] || `user_${uid()}`;
    const data = {
      name: state.user.displayName || username,
      username,
      email: state.user.email || '',
      role: isFirstAdmin ? 'admin' : 'guest',
      vipLevels: isFirstAdmin ? [...levels] : ['HSK1'],
      status: 'active',
      createdAt: serverTimestamp(),
      createdBy: isFirstAdmin ? 'self-bootstrap' : state.user.uid,
      lastLoginAt: serverTimestamp()
    };
    await setDoc(ref, data);
    state.profile = { id: state.user.uid, ...data };
  } else {
    await updateDoc(ref, { lastLoginAt: serverTimestamp() });
    state.profile = { id: snap.id, ...snap.data() };
  }
}
function subscribeProfile() {
  state.profileUnsub = onSnapshot(doc(db, 'profiles', state.user.uid), snap => {
    if (snap.exists()) {
      state.profile = { id: snap.id, ...snap.data() };
      render();
    }
  });
}
function subscribeAdminUsers() {
  state.adminUsersUnsub = onSnapshot(query(collection(db, 'profiles'), orderBy('createdAt', 'desc')), qs => {
    state.adminUsers = qs.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.role !== 'admin');
    if (state.profile?.role === 'admin') render();
  });
}
function subscribeHistory() {
  state.historyUnsub = onSnapshot(query(collection(db, 'history', state.user.uid, 'items'), orderBy('timeISO', 'desc')), qs => {
    state.histories = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    if (state.currentModule === 'history') render();
  });
}
function cleanupSubscriptions() {
  ['profileUnsub', 'adminUsersUnsub', 'historyUnsub', 'studyUnsub'].forEach(k => {
    if (state[k]) state[k]();
    state[k] = null;
  });
}

function shell(content) {
  const p = state.profile;
  const roleLabel = p?.role === 'admin' ? 'Admin' : 'Học viên';
  return `
    <div class="container">
      <div class="header">
        <div class="brand">
          <div class="logo">汉</div>
          <div>
            <h1>Hoa Ngữ HSK</h1>
            <p>${escapeHtml(roleLabel)} · ${escapeHtml(p?.name || '')}</p>
          </div>
        </div>
        <div class="top-actions">
          <span class="tag">${escapeHtml(p?.status || '')}</span>
          ${p?.role !== 'admin' ? '<button class="ghost" onclick="window.showHistory()">Lịch sử</button>' : ''}
          ${p?.role === 'admin' ? '<button class="gold" onclick="window.renderAdmin()">Admin</button>' : ''}
          <button onclick="window.logout()">Đăng xuất</button>
        </div>
      </div>
      ${content}
    </div>`;
}

function authView() {
  appEl.innerHTML = `
    <div class="auth-wrap">
      <div class="card auth-card">
        <div class="auth-head">
          <span class="tag">Hoa Ngữ Trung Hoa</span>
          <h2>Hoa Ngữ HSK</h2>
          ${state.firebaseError ? `<div class="tag" style="margin-top:10px">${escapeHtml(state.firebaseError)}</div>` : ''}
        </div>
        <div class="auth-menu" role="tablist">
          <button id="tab-login" class="auth-menu-btn ${state.authTab === 'login' ? 'active' : 'secondary'}" onclick="window.switchAuthTab('login')">Đăng nhập</button>
          <button id="tab-register" class="auth-menu-btn ${state.authTab === 'register' ? 'active' : 'secondary'}" onclick="window.switchAuthTab('register')">Đăng ký</button>
        </div>
        <div id="auth-login-panel" class="panel auth-panel-single ${state.authTab === 'login' ? '' : 'hidden'}">
          <div class="form-grid">
            <div style="grid-column:span 12"><label>Tài khoản</label><input id="login-username" placeholder="Nhập tài khoản" /></div>
            <div style="grid-column:span 12"><label>Mật khẩu</label><input id="login-password" type="password" placeholder="Nhập mật khẩu" /></div>
          </div>
          <div style="margin-top:16px"><button onclick="window.login()">Đăng nhập</button></div>
        </div>
        <div id="auth-register-panel" class="panel auth-panel-single ${state.authTab === 'register' ? '' : 'hidden'}">
          <div class="form-grid">
            <div style="grid-column:span 12"><label>Họ tên</label><input id="reg-name" placeholder="Ví dụ: Trí Tô Quang" /></div>
            <div style="grid-column:span 12"><label>Tài khoản</label><input id="reg-username" placeholder="Tên đăng nhập" /></div>
            <div style="grid-column:span 12"><label>Mật khẩu</label><input id="reg-password" type="password" placeholder="Tối thiểu 6 ký tự" /></div>
          </div>
          <div style="margin-top:16px"><button class="gold" onclick="window.registerUser()">Tạo tài khoản</button></div>
        </div>
      </div>
    </div>`;
}
window.switchAuthTab = function switchAuthTab(tab) {
  state.authTab = tab;
  render();
};

function dashboardView() {
  const p = state.profile;
  const levelCards = levels.map(level => {
    const open = p.role === 'admin' || (p.vipLevels || []).includes(level);
    const label = open ? 'Vào học' : 'Mở cấp';
    return `
      <div class="level-card ${open ? '' : 'locked'}">
        <span class="tag">${open ? 'Đã mở' : 'VIP'}</span>
        <h3 style="margin:14px 0 6px">${level}</h3>
        <div class="muted">Luyện gõ · Flashcard · Phản xạ · Hội thoại · Bài tập</div>
        <div style="margin-top:14px"><button class="${open ? '' : 'secondary'}" onclick="window.openLevel('${level}')">${label}</button></div>
      </div>`;
  }).join('');

  appEl.innerHTML = shell(`
    <div class="grid">
      <div class="card col-12">
        <div class="section-title"><div><h2>Chọn cấp độ</h2></div></div>
        <div class="level-grid">${levelCards}</div>
      </div>
    </div>`);
}

function openVipPopup(level) {
  showPopup({
    title: `Mở ${level}`,
    content: '<div class="muted">Liên hệ Admin để cấp quyền VIP.</div>',
    actions: ['<button onclick="window.closePopup(event)">Đã hiểu</button>']
  });
}

async function fetchLevelData(level) {
  if (state.levelDataCache[level]) return state.levelDataCache[level];
  const file = `data/${level.toLowerCase()}.json`;
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Không đọc được ${file}`);
  const raw = await res.json();
  const enrichItem = (item = {}, index = 0) => ({
    ...item,
    example: item.example || (item.hanzi ? `我正在学习 ${item.hanzi}。` : ''),
    examplePinyin: item.examplePinyin || (item.pinyin ? `Wǒ zhèngzài xuéxí ${item.pinyin}.` : ''),
    exampleMeaning: item.exampleMeaning || (item.meaning ? `Ví dụ ghi nhớ: ${item.meaning}` : ''),
    synonyms: item.synonyms || [],
    audioText: item.audioText || item.hanzi || '',
    id: item.id || `${level}-${index}`
  });
  const data = {
    ...raw,
    typing_practice: (raw.typing_practice || []).map(enrichItem),
    flashcards: (raw.flashcards || raw.typing_practice || []).map(enrichItem),
    reflection: raw.reflection || [],
    dialogues: raw.dialogues || [],
    exercises: raw.exercises || []
  };
  state.levelDataCache[level] = data;
  return data;
}
function getStudyPath(level) {
  return doc(db, 'study', state.user.uid, 'levels', level);
}
function getStudy(level) {
  return state.studyCache[level] || { typingInputs: {}, typingStatus: {}, examScore: null, module: 'typing' };
}
async function subscribeStudy(level) {
  if (state.studyUnsub) state.studyUnsub();
  state.studyUnsub = onSnapshot(getStudyPath(level), snap => {
    const serverData = snap.exists() ? snap.data() : {};
    state.studyCache[level] = { ...getStudy(level), ...serverData };
    if (serverData.lastModule) state.currentModule = serverData.lastModule;
    if (typeof serverData.flashIndex === 'number') state.flashIndex = serverData.flashIndex;
    if (typeof serverData.reflexIndex === 'number') state.reflexIndex = serverData.reflexIndex;
    if (typeof serverData.dialogueIndex === 'number') state.dialogueIndex = serverData.dialogueIndex;
    saveLocalStudyCache();
    renderStudy();
  });
}
async function updateStudy(level, patch) {
  const prev = getStudy(level);
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  state.studyCache[level] = next;
  saveLocalStudyCache();
  await setDoc(getStudyPath(level), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}
async function addHistory(type, detail, targetUid = state.user?.uid) {
  if (!targetUid) return;
  await addDoc(collection(db, 'history', targetUid, 'items'), {
    type,
    detail,
    timeLabel: nowVN(),
    timeISO: new Date().toISOString()
  });
}

async function openLevel(level) {
  const p = state.profile;
  if (!(p.role === 'admin' || (p.vipLevels || []).includes(level))) return openVipPopup(level);
  setLoading(true, `Đang mở ${level}`);
  state.currentLevel = level;
  state.examSelections = {};
  state.reflexCountdown = 3;
  stopAutoFlash();
  stopReflex();
  await fetchLevelData(level);
  await subscribeStudy(level);
  const study = getStudy(level);
  state.currentModule = study.lastModule || state.currentModule || 'typing';
  state.flashIndex = study.flashIndex || 0;
  state.reflexIndex = study.reflexIndex || 0;
  state.dialogueIndex = study.dialogueIndex || 0;
  state.flashcards = fisherYates(state.levelDataCache[level].flashcards || []);
  await updateStudy(level, { lastModule: state.currentModule, flashIndex: state.flashIndex, reflexIndex: state.reflexIndex, dialogueIndex: state.dialogueIndex });
  await addHistory('Mở cấp độ', `Bắt đầu học ${level}`);
  saveLocalStudyCache();
  setLoading(false);
  renderStudy();
}
function switchModule(module) {
  state.currentModule = module;
  updateStudy(state.currentLevel, { lastModule: module }).catch(() => {});
  saveLocalStudyCache();
  if (module !== 'flashcard') stopAutoFlash();
  if (module !== 'reflex') stopReflex();
  renderStudy();
}

function typingRows(data, study) {
  return (data.typing_practice || []).map((item, idx) => {
    const val = study.typingInputs?.[idx] || '';
    const status = study.typingStatus?.[idx] || 'pending';
    const statusText = status === 'ok' ? 'Đúng rồi' : status === 'wrong' ? 'Học lại đi' : 'Đoán xem';
    const statusClass = status === 'ok' ? 'status-ok' : status === 'wrong' ? 'status-warn' : 'status-pending';
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><div class="kaiti" style="font-size:34px">${escapeHtml(item.hanzi)}</div></td>
        <td>${escapeHtml(item.pinyin || '')}</td>
        <td>${escapeHtml(item.meaning || '')}</td>
        <td><input value="${escapeHtml(val)}" oninput="window.updateTyping(${idx}, this.value)" placeholder="Nhập Hán tự, pinyin hoặc nghĩa" /></td>
        <td><span class="result-badge ${statusClass}">${statusText}</span></td>
      </tr>`;
  }).join('');
}

function renderStudy() {
  const data = state.levelDataCache[state.currentLevel];
  if (!data) return;
  const study = getStudy(state.currentLevel);
  const flashcards = state.flashcards.length ? state.flashcards : fisherYates(data.flashcards || data.typing_practice || []);
  state.flashcards = flashcards;
  const card = flashcards[state.flashIndex % Math.max(flashcards.length, 1)] || null;
  const reflection = data.reflection || [];
  const ref = reflection[state.reflexIndex % Math.max(reflection.length, 1)] || null;
  const dialogues = data.dialogues || [];
  const dialogue = dialogues[state.dialogueIndex % Math.max(dialogues.length, 1)] || null;
  const exercises = data.exercises || [];
  const progress = data.typing_practice?.length ? Math.round((Object.values(study.typingStatus || {}).filter(v => v === 'ok').length / data.typing_practice.length) * 100) : 0;
  const modules = [
    ['typing', 'Luyện gõ'],
    ['flashcard', 'Flashcard'],
    ['reflex', 'Phản xạ'],
    ['dialogue', 'Hội thoại'],
    ['exam', 'Bài tập']
  ];
  const nav = modules.map(([key, label]) => `<button class="${state.currentModule === key ? '' : 'ghost'}" onclick="window.switchModule('${key}')">${label}</button>`).join('');
  let content = '';

  if (state.currentModule === 'typing') {
    content = `
      <div class="card col-12">
        <div class="section-title"><div><h3>Luyện gõ Hán tự</h3></div><span class="tag">${progress}%</span></div>
        <div class="progress-track" style="margin-bottom:14px"><div class="progress-bar" style="width:${progress}%"></div></div>
        <div class="table-wrap"><table><thead><tr><th>STT</th><th>Hán tự</th><th>Pinyin</th><th>Nghĩa Việt</th><th>Ôn tập</th><th>Kết quả</th></tr></thead><tbody>${typingRows(data, study)}</tbody></table></div>
      </div>`;
  }

  if (state.currentModule === 'flashcard') {
    const pct = flashcards.length ? Math.round(((state.flashIndex % flashcards.length) + 1) / flashcards.length * 100) : 0;
    content = card ? `
      <div class="card col-12">
        <div class="progress-track" style="margin-bottom:16px"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div class="flashcard">
          <div>
            <span class="tag">${state.currentLevel} · ${state.flashIndex + 1}/${flashcards.length}</span>
            <div class="kaiti-big" style="margin-top:18px">${escapeHtml(card.hanzi)}</div>
            <h2 style="margin:10px 0 4px">${escapeHtml(card.pinyin || '')}</h2>
            <div class="muted" style="font-size:18px">${escapeHtml(card.meaning || '')}</div>
            <div class="panel" style="margin-top:18px; text-align:left">
              <div><strong>Ví dụ</strong></div>
              <div class="kaiti" style="font-size:24px; margin-top:8px">${escapeHtml(card.example || '')}</div>
              <div style="margin-top:4px">${escapeHtml(card.examplePinyin || '')}</div>
              <div class="muted" style="margin-top:4px">${escapeHtml(card.exampleMeaning || '')}</div>
            </div>
            <div class="flash-actions" style="margin-top:18px">
              <button class="gold" onclick="window.speakCurrentCard()">Phát âm</button>
              <button onclick="window.nextFlashcard()">Thẻ tiếp</button>
              <button class="ghost" onclick="window.toggleAutoFlashcard()">${state.flashTimer ? 'Dừng tự động' : 'Tự động chuyển'}</button>
            </div>
          </div>
        </div>
      </div>` : '';
  }

  if (state.currentModule === 'reflex') {
    content = ref ? `
      <div class="card col-12">
        <div class="section-title"><div><h3>Phản xạ nhanh</h3></div><span class="tag">${state.reflexIndex + 1}/${reflection.length}</span></div>
        <div class="timer"><div class="timer-bar" style="width:${(state.reflexCountdown / 3) * 100}%"></div></div>
        <div class="flashcard" style="margin-top:16px">
          <div>
            <h2>${escapeHtml(ref.vi || '')}</h2>
            <div class="reflex-answer ${state.reflexCountdown === 0 ? 'show' : ''}" style="margin-top:20px">
              <div class="kaiti-big">${escapeHtml(ref.hanzi || '')}</div>
              <div style="font-size:20px">${escapeHtml(ref.pinyin || '')}</div>
            </div>
          </div>
        </div>
        <div class="split-actions" style="margin-top:16px">
          <button onclick="window.startReflex()">${state.reflexTimer ? 'Đang chạy' : 'Bắt đầu'}</button>
          <button class="ghost" onclick="window.nextReflex()">Câu tiếp</button>
          <button class="gold" onclick="window.toggleAutoReflex()">Tự động</button>
        </div>
      </div>` : '';
  }

  if (state.currentModule === 'dialogue') {
    const lines = (dialogue?.conversation || []).map(line => `
      <div class="dialogue-line">
        <strong>${escapeHtml(line.speaker || '')}</strong>
        <div class="kaiti" style="font-size:28px; margin-top:6px">${escapeHtml(line.hanzi || '')}</div>
        <div>${escapeHtml(line.pinyin || '')}</div>
        <div class="muted">${escapeHtml(line.meaning || '')}</div>
      </div>`).join('');
    content = dialogue ? `
      <div class="card col-12">
        <div class="section-title"><div><h3>${escapeHtml(dialogue.title || 'Hội thoại')}</h3></div><span class="tag">${state.dialogueIndex + 1}/${dialogues.length}</span></div>
        <div class="dialogue-list"><div class="dialogue-box">${lines}</div></div>
        <div class="split-actions" style="margin-top:16px">
          <button onclick="window.nextDialogue()">Đổi hội thoại</button>
          <button class="gold" onclick="window.speakDialogue()">Nghe hội thoại</button>
        </div>
      </div>` : '<div class="card col-12"><div class="muted">Chưa có hội thoại</div></div>';
  }

  if (state.currentModule === 'exam') {
    const qs = exercises.map((q, idx) => `
      <div class="exam-q">
        <strong>Câu ${idx + 1}.</strong> ${escapeHtml(q.question)}
        <div style="display:grid; gap:8px; margin-top:12px">
          ${(q.options || []).map(opt => `
            <label class="option-item">
              <input type="radio" name="q${idx}" ${state.examSelections[idx] === opt ? 'checked' : ''} onchange="window.selectExam(${idx}, '${escapeJs(opt)}')" />
              <span>${escapeHtml(opt)}</span>
            </label>`).join('')}
        </div>
      </div>`).join('');
    content = `
      <div class="card col-12">
        <div class="section-title"><div><h3>Bài tập HSK</h3></div>${study.examScore !== null && study.examScore !== undefined ? `<span class="tag">Điểm gần nhất ${study.examScore}/${exercises.length}</span>` : ''}</div>
        ${qs || '<div class="muted">Chưa có bài tập</div>'}
        <div class="split-actions"><button onclick="window.submitExam()">Nộp bài</button></div>
      </div>`;
  }

  appEl.innerHTML = shell(`
    <div class="grid">
      <div class="card col-12">
        <div class="section-title">
          <div><span class="tag">${state.currentLevel}</span><h2 style="margin-top:10px">Lộ trình học</h2></div>
          <button class="ghost" onclick="window.backHome()">Trang chính</button>
        </div>
        <div class="module-nav">${nav}</div>
      </div>
      ${content}
    </div>`);
}

async function updateTyping(idx, value) {
  const data = state.levelDataCache[state.currentLevel];
  const target = (data.typing_practice || [])[idx];
  if (!target) return;
  const study = getStudy(state.currentLevel);
  const input = String(value || '');
  const n = normalizeMeaning(input);
  const hanziMatch = normalizeHanzi(input) === normalizeHanzi(target.hanzi);
  const pinyinMatch = normalizeMeaning(input) === normalizeMeaning(target.pinyin || '');
  const meaningMatch = splitMeaningVariants(target.meaning).some(v => n.includes(v) || v.includes(n));
  const status = !n ? 'pending' : (hanziMatch || pinyinMatch || meaningMatch ? 'ok' : 'wrong');
  const typingInputs = { ...(study.typingInputs || {}), [idx]: input };
  const typingStatus = { ...(study.typingStatus || {}), [idx]: status };
  await updateStudy(state.currentLevel, { typingInputs, typingStatus });
}

async function nextFlashcard() {
  stopAutoFlash(false);
  state.flashIndex += 1;
  await updateStudy(state.currentLevel, { flashIndex: state.flashIndex });
  renderStudy();
}
function stopAutoFlash(reset = true) {
  if (state.flashTimer) clearInterval(state.flashTimer);
  state.flashTimer = null;
  if (reset) renderStudy();
}
function toggleAutoFlashcard() {
  if (state.flashTimer) return stopAutoFlash();
  state.flashTimer = setInterval(async () => {
    state.flashIndex += 1;
    await updateStudy(state.currentLevel, { flashIndex: state.flashIndex });
    renderStudy();
  }, 2600);
  renderStudy();
}

function stopReflex(renderAfter = true) {
  if (state.reflexTimer) clearInterval(state.reflexTimer);
  state.reflexTimer = null;
  if (renderAfter) renderStudy();
}
function startReflex(autoNext = false) {
  stopReflex(false);
  state.reflexCountdown = 3;
  renderStudy();
  state.reflexTimer = setInterval(async () => {
    state.reflexCountdown -= 1;
    if (state.reflexCountdown <= 0) {
      state.reflexCountdown = 0;
      clearInterval(state.reflexTimer);
      state.reflexTimer = null;
      await updateStudy(state.currentLevel, { reflexIndex: state.reflexIndex });
      if (autoNext) {
        setTimeout(() => window.nextReflex(true), 1500);
      }
    }
    renderStudy();
  }, 1000);
}
function toggleAutoReflex() {
  startReflex(true);
}
async function nextReflex(autoStart = false) {
  stopReflex(false);
  state.reflexCountdown = 3;
  state.reflexIndex += 1;
  await updateStudy(state.currentLevel, { reflexIndex: state.reflexIndex });
  renderStudy();
  if (autoStart) startReflex(true);
}
async function nextDialogue() {
  state.dialogueIndex += 1;
  await updateStudy(state.currentLevel, { dialogueIndex: state.dialogueIndex });
  renderStudy();
}
function speakDialogue() {
  const dialogue = state.levelDataCache[state.currentLevel]?.dialogues?.[state.dialogueIndex % Math.max(state.levelDataCache[state.currentLevel]?.dialogues?.length || 1, 1)];
  if (!dialogue) return;
  speakText((dialogue.conversation || []).map(x => x.hanzi).join(' '));
}
function speakCurrentCard() {
  const card = state.flashcards[state.flashIndex % Math.max(state.flashcards.length, 1)];
  if (card) speakText(card.audioText || card.hanzi || '');
}
function selectExam(idx, value) {
  state.examSelections[idx] = value;
}
async function submitExam() {
  const data = state.levelDataCache[state.currentLevel];
  const questions = data.exercises || [];
  let score = 0;
  questions.forEach((q, idx) => { if (state.examSelections[idx] === q.answer) score += 1; });
  await updateStudy(state.currentLevel, { examScore: score, examSelections: state.examSelections });
  await addHistory('Bài tập', `${state.currentLevel}: ${score}/${questions.length}`);
  showToast(`Điểm ${score}/${questions.length}`);
  renderStudy();
}

function showHistory() {
  const items = state.histories.map(h => `
    <div class="history-item"><strong>${escapeHtml(h.type)}</strong><div style="margin-top:4px">${escapeHtml(h.detail)}</div><div class="small muted" style="margin-top:6px">${escapeHtml(h.timeLabel || '')}</div></div>`).join('') || '<div class="muted">Chưa có lịch sử</div>';
  appEl.innerHTML = shell(`
    <div class="card">
      <div class="section-title"><h2>Lịch sử</h2><button class="ghost" onclick="window.backHome()">Quay lại</button></div>
      <div class="history-list">${items}</div>
    </div>`);
}

function getAdminUserStats(users) {
  return {
    all: users.length,
    free: users.filter(u => (u.vipLevels || []).length <= 1).length,
    vip: users.filter(u => (u.vipLevels || []).length > 1).length,
    locked: users.filter(u => u.status !== 'active').length
  };
}
function filteredAdminUsers() {
  const { search, status, access } = state.adminFilters;
  return state.adminUsers.filter(u => {
    const searchOk = !search || `${u.name} ${u.username}`.toLowerCase().includes(search.toLowerCase());
    const statusOk = status === 'all' || u.status === status;
    const accessOk = access === 'all' || (access === 'vip' ? (u.vipLevels || []).length > 1 : (u.vipLevels || []).length <= 1);
    return searchOk && statusOk && accessOk;
  });
}
function renderAdmin() {
  const users = filteredAdminUsers();
  const stats = getAdminUserStats(state.adminUsers);
  const rows = users.map(u => `
    <tr>
      <td>${escapeHtml(u.name || '')}</td>
      <td>${escapeHtml(u.username || '')}</td>
      <td>${escapeHtml(u.status || '')}</td>
      <td>${escapeHtml((u.vipLevels || []).join(', '))}</td>
      <td>${prettyDate(u.createdAt)}</td>
      <td>
        <div class="stack-actions">
          <button class="ghost" onclick="window.toggleUserStatus('${u.id}')">${u.status === 'active' ? 'Khoá' : 'Mở'}</button>
          <button class="gold" onclick="window.openVipManager('${u.id}')">Cấp quyền</button>
          <button onclick="window.viewUserHistory('${u.id}', '${escapeJs(u.name || u.username || '')}')">Lịch sử</button>
        </div>
      </td>
    </tr>`).join('');
  appEl.innerHTML = shell(`
    <div class="grid">
      <div class="card col-12">
        <div class="section-title"><h2>Control Admin</h2><button class="ghost" onclick="window.backHome()">Trang chính</button></div>
        <div class="summary-stats">
          <div class="stat-box"><strong>Tổng user</strong><div style="font-size:28px; margin-top:8px">${stats.all}</div></div>
          <div class="stat-box"><strong>Free</strong><div style="font-size:28px; margin-top:8px">${stats.free}</div></div>
          <div class="stat-box"><strong>VIP</strong><div style="font-size:28px; margin-top:8px">${stats.vip}</div></div>
          <div class="stat-box"><strong>Bị khoá</strong><div style="font-size:28px; margin-top:8px">${stats.locked}</div></div>
        </div>
      </div>
      <div class="panel col-4">
        <h3 style="margin-top:0">Tạo tài khoản</h3>
        <div class="form-grid">
          <div style="grid-column:span 12"><label>Họ tên</label><input id="admin-name" /></div>
          <div style="grid-column:span 12"><label>Tài khoản</label><input id="admin-username" /></div>
          <div style="grid-column:span 12"><label>Mật khẩu</label><input id="admin-password" type="password" /></div>
        </div>
        <div style="margin-top:14px"><button onclick="window.createUserByAdmin()">Tạo tài khoản</button></div>
      </div>
      <div class="card col-8">
        <div class="section-title"><h3>Quản lý user</h3></div>
        <div class="filters" style="margin-bottom:14px">
          <input placeholder="Tìm tên hoặc tài khoản" value="${escapeHtml(state.adminFilters.search)}" oninput="window.setAdminFilter('search', this.value)" />
          <select onchange="window.setAdminFilter('status', this.value)">
            <option value="all" ${state.adminFilters.status === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
            <option value="active" ${state.adminFilters.status === 'active' ? 'selected' : ''}>active</option>
            <option value="locked" ${state.adminFilters.status === 'locked' ? 'selected' : ''}>locked</option>
          </select>
          <select onchange="window.setAdminFilter('access', this.value)">
            <option value="all" ${state.adminFilters.access === 'all' ? 'selected' : ''}>Free + VIP</option>
            <option value="free" ${state.adminFilters.access === 'free' ? 'selected' : ''}>Free</option>
            <option value="vip" ${state.adminFilters.access === 'vip' ? 'selected' : ''}>VIP</option>
          </select>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Tài khoản</th><th>Trạng thái</th><th>Quyền học</th><th>Ngày tạo</th><th>Hành động</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Chưa có user</td></tr>'}</tbody></table></div>
      </div>
    </div>`);
}
window.setAdminFilter = function setAdminFilter(key, value) {
  state.adminFilters[key] = value;
  renderAdmin();
};

async function createUserByAdmin() {
  const name = document.getElementById('admin-name')?.value.trim();
  const username = document.getElementById('admin-username')?.value.trim();
  const password = document.getElementById('admin-password')?.value.trim();
  if (!name || !username || password.length < 6) return showToast('Thông tin chưa hợp lệ', 'error');
  const existing = await getDocs(query(collection(db, 'profiles'), where('username', '==', username), limit(1)));
  if (!existing.empty) return showToast('Tài khoản đã tồn tại', 'error');
  setLoading(true, 'Đang tạo tài khoản');
  const secondName = `admin-helper-${uid()}`;
  const secondApp = initializeApp(window.FIREBASE_CONFIG, secondName);
  const secondAuth = initializeAuth(secondApp, { persistence: inMemoryPersistence });
  try {
    const credential = await createUserWithEmailAndPassword(secondAuth, usernameToEmail(username), password);
    await setDoc(doc(db, 'profiles', credential.user.uid), {
      name,
      username,
      email: credential.user.email,
      role: 'guest',
      vipLevels: ['HSK1'],
      status: 'active',
      createdAt: serverTimestamp(),
      createdBy: state.user.uid,
      lastLoginAt: serverTimestamp()
    });
    await addHistory('Admin', `Tạo user ${username}`);
    showToast('Đã tạo tài khoản');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không tạo được tài khoản', 'error');
  } finally {
    try { await signOut(secondAuth); } catch {}
    try { await deleteApp(secondApp); } catch {}
    setLoading(false);
  }
}
async function toggleUserStatus(id) {
  const user = state.adminUsers.find(u => u.id === id);
  if (!user) return;
  const next = user.status === 'active' ? 'locked' : 'active';
  await updateDoc(doc(db, 'profiles', id), { status: next });
  await addHistory('Admin', `${next === 'active' ? 'Mở' : 'Khoá'} ${user.username}`);
  showToast(`Đã ${next === 'active' ? 'mở' : 'khoá'} tài khoản`);
}
function openVipManager(id) {
  const user = state.adminUsers.find(u => u.id === id);
  if (!user) return;
  const current = new Set(user.vipLevels || []);
  const checks = levels.map(level => `
    <label class="check-pill"><input type="checkbox" value="${level}" ${current.has(level) ? 'checked' : ''} /> <span>${level}</span></label>`).join('');
  showPopup({
    title: `Cấp quyền cho ${user.username}`,
    content: `<div class="level-check-grid" id="vip-grid">${checks}</div>`,
    actions: [
      '<button class="ghost" onclick="window.closePopup(event)">Huỷ</button>',
      `<button class="gold" onclick="window.saveVipLevels('${id}')">Lưu quyền</button>`
    ]
  });
}
window.openVipManager = openVipManager;
window.saveVipLevels = async function saveVipLevels(id) {
  const user = state.adminUsers.find(u => u.id === id);
  if (!user) return;
  const vipLevels = Array.from(document.querySelectorAll('#vip-grid input:checked')).map(x => x.value);
  if (!vipLevels.length) vipLevels.push('HSK1');
  if (!vipLevels.includes('HSK1')) vipLevels.unshift('HSK1');
  await updateDoc(doc(db, 'profiles', id), { vipLevels: Array.from(new Set(vipLevels)) });
  await addHistory('Admin', `Cập nhật quyền cho ${user.username}`);
  popupRoot.innerHTML = '';
  showToast('Đã lưu quyền học');
};
window.viewUserHistory = async function viewUserHistory(uid, name) {
  setLoading(true, 'Đang tải lịch sử');
  try {
    const qs = await getDocs(query(collection(db, 'history', uid, 'items'), orderBy('timeISO', 'desc'), limit(30)));
    const items = qs.docs.map(d => d.data()).map(h => `<div class="history-item"><strong>${escapeHtml(h.type)}</strong><div>${escapeHtml(h.detail)}</div><div class="small muted" style="margin-top:6px">${escapeHtml(h.timeLabel || '')}</div></div>`).join('') || '<div class="muted">Chưa có lịch sử</div>';
    showPopup({ title: `Lịch sử · ${name}`, content: `<div class="history-list">${items}</div>`, actions: ['<button onclick="window.closePopup(event)">Đóng</button>'] });
  } finally {
    setLoading(false);
  }
};

async function login() {
  const username = document.getElementById('login-username')?.value.trim();
  const password = document.getElementById('login-password')?.value.trim();
  if (!username || !password) return showToast('Nhập tài khoản và mật khẩu', 'error');
  try {
    setLoading(true, 'Đang đăng nhập');
    const credential = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    const profileSnap = await getDoc(doc(db, 'profiles', credential.user.uid));
    if (profileSnap.exists() && profileSnap.data().status !== 'active') {
      await signOut(auth);
      return showToast('Tài khoản đang bị khoá', 'error');
    }
    showToast('Đăng nhập thành công');
  } catch (error) {
    console.error(error);
    showToast('Sai tài khoản hoặc mật khẩu', 'error');
  } finally {
    setLoading(false);
  }
}
async function registerUser() {
  const name = document.getElementById('reg-name')?.value.trim();
  const username = document.getElementById('reg-username')?.value.trim();
  const password = document.getElementById('reg-password')?.value.trim();
  if (!name || !username || password.length < 6) return showToast('Điền đủ thông tin, mật khẩu ít nhất 6 ký tự', 'error');
  try {
    setLoading(true, 'Đang tạo tài khoản');
    const existing = await getDocs(query(collection(db, 'profiles'), where('username', '==', username), limit(1)));
    if (!existing.empty) return showToast('Tài khoản đã tồn tại', 'error');
    const adminExists = !(await getDocs(query(collection(db, 'profiles'), where('role', '==', 'admin'), limit(1)))).empty;
    const credential = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
    await setDoc(doc(db, 'profiles', credential.user.uid), {
      name,
      username,
      email: credential.user.email,
      role: adminExists ? 'guest' : 'admin',
      vipLevels: adminExists ? ['HSK1'] : [...levels],
      status: 'active',
      createdAt: serverTimestamp(),
      createdBy: adminExists ? credential.user.uid : 'self-bootstrap',
      lastLoginAt: serverTimestamp()
    });
    showToast('Tạo tài khoản thành công');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể tạo tài khoản', 'error');
  } finally {
    setLoading(false);
  }
}
async function logout() {
  try { await signOut(auth); } catch {}
}
function backHome() {
  stopAutoFlash();
  stopReflex();
  state.currentModule = 'typing';
  saveLocalStudyCache();
  render();
}

function render() {
  renderLoading();
  if (!state.authReady) {
    appEl.innerHTML = '<div class="auth-wrap"><div class="card auth-card"><div class="auth-head"><h2>Hoa Ngữ HSK</h2></div></div></div>';
    return;
  }
  if (!state.user) return authView();
  if (!state.profile) return;
  if (state.profile.status !== 'active') {
    appEl.innerHTML = shell('<div class="card"><div class="muted">Tài khoản đang bị khoá</div></div>');
    return;
  }
  if (state.profile.role === 'admin') return renderAdmin();
  return dashboardView();
}

window.login = login;
window.registerUser = registerUser;
window.logout = logout;
window.render = render;
window.renderAdmin = renderAdmin;
window.openLevel = openLevel;
window.switchModule = switchModule;
window.updateTyping = updateTyping;
window.nextFlashcard = nextFlashcard;
window.toggleAutoFlashcard = toggleAutoFlashcard;
window.startReflex = startReflex;
window.toggleAutoReflex = toggleAutoReflex;
window.nextReflex = nextReflex;
window.nextDialogue = nextDialogue;
window.speakDialogue = speakDialogue;
window.speakCurrentCard = speakCurrentCard;
window.selectExam = selectExam;
window.submitExam = submitExam;
window.showHistory = showHistory;
window.toggleUserStatus = toggleUserStatus;
window.createUserByAdmin = createUserByAdmin;
window.backHome = backHome;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
initFirebase();
