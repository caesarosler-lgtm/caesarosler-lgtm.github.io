/* 웹판을 휴대폰에 저장해 두는 일꾼 (서비스 워커, 2026-10-09 사용자 "더 빠르게" ①) — tools/build_web.py 가 web/sw.js 로 만든다.
   · 판(VERSION = 웹판 파일 전체의 지문)마다 모든 파일을 한 묶음으로 저장 → 아이콘을 누르면 인터넷 없이 바로 화면이 뜬다
   · 새 판을 공개하면: 다음에 열 때 휴대폰이 sw.js 가 바뀐 것을 알아채고, 새 판 묶음을 뒤에서 통째로 받아 둔다 → 그다음 열 때부터 새 판
     (한 묶음씩 바꾸므로 옛 화면 + 새 코드가 섞이지 않는다)
   · 다른 주소(구글 드라이브 · 구글 로그인 · 로그인 서버)는 건드리지 않는다. 기기 파일 사본(Cache 'ml-dev')도 건드리지 않는다 */
const VERSION = "d18e109eb52e";
const FILES = ["cards/icon.png", "cards/", "cards/index.html", "cards/shim.js", "english/icon.png", "english/", "english/index.html", "english/shim.js", "icon.png", "", "index.html", "journal/icon.png", "journal/", "journal/index.html", "journal/journal_calc.js", "journal/m.html", "journal/shim.js", "mindmap/icon.png", "mindmap/", "mindmap/index.html", "mindmap/shim.js", "think/icon.png", "think/", "think/index.html", "think/shim.js", "todo/icon.png", "todo/", "todo/index.html", "todo/shim.js", "todo/todo_annual.js", "todo/todo_five.js", "todo/todo_life.js", "todo/todo_monthly.js"];   // 이 sw.js 기준 상대 주소 ('' = 책장, 'cards/' = 방)
const CACHE = 'ml-pages-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(new URL(f, self.registration.scope), {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ml-pages-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || !u.href.startsWith(self.registration.scope)) return;
  const cached = () => caches.open(CACHE).then(c => c.match(r, {ignoreSearch: true}));   // ?folder= · ?expire= 같은 꼬리는 무시하고 같은 화면
  if (location.hostname === 'localhost'){ e.respondWith(fetch(r).catch(() => cached().then(hit => hit || Response.error()))); return; }   // 이 PC 의 시험 주소: 고친 것을 바로 보도록 새로 받고, 안 될 때만 저장본
  e.respondWith(cached().then(hit => hit || fetch(r)));   // 공개 주소: 저장본을 먼저 (새 판은 sw.js 가 바뀌면 뒤에서 통째로)
});
