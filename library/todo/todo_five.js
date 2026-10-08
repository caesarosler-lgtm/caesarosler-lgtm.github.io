/* =====================================================================
   내일의 할일 — 4 5년 계획 (원래 프로그램의 FiveYearPlanWindow, v2.19)
   "5년치의 계획화면을 단축키 4번으로" 요청으로 만든 화면. 한 달이 한 칸이고, 5년이 세로로 5줄 쌓인다.
     - 구간은 고정(2026 부터 5년씩: 2026~2030, 2031~2035 ...)이고 ◀/▶ 는 5년 단위로 움직인다.
     - 장기 목표 막대: 이 화면에서만 만들고/고치고/지운다(진한 색).
     - 그해의 목표: 왼쪽 칸을 두 번 클릭해서 적는다.
     - 연간 계획의 할 일 막대: 옅은 색으로 월 단위로 줄여서 겹쳐 보여주기만 한다(읽기 전용 - 편집은 연간 계획에서).
   연도를 누르면 그해의 연간 계획(3)으로, 오른쪽 클릭 메뉴로 그 달의 월간 계획(2)으로 간다.
   원래는 Tk 캔버스에 그렸다. 여기서는 같은 좌표 계산으로 div 를 놓고, 마우스는 원래처럼 좌표 목록으로 판정한다.
   5개년 계획 차수 화면(todo_life.js)과 같이 쓰는 도구(장기 목표 창, 목표 쓰기 창, 오른쪽 클릭 메뉴...)는 TD.fiveShared 에 둔다.
   ===================================================================== */
