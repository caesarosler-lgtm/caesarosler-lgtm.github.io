/* 웹판의 '대리인' 공통 부분 (2026-10-08) — tools/build_web.py 가 방마다 web/<방>/shim.js 로 만든다 (방 몫은 tools/web_shim_<방>.js, __…__ 자리는 빌드가 채움).
   방 화면(apps/<방>.html)은 PC 에서 실행기(파이썬)에게 api/… 로 부탁한다. 웹에는 실행기가 없으므로 그 부탁을 여기서 받아 처리한다:
   · api/data   구글 드라이브 '나의도서관 동기화' 폴더 — PC 의 sync.py 와 같은 규칙 (기기마다 dev_<id>.json, 기록마다 (t, d) 큰 쪽이 이김,
                같은 기록을 두 기기가 따로 고쳤으면 3-way 병합, 못 합치면 진 쪽을 드라이브에 따로 보관). 방 기록 = '<방>:…' (나의도서관.pyw ROOM_SYNC)
   · 나머지 api/… 는 방 몫(roomRoute)이 맡는다.
   이 브라우저 = 동기화 기기 하나 (책장 웹판 · 다른 방과 같은 기기 id 'ml.dev' · 같은 파일 — 그래서 내 파일을 쓸 때 모든 기록을 함께 쓴다).
   방 몫이 둘 것: roomFix(d, 저장소) · roomRoute(ep, method, init, body, query) → Response | null (api/data 도 먼저 받을 수 있다) · ROOM_POLLS (화면이 스스로 다시 읽나)
                 · roomCanAdopt() · roomDb() · roomAdopt(d) · roomResume() (다시 로그인한 뒤 못 한 저장) — ROOM_POLLS 가 아닐 때 'data' 저장소용
   저장소: 방 하나가 여러 파일을 쓸 수 있다 (내일의 할일 = 하루 기록 · 연간 · 월간 · 5년 · 포스트잇). 저널 · 영어스승은 'data' 하나. */
(() => {
'use strict';
const CLIENT_ID = "400009441617-5v78t237a461c2bhp74s4b72a5a1g05m.apps.googleusercontent.com";
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOM = {"stores": {"data": {"prefix": "cards:", "sync": {"top": false, "lists": ["decks", "cards"], "dicts": [], "local": [], "strip": []}}}, "title": "암기카드", "desc": "나의 도서관의 암기카드 — 기록은 내 구글 드라이브에만 있습니다."};   // {stores: {저장소: {prefix: 'journal:', sync: 나의도서관.pyw ROOM_SYNC[…]}}, title, desc}
// 시험: 이 PC 의 시험 주소(localhost)에서만 ?folder=… 로 다른 동기화 폴더 (PC 쪽은 ML_SYNC_FOLDER) — 공개 주소에서는 늘 진짜 폴더
const FOLDER = (location.hostname === 'localhost' && new URLSearchParams(location.search).get('folder')) || '나의도서관 동기화';
const ST = name => { const st = ROOM.stores[name]; if (!st) throw new Error('저장소 없음: ' + name); return st; };
const TEXT_FIELDS = new Set(['title', 'body', 'name', 'note', 'text', 'memo']);
const ls = {get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch(e){ return d; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} }};
const origFetch = window.fetch.bind(window);
const ME = ls.get('ml.dev', null) || (() => { const v = 'w' + crypto.getRandomValues(new Uint32Array(2)).reduce((s, x) => s + x.toString(36), '').slice(0, 11); ls.set('ml.dev', v); return v; })();
const MYNAME = (() => { const u = navigator.userAgent; const k = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : '브라우저'; return '웹 · ' + k; })();
const nowS = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 19); };

/* ---------- 구글 로그인 (웹판 모든 방 · 책장이 같은 코드 — tools/web_auth.js, build_web.py 가 끼워 넣는다) ----------
   구글은 서버 없는 웹앱에 1시간짜리 열쇠(access token)만 준다. 그래서 두 겹으로:
   ① 오래 가는 열쇠 (2026-10-09 사용자 요청 "1시간 넘게 쉬었다 열 때 한 번 누르기까지 없애줘"):
      처음 한 번 '코드' 방식으로 로그인 → 내 작은 서버(tools/auth_worker — 클라우드플레어 워커)가 구글에서 오래 가는 열쇠(refresh token)를 받아
      서버만 아는 비밀로 잠근 봉투(blob)로 돌려준다 → 이 기기에 봉투만 둔다 ('ml.rt'). 열쇠가 끝나면 봉투를 서버에 보내 새 1시간 열쇠를 조용히 받는다
      (누르지 않아도 — 팝업이 아니라 그냥 요청이라 브라우저가 막지 않는다). 클라이언트 비밀 · 봉투 비밀은 서버에만, 열쇠 범위는 지금과 같은 drive.file.
   ② 서버를 못 쓰면 예전 방식: 1시간 열쇠를 기기에 두고, 끝나기 10분 전부터 화면을 누르는 순간 조용히 새로 받는다.
   끊으려면: 구글 계정 → 보안 → 내 계정에 액세스할 수 있는 앱 → 'mylibrary' 액세스 삭제 (모든 기기의 봉투가 쓸모없어진다). */
const AUTH_URL = "https://mylibrary-auth.caesarosler.workers.dev";   // 빈 값이면 ② 만
const TK = 'ml.tok', MK = 'ml.mail', RK = 'ml.rt';
const store = {get: k => { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch(e){ return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} }};
let TOKEN = null, tokenClient = null, codeClient = null, tokenWait = null, renewing = null;
try { const s = JSON.parse(store.get(TK) || 'null'); if (s && s.exp > Date.now() + 60000) TOKEN = s; } catch(e){}
if (location.hostname === 'localhost' && /[?&]expire=1/.test(location.search)){ TOKEN = null; store.set(TK, null); }   // 시험: 1시간 열쇠가 끝난 척 → 봉투만으로 열리는지 (이 PC 의 시험 주소에서만)
function keep(access, sec){ TOKEN = {v: access, exp: Date.now() + (sec - 60) * 1000}; store.set(TK, JSON.stringify(TOKEN)); return TOKEN.v; }
const canRenew = () => !!(AUTH_URL && store.get(RK));
async function post(path, body){
  const r = await fetch(AUTH_URL + path, {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify(body)});   // text/plain: 미리 묻는 요청(preflight) 없이
  return r.json().catch(() => ({error: 'bad_response'}));
}
function renew(){   // 봉투로 새 1시간 열쇠 — 누르지 않아도 된다
  if (!canRenew()) return Promise.reject(new Error('login'));
  return renewing ||= post('/refresh', {blob: store.get(RK)}).then(j => {
    if (j.access_token) return keep(j.access_token, j.expires_in);
    if (j.error === 'invalid_grant' || j.error === 'bad_blob') store.set(RK, null);   // 액세스를 끊었거나 봉투가 상함 → 다음엔 새로 로그인
    throw new Error('login');
  }, () => { throw new Error('login'); }).finally(() => { renewing = null; });
}
function initGis(){
  if (tokenClient || !window.google?.accounts?.oauth2) return !!tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({client_id: CLIENT_ID, scope: SCOPE, hint: store.get(MK) || undefined, callback: r => {
    const w = tokenWait; tokenWait = null;
    if (r.error){ w?.rej(new Error(r.error)); return; }
    w?.res(keep(r.access_token, r.expires_in));
  }, error_callback: e => { const w = tokenWait; tokenWait = null; w?.rej(new Error(e?.type === 'popup_closed' ? 'popup_closed' : 'login')); }});
  if (AUTH_URL) codeClient = google.accounts.oauth2.initCodeClient({client_id: CLIENT_ID, scope: SCOPE, ux_mode: 'popup', select_account: false, login_hint: store.get(MK) || undefined,
    callback: async r => {
      const w = tokenWait; tokenWait = null;
      if (r.error){ w?.rej(new Error(r.error)); return; }
      const j = await post('/exchange', {code: r.code}).catch(() => ({}));
      if (!j.access_token){ w?.rej(new Error('로그인하지 못했어요 — 다시 눌러 주세요')); return; }
      if (j.blob) store.set(RK, j.blob);
      else if (j.need_consent && typeof toast === 'function') toast('로그인 유지를 켜지 못했어요 — 구글 계정 › 보안 › 액세스 권한이 있는 앱에서 mylibrary 를 한 번 지운 뒤 다시 로그인해 주세요');
      w?.res(keep(j.access_token, j.expires_in));
    }, error_callback: e => { const w = tokenWait; tokenWait = null; w?.rej(new Error(e?.type === 'popup_closed' ? 'popup_closed' : 'login')); }});
  return true;
}
// 처음 로그인: 서버가 있으면 코드 방식(동의 화면을 한 번 — 그래야 구글이 오래 가는 열쇠를 준다), 없으면 예전 방식
const askToken = () => new Promise((res, rej) => { tokenWait = {res, rej}; codeClient ? codeClient.requestCode() : tokenClient.requestAccessToken({prompt: ''}); });
function token(interactive){
  if (TOKEN && TOKEN.exp > Date.now()) return Promise.resolve(TOKEN.v);
  if (canRenew()) return renew().catch(e => interactive && initGis() ? askToken() : Promise.reject(e));
  if (!interactive) return Promise.reject(new Error('login'));
  if (!initGis()) return Promise.reject(new Error('구글 로그인을 불러오지 못했어요 — 잠시 뒤 다시 눌러 주세요'));
  return askToken();
}
// 끝나기 전에 미리: 봉투가 있으면 1분마다 보고 5분 남으면 조용히, 없으면 예전처럼 누르는 순간에
setInterval(() => { if (TOKEN && TOKEN.exp - Date.now() < 300000 && canRenew()) renew().catch(() => {}); }, 60000);
addEventListener('pointerdown', () => { if (!canRenew() && TOKEN && TOKEN.exp - Date.now() < 600000 && !tokenWait && initGis()) tokenClient.requestAccessToken({prompt: ''}); }, true);
// 빨리 열리게 (2026-10-09 사용자 "예전보다 처음에 좀 느린 것 같아" — 서버 왕복 0.2~0.3초 + 구글 0.1~0.7초):
// 페이지가 다 그려지기를 기다리지 않고, 이 코드가 읽히는 순간 새 열쇠를 받으러 간다 (화면 그리기 · 다른 파일 받기와 동시에).
// 나중에 화면이 token() 을 부르면 이미 가고 있는 그 요청(renewing)을 함께 기다린다. 곧 끝날 열쇠는 지금 것으로 열고 뒤에서 미리 바꾼다.
if (canRenew() && (!TOKEN || TOKEN.exp - Date.now() < 300000)) renew().catch(() => {});
// 휴대폰에서 앱을 내려 두었다가 다시 올리면 (화면이 다시 보일 때) 열쇠가 끝났거나 곧 끝나면 바로 새로
addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && canRenew() && (!TOKEN || TOKEN.exp - Date.now() < 300000)) renew().catch(() => {}); });
async function retryAfter401(){ TOKEN = null; store.set(TK, null); if (!canRenew()) return false; try { await renew(); return true; } catch(e){ return false; } }