(() => {
'use strict';

/* ---------- 원래 프로그램과 같은 값 ---------- */
// 생년월일 · 상징적인 D-day 나이(USER_BIRTH_DATE, USER_SYMBOLIC_DEATH_AGE) — 5개년 계획 차수 화면의 나이/D-day 해에 쓴다
const _LIFE = window.WEB_LIFE || {y: 1990, m: 1, d: 1, age: 57};   // 웹판: 생년월일은 내 드라이브의 비공개 파일에서 (shim) — 읽기 전엔 임시 값
const BIRTH_Y = _LIFE.y, BIRTH_M = _LIFE.m, BIRTH_D = _LIFE.d, DEATH_AGE = _LIFE.age;
const DDAY_CAPTION = 'Days Until I Die';
// v2.19 "고정된 5년 구간": 이 해부터 5년씩 끊는다
const BASE_YEAR = 2026;
// v2.20: 5개년 계획 차수 화면은 이 나이(그해 생일 기준 만 나이)가 들어 있는 차수까지 보여준다
const LIFE_END_AGE = 80;
// 장기 목표 막대 색 이름표(PROJECT_COLOR_PALETTE 순서)
const COLOR_NAMES = ['파랑', '주황', '초록', '빨강', '보라', '청록'];
const PAL = TD.PROJECT_COLOR_PALETTE;
const esc = TD.esc;

/* ---------- 색 (원래 *_LIGHT / *_DARK 값 그대로) ----------
   --tdf-canvas: CANVAS_BG · --tdf-grid: ANNUAL_GRID · --tdf-track: TRACK_BG(지난 달/해) · --tdf-today: MINIMAP_TODAY_BG(이번 달/해)
   --tdf-past: ANNUAL_PLAN_PAST_MONTH_FG(지난 해 글자) · --tdf-sun: MONTHLY_PLAN_SUN_FG(D-day 해 빨강) */
document.head.insertAdjacentHTML('beforeend', `<style>
:root{--tdf-canvas:#ffffff;--tdf-grid:#e2e1ec;--tdf-track:#e7e6f0;--tdf-today:#ecebfb;--tdf-past:#c9c9c9;--tdf-sun:#d0463c}
html[data-theme=dark]{--tdf-canvas:#000000;--tdf-grid:#4a4956;--tdf-track:#26252e;--tdf-today:#2a2950;--tdf-past:#75757b;--tdf-sun:#f07b73}
.tdf-root{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg)}
.tdf-head{display:flex;align-items:center;gap:6px;padding:12px 16px;flex-wrap:wrap}
.tdf-title{font-size:20px;font-weight:700;color:var(--strong);white-space:nowrap}
.tdf-nav{display:flex;align-items:center;gap:4px;margin-left:16px}
.tdf-range{font-size:15px;font-weight:700;min-width:120px;text-align:center;color:var(--strong);font-variant-numeric:tabular-nums}
.tdf-now{font-size:15px;font-weight:700;margin-left:16px;color:var(--strong)}
.tdf-sp{flex:1}
.tdf-tip{padding:0 16px 8px;font-size:12px;color:var(--muted);line-height:1.5}
.tdf-wrap{flex:1;min-height:0;display:flex;padding:0 16px 16px}
.tdf-cv{flex:1;min-width:0;position:relative;overflow-x:hidden;overflow-y:auto;background:var(--tdf-canvas);border:1px solid var(--line);border-radius:10px}
.tdf-in{position:relative;user-select:none;overflow:hidden;font-family:var(--font)}
.tdf-in > div{position:absolute;pointer-events:none;box-sizing:border-box}
.tdf-in .c{border:1px solid var(--tdf-grid)}
.tdf-in .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tdf-in .w{white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;line-height:18px;font-size:13px;color:var(--text)}
.tdf-in .bar{border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tdf-menu{position:fixed;z-index:45;background:var(--canvas);color:var(--text);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:4px;min-width:200px;font-size:13px}
.tdf-mi{padding:6px 12px;border-radius:5px;cursor:pointer;white-space:nowrap}
.tdf-mi:hover{background:var(--accent-weak);color:var(--accent-fg)}
.tdf-menu hr{border:0;border-top:1px solid var(--line);margin:4px 2px}
.tdf-ym{display:flex;align-items:center;gap:6px}
.tdf-sw{display:inline-block;width:18px;height:18px;border-radius:4px}
</style>`);

/* ---------- 같이 쓰는 도구 ---------- */
// 그 해가 들어 있는 고정 5년 구간의 첫 해(_block_start_for)
const blockStartFor = y => BASE_YEAR + 5 * Math.floor((y - BASE_YEAR) / 5);
// 그해 생일에 되는 만 나이(LifePlanWindow._age_in)
const ageIn = y => y - BIRTH_Y;
// D-day 기준일(만 57세 생일)이 있는 해 — 생일이 그 해에 없는 날(2/29)이어도 해는 같다
const deathYear = BIRTH_Y + DEATH_AGE;

// [(s, e, obj), ...] 를 겹치지 않게 레인에 나눠 담는다(_pack_lanes). [(lane, s, e, obj), ...]
function packLanes(items){
  const laneEnds = [], placed = [];
  items.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([s, e, obj]) => {
    let lane = laneEnds.findIndex(last => last < s);
    if (lane < 0){ lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    placed.push([lane, s, e, obj]);
  });
  return placed;
}
// 좌표 판정(_hit): rect = [x0, y0, x1, y1, 값...]
function hit(rects, x, y){ for (const r of rects) if (r[0] <= x && x < r[2] && r[1] <= y && y < r[3]) return r; return null; }
// 글자 폭 재기(Tk 의 font.measure 자리)
const mctx = document.createElement('canvas').getContext('2d');
function measure(text, font){ mctx.font = font + ' ' + getComputedStyle(document.body).fontFamily; return mctx.measureText(text).width; }
// 캔버스 대신 쓰는 div 한 칸
const px = v => (Math.round(v * 100) / 100) + 'px';
function box(x, y, w, h, cls, style, html = ''){ return `<div class="${cls}" style="left:${px(x)};top:${px(y)};width:${px(Math.max(0, w))};height:${px(Math.max(0, h))};${style}">${html}</div>`; }
// 이벤트 좌표 → 그리는 판(스크롤 포함) 안의 좌표
function localXY(inner, e){ const r = inner.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

/* 막대를 클릭해서 창을 띄우면, 빠르게 두 번 누른 두 번째 누름이 창 바깥(어두운 바탕)에 떨어져 창이 바로 닫혀 버린다.
   원래 프로그램은 창이 뜨면 두 번째 클릭을 창이 받았다 — 그래서 창을 띄운 직후 잠깐은 바깥 누름을 무시한다. */
let guardUntil = 0;
const guardModal = () => { guardUntil = performance.now() + 600; };
window.addEventListener('mousedown', e => { if (e.target && e.target.id === 'modal' && performance.now() < guardUntil){ e.stopImmediatePropagation(); e.preventDefault(); } }, true);

/* 오른쪽 클릭 메뉴(원래 tk.Menu 팝업). items: [{label, fn} | '-'] */
let menuEl = null;
function menuOutside(e){ if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function closeMenu(){
  if (!menuEl) return false;
  menuEl.remove(); menuEl = null;
  document.removeEventListener('mousedown', menuOutside, true); window.removeEventListener('blur', closeMenu); window.removeEventListener('resize', closeMenu);
  return true;
}
function popupMenu(items, cx, cy){
  closeMenu();
  const m = document.createElement('div'); m.className = 'tdf-menu';
  items.forEach(it => {
    if (it === '-'){ m.appendChild(document.createElement('hr')); return; }
    const b = document.createElement('div'); b.className = 'tdf-mi'; b.textContent = it.label;
    b.onclick = () => { closeMenu(); it.fn(); };
    m.appendChild(b);
  });
  document.body.appendChild(m); menuEl = m;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(cx, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(cy, innerHeight - r.height - 4)) + 'px';
  document.addEventListener('mousedown', menuOutside, true); window.addEventListener('blur', closeMenu); window.addEventListener('resize', closeMenu);
}

/* 목표 쓰기 창(원래 MonthNoteDialog 를 그해의 목표/차수 목표용으로 쓰던 것).
   label: 굵은 제목 · hint: 안내 문구 · onSave(적은 글자, 앞뒤 빈칸 뺌) — 취소하면 부르지 않는다. Ctrl+Enter: 저장 */
function noteDialog(label, text, hint, onSave){
  TD.modal(`<h3>${esc(label)}</h3><div class="tip">${esc(hint)}</div>
    <textarea id="tdfNote" style="width:min(80vw,520px);min-height:220px">${esc(text || '')}</textarea>
    <div class="bt"><button onclick="TD.closeModal()">취소</button><button class="primary" id="tdfNoteOk">저장</button></div>`);
  const ta = document.getElementById('tdfNote');
  document.getElementById('tdfNoteOk').onclick = () => { const v = ta.value.trim(); TD.closeModal(); onSave(v); };
  document.querySelector('#modal').onkeydown = ev => { if (ev.key === 'Enter' && ev.ctrlKey){ ev.preventDefault(); document.getElementById('tdfNoteOk').click(); } };
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}

/* 장기 목표 창(원래 LongTermGoalDialog). 기간은 월 단위(시작 연·월 ~ 끝 연·월).
   goal 이 없으면 새로 만들기, 있으면 고치기/지우기. onSave({name, start:'YYYY-MM', end, color}) / onDelete() */
function goalDialog({goal = null, defStart = null, defEnd = null, years = null, onSave, onDelete}){
  const now = new Date();
  const ym = (text, fb) => { const m = /^(\d{4})-(\d{2})/.exec(String(text || '')); return m ? [+m[1], +m[2]] : fb; };
  const start = ym(goal && goal.start, defStart || [now.getFullYear(), now.getMonth() + 1]);
  const end = ym(goal && goal.end, defEnd || start);
  const yearVals = (years || [0, 1, 2, 3, 4].map(i => now.getFullYear() + i)).slice();
  for (const y of [start[0], end[0]]) if (!yearVals.includes(y)) yearVals.push(y);
  yearVals.sort((a, b) => a - b);
  const ySel = (id, v) => `<select id="${id}">${yearVals.map(y => `<option value="${y}" ${y === v ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
  const mSel = (id, v) => `<select id="${id}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => `<option value="${m}" ${m === v ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
  const ci = Math.max(0, PAL.indexOf((goal || {}).color));
  TD.modal(`<h3>${goal ? '장기 목표 수정' : '장기 목표 추가'}</h3>
    <div class="fld"><label>목표</label><input type="text" id="tdfGN" value="${esc(goal ? goal.name || '' : '')}" style="width:340px"></div>
    <div class="fld"><label>시작</label><div class="tdf-ym">${ySel('tdfSY', start[0])}년 ${mSel('tdfSM', start[1])}월</div></div>
    <div class="fld"><label>끝</label><div class="tdf-ym">${ySel('tdfEY', end[0])}년 ${mSel('tdfEM', end[1])}월</div></div>
    <div class="fld"><label>색</label><div class="tdf-ym"><select id="tdfGC">${COLOR_NAMES.map((n, i) => `<option value="${i}" ${i === ci ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="tdf-sw" id="tdfSw"></span></div></div>
    <div class="bt">${goal ? '<button class="danger left" id="tdfGDel">삭제</button>' : ''}<button onclick="TD.closeModal()">취소</button><button class="primary" id="tdfGOk">저장</button></div>`);
  const $ = id => document.getElementById(id);
  const sw = () => { $('tdfSw').style.background = PAL[+$('tdfGC').value] || PAL[0]; };
  $('tdfGC').onchange = sw; sw();
  $('tdfGOk').onclick = () => {
    const name = $('tdfGN').value.trim();
    if (!name){ TD.toast('목표를 입력해 주세요.'); $('tdfGN').focus(); return; }
    const s = `${$('tdfSY').value}-${TD.pad2(+$('tdfSM').value)}`, e = `${$('tdfEY').value}-${TD.pad2(+$('tdfEM').value)}`;
    if (e < s){ TD.toast('끝이 시작보다 빠를 수 없습니다.'); return; }
    const color = PAL[+$('tdfGC').value] || PAL[0];
    TD.closeModal();
    onSave({name, start: s, end: e, color});
  };
  if (goal) $('tdfGDel').onclick = () => TD.confirmBox('이 장기 목표를 삭제할까요?', onDelete, '삭제');
  // 원래처럼 목표 칸에서 Enter = 저장
  document.querySelector('#modal').onkeydown = ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT'){ ev.preventDefault(); $('tdfGOk').click(); } };
  $('tdfGN').focus(); $('tdfGN').select();
}

TD.fiveShared = {
  BIRTH_Y, BIRTH_M, BIRTH_D, DEATH_AGE, DDAY_CAPTION, BASE_YEAR, LIFE_END_AGE, deathYear,
  blockStartFor, ageIn, packLanes, hit, measure, px, box, localXY,
  guardModal, popupMenu, closeMenu, noteDialog, goalDialog,
};

/* =====================================================================
   5년 계획 화면
   ===================================================================== */
const TIP = '(빈 칸 두 번 클릭: 그 달부터 장기 목표 추가 · 장기 목표 막대 클릭: 수정/삭제 · '
  + '왼쪽 칸 두 번 클릭: 그해의 목표 쓰기 · 연도 클릭: 그해 연간 계획 · '
  + '오른쪽 클릭: 월간/연간 계획으로 이동 · 옅은 막대는 연간 계획 할 일(읽기 전용) · '
  + '단축키 1: 기본 · 2: 월간 · 3: 연간 · 4: 5년 · 5: 5개년 계획 차수 · L: 라이트/다크 · Esc: 닫기)';

let S = null;   // 지금 열린 화면의 상태 {el, cv, inner, range, bs(구간 첫 해), rects, ro, raf}

const five = () => TD.plan('five');
function save(){ TD.savePlan('five'); redraw(); }

/* ---- 구간 이동 ---- */
function shiftBlock(dir){ S.bs += 5 * dir; redraw(); }
function goThisBlock(){ S.bs = blockStartFor(new Date().getFullYear()); redraw(); }

/* ---- 장기 목표 / 그해의 목표 편집 ---- */
function dialogYears(){ const a = []; for (let y = S.bs - 5; y < S.bs + 10; y++) a.push(y); return a; }
function addGoal(year, month){
  if (year == null){   // 머리줄 "+ 장기 목표": 지금 구간이면 이번 달부터, 아니면 그 구간 1월부터
    const t = new Date();
    if (S.bs <= t.getFullYear() && t.getFullYear() < S.bs + 5){ year = t.getFullYear(); month = t.getMonth() + 1; }
    else { year = S.bs; month = 1; }
  }
  const endIdx = year * 12 + (month - 1) + 11;   // 기본 기간은 12달
  goalDialog({
    defStart: [year, month], defEnd: [Math.floor(endIdx / 12), endIdx % 12 + 1], years: dialogYears(),
    onSave(data){ five().goals.push({id: TD.newId(), ...data}); save(); },
  });
}
function editGoal(goal){
  goalDialog({
    goal, years: dialogYears(),
    // 창이 떠 있는 사이 다른 창이 고쳐 데이터를 다시 불러왔을 수 있어서, 지금 데이터에서 같은 목표(같은 id)를 찾아 고친다
    onSave(data){ const g = five().goals.find(x => x === goal || (goal.id && x.id === goal.id)); if (!g){ TD.toast('그 사이 지워진 목표예요'); redraw(); return; } Object.assign(g, data); save(); },
    onDelete(){ const d = five(); d.goals = d.goals.filter(g => g !== goal && !(goal.id && g.id === goal.id)); save(); },
  });
}
function editYearGoal(year){
  const key = String(year), old = five().year_goals[key] || '';
  noteDialog(`${year}년의 목표`, old, '이 해에 집중할 목표/테마를 적어두세요. (Ctrl+Enter: 저장)', v => {
    const goals = five().year_goals;
    if (v === (goals[key] || '')) return;
    if (v) goals[key] = v; else delete goals[key];
    save();
  });
}

/* ---- 마우스 (원래 _on_click / _on_double_click / _on_right_click) ---- */
function onClick(e){
  if (e.button !== 0 || !S) return;
  const [x, y] = localXY(S.inner, e), rc = S.rects;
  let h = hit(rc.goal, x, y);
  if (h){ guardModal(); editGoal(h[4]); return; }
  h = hit(rc.yl, x, y);
  if (h) TD.setView(3, {year: h[4]});
}
function onDblClick(e){
  if (!S) return;
  const [x, y] = localXY(S.inner, e), rc = S.rects;
  if (hit(rc.goal, x, y)) return;
  let h = hit(rc.month, x, y);
  if (h){ addGoal(h[4], h[5]); return; }
  h = hit(rc.left, x, y);
  if (h && !hit(rc.yl, x, y)) editYearGoal(h[4]);
}
function onContext(e){
  e.preventDefault();
  if (!S) return;
  const [x, y] = localXY(S.inner, e), rc = S.rects;
  const g = hit(rc.goal, x, y), mh = hit(rc.month, x, y), lh = hit(rc.left, x, y), items = [];
  if (g){ const goal = g[4]; items.push({label: '장기 목표 수정/삭제', fn: () => editGoal(goal)}, '-'); }
  if (mh){
    const yy = mh[4], m = mh[5];
    items.push(
      {label: `${yy}년 ${m}월 월간 계획 보기 (2)`, fn: () => TD.setView(2, {year: yy, month: m})},
      {label: `${yy}년 연간 계획 보기 (3)`, fn: () => TD.setView(3, {year: yy})},
      '-',
      {label: `${yy}년 ${m}월부터 장기 목표 추가`, fn: () => addGoal(yy, m)},
    );
  } else if (lh){
    const yy = lh[4];
    items.push(
      {label: `${yy}년의 목표 쓰기/수정`, fn: () => editYearGoal(yy)},
      {label: `${yy}년 연간 계획 보기 (3)`, fn: () => TD.setView(3, {year: yy})},
    );
  } else { closeMenu(); return; }
  popupMenu(items, e.clientX, e.clientY);
}
// 누를 수 있는 곳(막대 · 연도) 위에서는 손가락 모양
function onMove(e){
  if (!S) return;
  const [x, y] = localXY(S.inner, e);
  S.inner.style.cursor = hit(S.rects.goal, x, y) || hit(S.rects.yl, x, y) ? 'pointer' : '';
}

/* ---- 그리기 (원래 _redraw) ---- */
function schedule(){ if (S && !S.raf) S.raf = requestAnimationFrame(() => { if (!S) return; S.raf = 0; redraw(); }); }
function redraw(again){
  if (!S) return;
  const d = five(), cv = S.cv, inner = S.inner, bs = S.bs;
  const years = [0, 1, 2, 3, 4].map(i => bs + i);
  S.range.textContent = `${years[0]} ~ ${years[4]}`;
  const rc = S.rects = {yl: [], left: [], month: [], goal: []};
  const W = cv.clientWidth, Hv = cv.clientHeight;
  if (W < 100 || Hv < 100){ inner.innerHTML = ''; inner.style.height = '0px'; return; }

  const pad = 6, leftW = Math.min(240, W * 0.25);
  const goalLine = 18, lineH = 18, smallLine = 16, yearLine = 26;   // 13px 굵게 · 13px · 12px · 20px 굵게 의 줄 높이
  const headH = goalLine + 2 * pad, cellW = (W - leftW) / 12;
  const rowH = Math.max((Hv - headH) / 5, 140);   // 창이 아주 낮으면 줄 높이를 지키고 스크롤
  const H = headH + 5 * rowH;
  const today = new Date(), tY = today.getFullYear();
  const nowIdx = (tY - bs) * 12 + today.getMonth();
  const goalH = goalLine + 6, projH = smallLine + 2;
  const monthIdx = text => { const m = /^(\d{4})-(\d{2})/.exec(String(text || '')); return m ? (+m[1] - bs) * 12 + (+m[2]) - 1 : null; };
  const out = [];

  for (let m = 0; m < 12; m++)
    out.push(box(leftW + m * cellW, 0, cellW, headH, 't', `line-height:${headH}px;text-align:center;font-size:13px;font-weight:700;color:var(--text)`, `${m + 1}월`));

  // 막대 레인 배치(5년 전체를 한 번에 - 해를 넘겨도 같은 레인 번호)
  const lastIdx = 5 * 12 - 1;
  const clipped = items => {
    const res = [];
    for (const [a, b, obj] of items){
      const s = monthIdx(a), e = monthIdx(b);
      if (s == null || e == null || e < 0 || s > lastIdx) continue;
      res.push([Math.max(0, s), Math.min(lastIdx, e), obj]);
    }
    return res;
  };
  const goalLanes = packLanes(clipped((d.goals || []).map(g => [g.start, g.end, g])));
  const ann = TD.plan('annual') || {groups: [], projects: []};
  const projLanes = packLanes(clipped((ann.projects || []).filter(p => p.start && p.end).map(p => [p.start, p.end, p])));
  const groups = new Map((ann.groups || []).map(g => [g.id, g]));

  years.forEach((year, r) => {
    const y0 = headH + r * rowH, y1 = y0 + rowH, rowS = r * 12;

    // 왼쪽: 연도 + 그해의 목표
    out.push(box(0, y0, leftW + 1, rowH + 1, 'c', 'background:var(--tdf-canvas)'));
    rc.left.push([0, y0, leftW, y1, year]);
    const yearFg = year >= tY ? 'var(--strong)' : 'var(--tdf-past)';
    out.push(box(pad * 2, y0 + pad, leftW - pad * 3, yearLine, 't', `font-size:20px;font-weight:700;line-height:${yearLine}px;color:${yearFg}`, String(year)));
    rc.yl.push([0, y0, pad * 2 + measure(String(year), 'bold 20px') + pad, y0 + pad + yearLine, year]);
    const text = d.year_goals[String(year)] || '';
    const ty = y0 + pad + yearLine + 4;
    const maxLines = Math.floor((y1 - pad - ty) / lineH);
    if (text && maxLines > 0)
      out.push(box(pad * 2, ty, leftW - 4 * pad, maxLines * lineH, 'w', `-webkit-line-clamp:${maxLines}`, esc(text)));
    else if (!text && maxLines > 0)
      out.push(box(pad * 2, ty, leftW - 3 * pad, smallLine, 't', 'font-size:12px;color:var(--muted)', '(두 번 클릭해서 그해의 목표 쓰기)'));

    // 오른쪽: 12개월 칸(지난 달은 흐리게, 이번 달은 강조)
    for (let m = 0; m < 12; m++){
      const x0 = leftW + m * cellW, idx = rowS + m;
      const fill = idx === nowIdx ? 'var(--tdf-today)' : idx < nowIdx ? 'var(--tdf-track)' : 'var(--tdf-canvas)';
      out.push(box(x0, y0, cellW + 1, rowH + 1, 'c', `background:${fill}`));
      rc.month.push([x0, y0, x0 + cellW, y1, year, m + 1]);
    }
    const segX = (s, e) => [leftW + (s - rowS) * cellW + 2, leftW + (e - rowS + 1) * cellW - 2];

    // 장기 목표 막대(진한 색, 편집 가능)
    const by = y0 + pad;
    let nGoalLanes = 0;
    for (const [lane, s, e, goal] of goalLanes){
      const segS = Math.max(s, rowS), segE = Math.min(e, rowS + 11);
      if (segS > segE) continue;
      const gy = by + lane * (goalH + 3);
      if (gy + goalH > y1 - pad) continue;
      nGoalLanes = Math.max(nGoalLanes, lane + 1);
      const [x0, x1] = segX(segS, segE);
      const color = /^#[0-9a-f]{6}$/i.test(goal.color || '') ? goal.color : PAL[0];
      out.push(box(x0, gy, x1 - x0, goalH, 'bar', `background:${color};color:#ffffff;font-size:13px;font-weight:700;line-height:${goalH}px;padding:0 6px`, esc(goal.name || '')));
      rc.goal.push([x0, gy, x1, gy + goalH, goal]);
    }

    // 연간 계획 할 일 막대(옅은 색, 읽기 전용)
    const py = by + nGoalLanes * (goalH + 3) + (nGoalLanes ? 6 : 0);
    const hidden = new Set();
    for (const [lane, s, e, proj] of projLanes){
      const segS = Math.max(s, rowS), segE = Math.min(e, rowS + 11);
      if (segS > segE) continue;
      const ly = py + lane * (projH + 2);
      if (ly + projH > y1 - pad - smallLine){ hidden.add(proj); continue; }
      const [x0, x1] = segX(segS, segE);
      const g = groups.get(proj.group_id) || {};
      const color = g.color || proj.color || PAL[0];
      out.push(box(x0, ly, x1 - x0, projH, 'bar', `background:${TD.lighten(color, 0.6)};color:var(--text);font-size:12px;line-height:${projH}px;padding:0 4px`, esc(proj.name || '')));
    }
    if (hidden.size)
      out.push(box(leftW, y1 - pad - smallLine, W - leftW - pad, smallLine, 't', 'text-align:right;font-size:12px;color:var(--muted)', `연간 할 일 ${hidden.size}개 더 (연간 계획에서 보기)`));
  });

  inner.style.height = px(H);
  inner.innerHTML = out.join('');
  // 스크롤 막대가 생기거나 없어져 폭이 바뀌었으면 한 번 더 그린다
  if (!again && cv.clientWidth !== W) redraw(true);
}

TD.views[4] = {
  mount(el, opts){
    opts = opts || {};
    // v2.20: 5개년 계획 화면(5)에서 차수를 골라 들어오면 그 구간으로 연다
    el.innerHTML = `<div class="tdf-root">
      <div class="tdf-head">
        <span class="tdf-title">🧭 5년 계획</span>
        <div class="tdf-nav">
          <button class="icon" data-a="prev" title="이전 5년">◀</button>
          <span class="tdf-range"></span>
          <button data-a="this" title="올해가 들어 있는 5년으로">올해</button>
          <button class="icon" data-a="next" title="다음 5년">▶</button>
        </div>
        <span class="tdf-sp"></span>
        <button data-a="add" title="장기 목표 막대를 새로 만듭니다">+ 장기 목표</button>
      </div>
      <div class="tdf-tip">${esc(TIP)}</div>
      <div class="tdf-wrap"><div class="tdf-cv"><div class="tdf-in"></div></div></div>
    </div>`;
    const cv = el.querySelector('.tdf-cv'), inner = el.querySelector('.tdf-in');
    S = {el, cv, inner, range: el.querySelector('.tdf-range'), bs: blockStartFor(+opts.year || new Date().getFullYear()), rects: {yl: [], left: [], month: [], goal: []}, raf: 0};
    el.querySelector('.tdf-head').addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      ({prev: () => shiftBlock(-1), next: () => shiftBlock(1), this: goThisBlock, add: () => addGoal()})[b.dataset.a]();
    });
    inner.addEventListener('click', onClick);
    inner.addEventListener('dblclick', onDblClick);
    inner.addEventListener('contextmenu', onContext);
    inner.addEventListener('mousemove', onMove);
    cv.addEventListener('scroll', closeMenu);
    S.ro = new ResizeObserver(schedule); S.ro.observe(cv);
    redraw();
  },
  unmount(){
    closeMenu();
    if (!S) return;
    if (S.ro) S.ro.disconnect();
    if (S.raf) cancelAnimationFrame(S.raf);
    S = null;
  },
  onKey(){ return false; },
  escBack(){ return closeMenu(); },   // 오른쪽 클릭 메뉴가 떠 있으면 그것만 닫는다
  onTheme(){ redraw(); },             // 연간 할 일 막대의 옅은 색(lighten)이 테마마다 다르다
  onData(kind){ if (kind === 'five' || kind === 'annual'){ closeMenu(); redraw(); } },
};
})();