/* ---------- 드라이브 읽기 빠르게 (2026-10-09 사용자 "그래도 느린데" — 열 때마다 기기 파일 7개 · 3.6MB 를 전부 받고 있었다) ----------
   · 동기화 폴더 id 를 기억한다 (매번 찾지 않게). 폴더 안에 기기 파일이 하나도 안 보이면 (지웠다 다시 만든 폴더 등) 잊고 다시 찾는다
   · 기기 파일은 드라이브의 판 번호(version)가 같으면 이 기기에 둔 사본(Cache 저장소)을 쓴다 — 바뀐 파일만 내려받는다 */
const FK = 'ml.fid:' + FOLDER;
async function folderId(lookup, fresh){
  if (!fresh){ const c = store.get(FK); if (c) return c; }
  const id = await lookup();
  if (id) store.set(FK, id);
  return id;
}
async function devData(x){
  const base = 'https://ml.cache/' + x.id + '/', key = base + (x.version || '');
  let c = null;
  try { c = await caches.open('ml-dev'); const hit = x.version && await c.match(key); if (hit) return await hit.json(); } catch(e){ c = null; }
  const text = await (await api(`files/${x.id}?alt=media`)).text();
  if (c && x.version) try {
    for (const k of await c.keys()) if (k.url.startsWith(base)) await c.delete(k);
    await c.put(key, new Response(text, {headers: {'Content-Type': 'application/json'}}));
  } catch(e){}
  return JSON.parse(text);
}

/* ---------- 지난번 내용을 먼저 보여 주기 (2026-10-09 사용자 "더 빨라질 방법" ① — 카카오톡처럼 열자마자 지난 화면, 최신은 뒤에서) ----------
   load() 가 기기 파일 목록(id · 이름 · 판 번호)을 기억하고, 그 판의 사본이 모두 이 기기(Cache 저장소)에 있으면 네트워크 없이 그것으로 먼저 연다.
   저장은 언제나 드라이브를 다시 읽고 합친 뒤에 하므로(postDataNow · save 의 load()), 먼저 보여 준 지난 내용 위에서 고쳐도 다른 기기 것을 덮지 않는다. */
const LK = 'ml.devs:' + FOLDER;
function rememberList(list){ store.set(LK, JSON.stringify(list.map(x => ({id: x.id, name: x.name, version: x.version})))); }
async function quickDevs(){
  try {
    const list = JSON.parse(store.get(LK) || 'null');
    if (!list?.length || !store.get(FK)) return null;
    const c = await caches.open('ml-dev'), out = [];
    for (const x of list){
      const hit = await c.match('https://ml.cache/' + x.id + '/' + x.version);
      if (!hit) return null;
      out.push({...x, data: await hit.json()});
    }
    return out;
  } catch(e){ return null; }
}
   // 구글 로그인 — tools/web_auth.js (build_web.py 가 끼워 넣는다, 책장 웹판과 같은 코드)
async function rememberMail(){   // 다음 로그인 때 계정 고르기를 건너뛰도록 (이 기기에만)
  if (store.get(MK)) return;
  try { const j = await (await api('about?fields=user(emailAddress)')).json(); if (j.user?.emailAddress) store.set(MK, j.user.emailAddress); } catch(e){}
}
async function api(path, opt = {}){
  let t;
  try { t = await token(false); } catch(e){ gate('로그인 시간이 지났어요 — 다시 열면 쓰던 것을 이어서 저장합니다'); throw new Error('다시 로그인해 주세요'); }
  const r = await origFetch(path.startsWith('http') ? path : 'https://www.googleapis.com/drive/v3/' + path, {...opt, headers: {...(opt.headers || {}), Authorization: 'Bearer ' + t}});
  if (r.status === 401){ if (!opt._again && await retryAfter401()) return api(path, {...opt, _again: 1}); gate('로그인 시간이 지났어요 — 다시 열면 쓰던 것을 이어서 저장합니다'); throw new Error('다시 로그인해 주세요'); }
  if (!r.ok) throw new Error('드라이브 오류 ' + r.status);
  return r;
}
const q = s => encodeURIComponent(s);
async function listAll(query, fields){
  const out = []; let tok = '';
  do {
    const j = await (await api(`files?q=${q(query)}&fields=nextPageToken,files(${fields})&pageSize=1000${tok ? '&pageToken=' + q(tok) : ''}`)).json();
    out.push(...(j.files || [])); tok = j.nextPageToken || '';
  } while (tok);
  return out;
}
async function upload(name, parent, parts, mime, fileId){
  const bd = 'ml' + Math.random().toString(36).slice(2);
  const meta = fileId ? {} : {name, parents: [parent]};
  const body = new Blob([`--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: ${mime}\r\n\r\n`, ...parts, `\r\n--${bd}--`]);
  return (await api(`https://www.googleapis.com/upload/drive/v3/files${fileId ? '/' + fileId : ''}?uploadType=multipart&fields=id`, {method: fileId ? 'PATCH' : 'POST', headers: {'Content-Type': 'multipart/related; boundary=' + bd}, body})).json();
}

/* ---------- 동기화 규칙 (sync.py 와 같게) ---------- */
// json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False) 와 같은 글자로
const js = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(js).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + js(v[k])).join(',') + '}';
async function h(s){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 24); }
const newer = (a, b) => !b || a.t > b.t || (a.t === b.t && a.d > b.d);
const W = {fid: null, files: {}, win: {}, clock: 0, base: {}, gen: 1, at: 0, imgDir: null, imgIds: null};

async function load(){
  const lookup = async () => {
    const f = await listAll(`name = '${FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, 'id');
    if (!f.length) throw new Error('드라이브에 동기화 폴더가 없어요 — PC 의 설정에서 동기화를 먼저 켜 주세요');
    return f[0].id;
  };
  if (!W.fid) W.fid = await folderId(lookup);
  const devList = () => listAll(`'${W.fid}' in parents and trashed = false and name contains 'dev_'`, 'id,name,version');
  let list = await devList();
  if (!list.length){ W.fid = await folderId(lookup, true); list = await devList(); }   // 기억한 폴더가 비었으면 (지웠다 다시 만듦) 다시 찾기
  const devs = await Promise.all(list.map(async x => ({...x, data: await devData(x)})));   // 바뀐 파일만 내려받는다
  rememberList(list);
  useDevs(devs);
  W.at = Date.now();
}
function useDevs(devs){
  W.files = {}; W.win = {}; W.clock = 0;
  for (const x of devs){
    W.files[x.name] = x.id;
    for (const [k, e] of Object.entries(x.data.recs || {})){
      W.clock = Math.max(W.clock, e.t || 0);
      if (newer(e, W.win[k])) W.win[k] = e;   // 모든 기록 (책장 · 다른 방도) — 내 파일에 함께 남긴다
    }
  }
}
async function writeMine(){
  const recs = {};
  for (const [k, e] of Object.entries(W.win)) recs[k] = e.x ? {h: e.h || '', t: e.t, d: e.d, x: 1} : {h: e.h, t: e.t, d: e.d, v: e.v};
  const name = `dev_${ME}.json`, body = JSON.stringify({device: ME, name: MYNAME, at: nowS(), recs});
  const r = await upload(name, W.fid, [body], 'application/json', W.files[name]);
  if (!W.files[name]) W.files[name] = r.id;
}
// 방 파일 ↔ 기록 (나의도서관.pyw room_split · room_join — top · strip 까지)
function split(sync, d){
  const recs = {};
  if (sync.top){ for (const [k, v] of Object.entries(d || {})) recs['day/' + k] = js(v); return recs; }
  const strip = sync.strip || [];
  for (const [k, v] of Object.entries(d || {})){
    if (sync.local.includes(k)) continue;
    if (sync.lists.includes(k) && Array.isArray(v) && v.every(x => x && typeof x === 'object' && !Array.isArray(x) && x.id != null)){
      for (const x of v){ const y = {...x}; for (const f of strip) delete y[f]; recs[`${k}/${x.id}`] = js(y); }
      recs[`${k}/@order`] = js(v.map(x => String(x.id)));
    } else if (sync.dicts.includes(k) && v && typeof v === 'object' && !Array.isArray(v)){
      for (const [kk, vv] of Object.entries(v)) recs[`${k}/${kk}`] = js(vv);
    } else recs['meta/' + k] = js(v);
  }
  return recs;
}
function join(sync, recs, local){
  if (sync.top){ const d = {}; for (const [key, v] of Object.entries(recs)) if (key.startsWith('day/')) d[key.slice(4)] = JSON.parse(v); return d; }
  const d = {}, had = new Set(Object.keys(local || {})), lists = {};
  for (const k of sync.local) if (local && k in local) d[k] = local[k];
  for (const k of sync.lists) lists[k] = {};
  for (const k of sync.dicts) if (had.has(k) || Object.keys(recs).some(x => x.startsWith(k + '/'))) d[k] = {};
  for (const [key, v] of Object.entries(recs)){
    const i = key.indexOf('/'), head = i < 0 ? key : key.slice(0, i), rest = i < 0 ? '' : key.slice(i + 1);
    if (head === 'meta') d[rest] = JSON.parse(v);
    else if (head in lists && rest !== '@order') lists[head][rest] = JSON.parse(v);
    else if (sync.dicts.includes(head)) d[head][rest] = JSON.parse(v);
  }
  for (const [k, items] of Object.entries(lists)){
    const ids = Object.keys(items);
    if (!ids.length && (k in d || (!had.has(k) && !(`${k}/@order` in recs)))) continue;
    const order = JSON.parse(recs[`${k}/@order`] || '[]');
    d[k] = order.filter(i => i in items).map(i => items[i]).concat(ids.filter(i => !order.includes(i)).sort().map(i => items[i]));
    if ((sync.strip || []).length){   // 기기마다 두는 칸(포스트잇 자리)은 이 화면의 것을 되돌려 놓는다
      const mine = new Map(((local || {})[k] || []).filter(x => x && typeof x === 'object').map(x => [String(x.id), x]));
      for (const x of d[k]){ const old = mine.get(String(x.id)); if (old) for (const f of sync.strip) if (f in old) x[f] = old[f]; }
    }
  }
  return d;
}
const fix = (name, d) => roomFix(d, name);   // 방마다 맞추기 (저널: 같은 번호 둘 → journal_fix)
// 내용은 이 브라우저의 글자 모양으로 맞춰 둔다 (파이썬이 쓴 1.0 과 여기서 쓰는 1 처럼 같은 값이 다른 글자여서 '고침'으로 보이지 않게)
const norm = s => { try { return js(JSON.parse(s)); } catch(e){ return s; } };
const roomRecs = name => { const P = ST(name).prefix, r = {}; for (const [k, e] of Object.entries(W.win)) if (k.startsWith(P) && !e.x && e.v != null) r[k.slice(P.length)] = norm(e.v); return r; };
const snapWin = name => { const P = ST(name).prefix, s = {}; for (const [k, e] of Object.entries(W.win)) if (k.startsWith(P)) s[k.slice(P.length)] = {t: e.t, d: e.d}; return s; };
// 저장소의 지금 판 표시 (화면이 스스로 다시 읽는 방 — 할일의 ETag): 기록 글자의 지문
const storeTag = name => { let x = 2166136261; const t = js(roomRecs(name)); for (let i = 0; i < t.length; i++){ x ^= t.charCodeAt(i); x = Math.imul(x, 16777619); } return 'w' + (x >>> 0).toString(36) + t.length.toString(36); };

/* 3-way 병합 (sync.py three_way · merge_value 와 같은 규칙) */
const NONE = Symbol('none');
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const eq = (a, b) => js(a) === js(b);
function threeWay(k, base, mine, theirs){
  let a, b, o;
  try {
    a = JSON.parse(mine); b = JSON.parse(theirs);
    const sameNew = isObj(a) && isObj(b) && a.id != null && a.id === b.id;
    o = base != null ? JSON.parse(base) : (k.startsWith('meta/') && isObj(a)) || sameNew ? {} : null;
  } catch(e){ return null; }
  if (o === null) return null;
  const r = mergeValue(o, a, b, true);
  return r === NONE ? null : js(r);
}
function mergeValue(o, a, b, aNewer, field = ''){
  if (eq(a, b)) return a;
  if (o !== NONE && eq(a, o)) return b;
  if (o !== NONE && eq(b, o)) return a;
  if (isObj(a) && isObj(b)) return mergeObj(isObj(o) ? o : {}, a, b, aNewer);
  if (typeof a === 'string' && typeof b === 'string' && (TEXT_FIELDS.has(field) || a.includes('\n') || b.includes('\n'))){
    const r = mergeText(typeof o === 'string' ? o : '', a, b); return r === null ? NONE : r;
  }
  const idl = x => Array.isArray(x) && x.every(e => isObj(e) && e.id != null) && new Set(x.map(e => String(e.id))).size === x.length;
  if (idl(a) && idl(b) && (o === NONE || idl(Array.isArray(o) ? o : []))) return mergeIdlist(Array.isArray(o) ? o : [], a, b, aNewer);
  if (Array.isArray(a) && Array.isArray(b) && [...a, ...b, ...(Array.isArray(o) ? o : [])].every(x => typeof x === 'string' || isObj(x))) return mergeBag(Array.isArray(o) ? o : [], a, b);
  if (field === 'updated' && typeof a === 'string' && typeof b === 'string') return a > b ? a : b;
  return aNewer ? a : b;
}
// 함께 움직여야 하는 칸 묶음: 암기카드의 복습 일정 — 두 기기에서 같은 카드를 따로 복습했으면 칸마다 섞지 않고(간격은 A, 날짜는 B 처럼 엉터리가 되므로)
// 마지막으로 복습한(last 가 큰) 쪽의 일정을 통째로 쓴다 (sync.py SRS · merge_obj 와 같게). 복습 기록(log)은 따로 둘 다 남는다
const SRS = ['state', 'due', 'ivl', 'ease', 'step', 'reps', 'lapses', 'last'];
const num0 = x => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
function mergeObj(o, a, b, aNewer){
  const out = {}, done = new Set();
  if ('last' in a && 'last' in b && 'ivl' in a && 'ivl' in b){
    const g = x => js(SRS.map(f => f in x ? x[f] : '\u0000none')), ga = g(a), gb = g(b), go = g(o);
    if (ga !== go && gb !== go && ga !== gb){
      const win = num0(a.last) > num0(b.last) || (num0(a.last) === num0(b.last) && aNewer) ? a : b;
      for (const f of SRS) if (f in win) out[f] = win[f];
      SRS.forEach(f => done.add(f));
    }
  }
  const fields = [...Object.keys(a), ...Object.keys(b).filter(x => !(x in a)), ...Object.keys(o).filter(x => !(x in a) && !(x in b))];
  for (const f of fields){
    if (done.has(f)) continue;
    const av = f in a ? a[f] : NONE, bv = f in b ? b[f] : NONE, ov = f in o ? o[f] : NONE;
    if (av === NONE || bv === NONE){
      if (av === NONE && bv === NONE) continue;
      const have = av === NONE ? bv : av;
      if (ov === NONE) out[f] = have;
      else if (!eq(have, ov)) return NONE;
      continue;
    }
    const v = mergeValue(ov, av, bv, aNewer, f);
    if (v === NONE) return NONE;
    out[f] = v;
  }
  return out;
}
function mergeIdlist(o, a, b, aNewer){
  const m = x => new Map(x.map(e => [String(e.id), e])), O = m(o), A = m(a), B = m(b), out = [];
  for (const i of [...A.keys(), ...[...B.keys()].filter(x => !A.has(x))]){
    const ov = O.has(i) ? O.get(i) : NONE, av = A.has(i) ? A.get(i) : NONE, bv = B.has(i) ? B.get(i) : NONE;
    if (av === NONE || bv === NONE){
      const have = av === NONE ? bv : av;
      if (ov === NONE) out.push(have); else if (!eq(have, ov)) return NONE;
      continue;
    }
    const v = mergeValue(ov, av, bv, aNewer); if (v === NONE) return NONE; out.push(v);
  }
  return out;
}
function mergeBag(o, a, b){
  const key = x => typeof x === 'string' ? x : js(x);
  const ko = new Set(o.map(key)), ka = new Set(a.map(key)), kb = new Set(b.map(key));
  const gone = new Set([...ko].filter(x => !ka.has(x) || !kb.has(x))), out = [], seen = new Set();
  for (const x of [...a, ...b]){ const k = key(x); if (!gone.has(k) && !seen.has(k)){ out.push(x); seen.add(k); } }
  return out;
}
// 줄 단위 3-way (diff3): 조상과 비교해 고친 곳이 겹치지 않으면 둘 다
function lines(s){ return s.match(/[^\n]*\n|[^\n]+$/g) || []; }
function hunks(O, X, side){
  const n = O.length, m = X.length, L = Array.from({length: n + 1}, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = O[i] === X[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0, si = 0, sj = 0;
  const flush = () => { if (si < i || sj < j) out.push([si, i, X.slice(sj, j), side]); };
  while (i < n || j < m){
    if (i < n && j < m && O[i] === X[j]){ flush(); i++; j++; si = i; sj = j; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) j++;
    else i++;
  }
  flush();
  return out;
}
function mergeText(o, a, b){
  const O = lines(o), hs = [...hunks(O, lines(a), 'a'), ...hunks(O, lines(b), 'b')].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = []; let pos = 0, i = 0;
  while (i < hs.length){
    let g = [hs[i]]; const s = hs[i][0]; let end = hs[i][1]; i++;
    while (i < hs.length && (hs[i][0] < end || (hs[i][0] === end && (hs[i][0] === hs[i][1] || s === end)))){ g.push(hs[i]); end = Math.max(end, hs[i][1]); i++; }
    if (new Set(g.map(x => x[3])).size === 2){
      if (g.length === 2 && g[0][0] === g[1][0] && g[0][1] === g[1][1] && g[0][2].join('') === g[1][2].join('')) g = g.slice(0, 1);
      else return null;
    }
    for (const [i1, i2, rep] of g){ out.push(...O.slice(pos, i1), ...rep); pos = i2; }
  }
  out.push(...O.slice(pos));
  return out.join('');
}
// 합치지 못한 그쪽 판은 버리지 않고 드라이브 동기화 폴더에 따로 둔다 (PC 의 data/동기화_충돌 과 같은 뜻)
async function park(P, key, val){
  const name = `웹충돌_${nowS().replace(/[-:T]/g, '')}_${(P + key).replace(/[^0-9A-Za-z가-힣_.-]/g, '_')}`.slice(0, 120) + '.json';
  try { await upload(name, W.fid, [val], 'application/json'); return name; } catch(e){ return ''; }
}

/* ---------- api/data (저장소마다) ---------- */
async function getData(name = 'data'){
  await READY;
  const recs = roomRecs(name), d = join(ST(name).sync, recs, {});
  W.base[name] = {recs, win: snapWin(name)};
  return fix(name, d);
}
let busy = Promise.resolve();
// keep: 화면이 돌려준 합친 판(db)을 받아 쓰지 않고 제 판을 들고 있는 방(할일 — ETag 를 보고 나중에 다시 읽는다).
//       그때는 '화면이 아는 판' = 화면이 보낸 것을 조상으로 둔다 — 합친 것을 조상으로 두면, 화면이 아직 모르는 다른 기기의 기록을 다음 저장 때 '화면이 지웠다'로 잘못 본다
function postData(page, name = 'data', keep = false){ const p = busy.then(() => postDataNow(name, page, keep)); busy = p.catch(() => {}); return p; }
async function postDataNow(name, page, keep){
  await READY;
  await load();
  const st = ST(name), P = st.prefix, sync = st.sync;
  if (!W.base[name]) W.base[name] = {recs: roomRecs(name), win: snapWin(name)};   // 읽은 적 없이 저장 — 지금 것을 조상으로
  const mine = split(sync, page), B = W.base[name].recs, BW = W.base[name].win, kept = [];
  let clock = Math.max(Date.now(), W.clock + 1), wrote = 0;
  for (const k of new Set([...Object.keys(mine), ...Object.keys(B)])){
    if (mine[k] === B[k]) continue;   // 이 화면에서 고치지 않은 기록
    const cur = W.win[P + k], bw = BW[k], curV = cur && !cur.x ? norm(cur.v) : undefined;
    const moved = !!cur && (!bw || cur.t !== bw.t || cur.d !== bw.d);   // 내가 받은 뒤 다른 기기에서 바뀜
    let out = mine[k];
    if (moved && curV !== out){
      if (out === undefined){ if (curV !== undefined) out = curV; }   // 나는 지웠는데 그쪽은 고침 → 지우지 않고 그쪽 것을 남긴다 (기록은 지우지 않는다)
      else if (curV !== undefined){
        const r = threeWay(k, B[k], out, curV);
        if (r != null) out = r; else kept.push(await park(P, k, curV));   // 겹쳐서 못 합침 → 내 것을 쓰고 그쪽 것은 보관
      }
    }
    if (out === curV) continue;
    if (out === undefined){ if (cur && !cur.x){ W.win[P + k] = {h: '', t: clock++, d: ME, x: 1}; wrote++; } }
    else { W.win[P + k] = {h: await h(out), t: clock++, d: ME, v: out}; wrote++; }
  }
  W.clock = clock;
  if (wrote) await writeMine();
  const recs = roomRecs(name), joined = join(sync, recs, page);
  W.base[name] = {recs: keep ? mine : recs, win: snapWin(name)};
  const d = fix(name, JSON.parse(JSON.stringify(joined)));
  W.gen++;
  if (kept.length) toast(`다른 기기에서 같은 곳을 고친 기록이 있어 내 것을 저장하고, 그쪽 것은 드라이브 '${FOLDER}' 폴더에 따로 보관했어요 (${kept.filter(Boolean).length}건)`);
  const same = js(split(sync, d)) === js(mine);
  return same ? {gen: W.gen} : {gen: W.gen, db: d};   // db = 다른 기기 것과 합쳐져 화면 것과 달라짐
}
// 다른 기기에서 바뀐 것을 받아 화면에 (쓰는 중 · 저장 대기 중이면 기다린다)
// ROOM_POLLS 인 방(할일)은 화면이 판 표시(ETag)를 보고 스스로 다시 읽으므로 드라이브만 새로 읽어 둔다.
// 화면이 window.webPage = {ok(), db(), adopt(d), retry()} 를 두면 그것으로 (휴대폰 화면 m.html), 없으면 방 몫(큰 화면)의 것으로
async function refresh(){
  try {
    if (ROOM_POLLS){ await busy; await load(); return; }
    const pg = window.webPage;
    if (pg){ if (!pg.ok()) return; }
    else if (!roomCanAdopt()) return;
    await busy; await load();
    const recs = roomRecs('data');
    if (js(recs) === js(W.base.data.recs)) return;
    W.base.data = {recs, win: snapWin('data')};
    const sync = ST('data').sync;
    if (pg){ pg.adopt(fix('data', join(sync, recs, pg.db()))); return; }
    roomAdopt(fix('data', join(sync, recs, roomDb())));
  } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && W.at && Date.now() - W.at > 60000) refresh(); });
setInterval(() => { if (!document.hidden && W.at && Date.now() - W.at > 120000) refresh(); }, 30000);

const jres = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), {status, headers: {'Content-Type': 'application/json', ...headers}});

/* 암기카드의 몫 (tools/web_shim_core.js 안에 들어간다) — 2026-10-08
   · api/data     공통 부분 — 암기카드 화면은 저장한 뒤 합친 판을 받아 쓰지 않으므로 조상 = 화면이 보낸 판(keep), 다른 기기 것은 refresh 가 넣어 준다.
                  두 기기가 같은 카드를 따로 복습했으면 복습 일정은 마지막으로 복습한 쪽을 통째로 (공통 부분의 SRS), 복습 기록(log)은 둘 다.
                  책장 · 마인드맵에서 가져온 같은 카드 · 덱이 둘이 되면 하나로 (roomFix = 나의도서관.pyw cards_fix 와 같은 규칙)
   · api/config   밝기 · 포인트 색 — 이 기기 브라우저에. 화면은 그리기 전에 window.__CFG 를 읽으므로 여기서 미리 넣어 둔다
   책장 · 마인드맵의 '질문 :: 답' 가져오기는 도서관 창 안(window.__EMBED)에서만 — 웹판에서는 하지 않는다 (화면이 스스로 건너뛴다) */
const ROOM_POLLS = false;
const CCFG = 'ml.c.cfg';
function ccfg(){ let c = {}; try { c = JSON.parse(ls.get(CCFG, '{}')) || {}; } catch(e){} return {theme: ['light', 'dark', 'auto'].includes(c.theme) ? c.theme : 'auto', accent: ['blue', 'green', 'purple'].includes(c.accent) ? c.accent : 'purple'}; }
window.__CFG = {...ccfg(), fullscreen: false, native: false};

// 같은 출처(link)에서 가져온 카드 · 덱이 둘이 됐으면 먼저 만든 것만 (cards_fix)
function roomFix(d){
  const decks = d.decks || [], cards = d.cards || [], log = d.log || [];
  const order = (a, b) => num0(a.created) - num0(b.created) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const deckTo = {}, keepDecks = [];
  for (const k of [...decks].sort(order)){
    const key = k && k.link, first = key && keepDecks.find(x => x.link === key);
    if (first) deckTo[k.id] = first.id; else keepDecks.push(k);
  }
  const cardTo = {}, keepCards = [];
  for (const c of [...cards].sort(order)){
    const key = c && c.link && c.link.key, first = key && keepCards.find(x => x.link && x.link.key === key);
    if (first){
      cardTo[c.id] = first.id;
      if (num0(c.last) > num0(first.last)) for (const f of SRS) if (f in c) first[f] = c[f];   // 더 최근에 복습한 쪽의 일정
    } else keepCards.push(c);
  }
  if (!Object.keys(deckTo).length && !Object.keys(cardTo).length) return d;
  const keep = new Set(keepCards);
  d.cards = cards.filter(c => keep.has(c));   // 원래 순서 그대로
  d.decks = decks.filter(k => !(k.id in deckTo));
  for (const c of d.cards) if (c.deck in deckTo) c.deck = deckTo[c.deck];
  for (const e of log) if (e && typeof e === 'object'){ if (e.c in cardTo) e.c = cardTo[e.c]; if (e.d in deckTo) e.d = deckTo[e.d]; }
  return d;
}

/* ---------- 큰 화면(apps/cards.html)의 전역 값으로 ---------- */
function roomDb(){ return db; }
function roomCanAdopt(){   // 저장 대기 · 공부 중 · 카드 쓰는 중 · 입력 중이면 기다린다
  if (typeof db === 'undefined' || !db || saveT || view === 'study' || view === 'add') return false;
  const a = document.activeElement; if (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) return false;
  return js(split(ST('data').sync, db)) === js((W.base.data || {}).recs);
}
function roomAdopt(d){ db = Object.assign({version: 1, decks: [], cards: [], log: []}, d); rerender(); }
function roomResume(){ if (typeof db !== 'undefined' && db && js(split(ST('data').sync, db)) !== js((W.base.data || {}).recs)){ flush(); return true; } return false; }

async function roomRoute(ep, method, init, body, query){
  if (ep === 'data' && method !== 'GET'){ await postData(body(), 'data', true); return jres({ok: true}); }   // keep: 화면이 합친 판을 받아 쓰지 않는다
  if (ep === 'config'){
    if (method === 'GET') return jres({...ccfg(), fullscreen: false, native: false});
    const b = body(), c = ccfg();
    if (['light', 'dark', 'auto'].includes(b.theme)) c.theme = b.theme;
    if (['blue', 'green', 'purple'].includes(b.accent)) c.accent = b.accent;
    ls.set(CCFG, JSON.stringify(c)); window.__CFG = {...window.__CFG, ...c}; return jres({ok: true});
  }
  return null;
}


/* ---------- api/… 부탁 받기 ---------- */
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const m = /^\/?api\/([^?]*)(?:\?(.*))?$/.exec(url);
  if (!m) return origFetch(input, init);
  const ep = m[1], method = (init.method || 'GET').toUpperCase(), body = () => JSON.parse(init.body || '{}');
  const r = await roomRoute(ep, method, init, body, m[2] || '');
  if (r) return r;
  if (ep === 'data'){
    if (method === 'GET') return jres(await getData(), 200, {'X-Gen': String(W.gen)});
    return jres(await postData(body()));
  }
  if (ep === 'window') return jres({ok: false, error: '웹에서는 쓸 수 없어요'});
  return new Response('null', {status: 404, headers: {'Content-Type': 'application/json'}});   // 백업 상태 등 — PC 프로그램에만 있는 것
};

/* ---------- 처음 화면 (구글 로그인) ---------- */
let readyRes; const READY = new Promise(r => readyRes = r);
function toast(m){ if (typeof window.toast === 'function' && window.toast !== toast) return window.toast(m); }
function gate(msg){
  let g = document.getElementById('webgate');
  if (!g){
    const st = document.createElement('style');
    st.textContent = `#webgate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:#120e0a;color:#efe4d0;
      font:15px/1.55 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI","Malgun Gothic",sans-serif;letter-spacing:-.011em;-webkit-font-smoothing:antialiased}
      #webgate .in{text-align:center;padding:0 24px;max-width:420px}#webgate h1{font-size:22px;margin:0 0 6px;font-weight:700}#webgate p{color:#a59580;margin:0 0 22px;font-size:13px}
      #webgate button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:10px 18px;background:#e9a95a;color:#1f1812;cursor:pointer}
      #webgate .msg{color:#ff7b6b;margin-top:14px;font-size:13px;min-height:1.5em}#webgate a{color:#a59580;font-size:13px;display:inline-block;margin-top:18px}`;
    document.head.appendChild(st);
    g = document.createElement('div'); g.id = 'webgate';
    g.innerHTML = `<div class="in"><h1>${ROOM.title}</h1><p>${ROOM.desc}</p><button id="webgo">구글 계정으로 열기</button><div class="msg" id="webmsg"></div><a href="../">‹ 책장으로</a></div>`;
    document.body.appendChild(g);
    document.getElementById('webgo').onclick = () => start(true);
  }
  g.hidden = false; g.style.display = '';
  document.getElementById('webmsg').textContent = msg || '';
}
let first = true;
async function start(interactive){
  try {
    await token(interactive);
    await load(); rememberMail();
    const g = document.getElementById('webgate'); if (g) g.style.display = 'none';
    if (first){ first = false; readyRes(); }
    else if (window.webPage) window.webPage.retry();
    else if (!roomResume()) refresh();   // 로그인이 끊겨 못 한 저장이 있으면 방 몫이 이어서, 아니면 다른 기기 것 받기
  } catch(e){ gate(e.message === 'login' || e.message === 'popup_closed' ? '' : e.message); }
}
addEventListener('DOMContentLoaded', async () => {
  if (!(TOKEN || canRenew())) return gate('');
  const devs = await quickDevs();
  if (!devs) return start(false);   // 처음 · 사본이 없으면 드라이브에서 (봉투가 있으면 누르지 않고 바로)
  W.fid = store.get(FK); useDevs(devs); W.at = 1;   // 지난번 내용으로 먼저 연다 (W.at 을 오래된 것으로 — 뒤에서 못 받았으면 30초 타이머가 다시)
  first = false; readyRes();
  try {   // 최신은 뒤에서 — 바뀐 게 있으면 화면이 조용히 바뀐다. 화면이 아직 준비 전이면 (refresh 가 그냥 돌아옴 → W.at 그대로) 잠깐 뒤 다시
    await token(false); rememberMail();
    for (let i = 0; i < 6 && W.at === 1; i++){ await new Promise(r => setTimeout(r, i ? 1500 : 300)); await refresh(); }
  }
  catch(e){ if (!TOKEN && !canRenew()) gate('로그인 시간이 지났어요 — 다시 열면 쓰던 것을 이어서 저장합니다'); }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', {scope: '../'}).catch(() => {});   // 웹판을 휴대폰에 저장 (tools/web_sw.js)
window.WEB = {img: typeof img === 'function' ? img : null, voice: typeof voice === 'function' ? voice : null, refresh};   // refresh: 다른 기기에서 바뀐 것을 지금 받기 (시험 · 화면에서)
})();
