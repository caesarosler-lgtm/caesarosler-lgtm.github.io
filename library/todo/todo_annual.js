/* ---------- 3 연간 계획 (원래 프로그램의 AnnualPlanWindow) ----------
   1월~12월을 세로로 쌓고, 그 안에서 날짜를 가로 칸으로 나눈 1년 달력 위에 할 일을 화살표 선(<---이름--->)으로 그린다.
   - 세로줄 = 요일: 달마다 1일을 그 요일 칸만큼 오른쪽으로 밀어서 그린다 (월요일 시작, 37칸 = 밀리는 칸 최대 6 + 31일).
   - 겹치는 할 일은 최대 6개 레인(줄)에 나눠 쌓는다 (만든 순서대로 0~5 번 레인을 돌려 쓴다 — 여러 달에 걸쳐도 같은 레인).
   - 빈 곳을 끌면 새 할 일 (놓으면 그 자리에서 바로 이름 입력) · 막대 클릭 = 선택(Delete 로 삭제) · 두 번 클릭 = 수정 창
     · 막대 가운데를 끌면 일정 이동 · 양 끝을 끌면 시작/종료일 조절.
   - 위쪽 메뉴(제목 · 연도 이동 · 버튼)와 왼쪽 그룹/할 일 목록은 평소에 숨겨 두고 F1 / F2 나 달력 맨 위/왼쪽 가장자리 클릭으로 연다.
   데이터는 원래 annual_plan.json 과 같은 모양 {groups, projects} — TD.plan('annual') 을 고치고 TD.savePlan('annual'). */
(() => {
'use strict';

/* 원래 프로그램의 상수 (43인치 4K · 100% 배율 기준 픽셀 값 그대로) */
const LIST_W = 320;          // 왼쪽 그룹/할 일 목록의 폭
const LIST_ROW_H = 26;       // 목록 한 줄 높이
const MAX_LANES = 6;         // "레인은 5~6개가 적당해"
const HEADER_ROW_H = 30;     // 달 이름표 + 날짜 숫자가 함께 있는 한 줄 (v1.90~91)
const LANE_H = 18, LANE_GAP = 2, ROW_PAD = 8;
const MONTH_ROW_H = HEADER_ROW_H + MAX_LANES * (LANE_H + LANE_GAP) + ROW_PAD;   // 달 한 줄의 기본 높이
const BAR_LINE_W = 2;                 // 할 일 선 두께
const ARROW = [6, 7, 3];              // 화살촉 모양 (Tk arrowshape: 목까지 길이 / 끝점까지 길이 / 옆으로 벌어진 폭)
const BAR_HIT_HALF_H = 5;             // 선 위/아래로 이만큼만 그 할 일을 누른 것으로 본다 (v1.84)
const TODAY_FG = '#5cb85c';           // 오늘 칸 테두리 (v1.98 초록)
const SELECT_COLOR = '#ffd43b';       // 선택된 할 일 테두리 (v1.98)
const HOTZONE = 10;                   // 달력 맨 위/왼쪽 가장자리 이 폭 안의 빈 곳을 누르면 메뉴/목록이 열린다 (v1.87)
const GRID_COLS = 37;
const HANJA = ['月', '火', '水', '木', '金', '土', '日'];
const EDGE_PX = 7;                    // 막대 끝 이 범위 안을 누르면 길이 조절
const DRAG_TH = 4;                    // 이만큼 움직여야 클릭이 아니라 끌기
const PREVIEW = '#3399ff';            // 끌어서 새로 만들 때 미리보기 색
const HOVER = '#ff4433';              // 마우스 위치 날짜 표시
const RED = '#d9534f', BLUE = '#3d8bd6';
const PAL = TD.PROJECT_COLOR_PALETTE;
const WD = TD.WD;

/* 화면 전용 색: 원래 *_LIGHT / *_DARK 상수 그대로 */
const CSS = `
.tda{position:absolute;inset:0;overflow:hidden;user-select:none;-webkit-user-select:none;background:var(--canvas);
  --tda-grid:#e2e1ec;--tda-sat:#eeeffd;--tda-sun:#fdeff1;--tda-past:#c9c9c9;--tda-past-sat:#9fb9d6;--tda-past-sun:#d9a3a3}
html[data-theme=dark] .tda{--tda-grid:#4a4956;--tda-sat:#171a30;--tda-sun:#2b181c;--tda-past:#75757b;--tda-past-sat:#4d6c8a;--tda-past-sun:#8a4d4d}
.tda-scroll{position:absolute;inset:0;overflow-x:hidden;overflow-y:auto}
.tda-cal{display:block;touch-action:none}
.tda-hov{position:absolute;left:0;top:0;pointer-events:none}
.tda-in{position:absolute;z-index:2;height:18px;border:0;border-radius:0;padding:0 3px;font:12px var(--input-font);background:var(--bg);color:var(--text);user-select:text;-webkit-user-select:text}
.tda-top{position:absolute;left:0;top:0;right:0;background:var(--bg);border-bottom:1px solid var(--line);box-shadow:var(--shadow);padding:12px 16px 8px}
.tda-hd{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.tda-hd h2{margin:0 10px 0 0;font-size:20px;font-weight:700;color:var(--strong)}
.tda-yr{display:inline-block;width:7ch;text-align:center;font-size:15px;font-weight:700}
.tda-tip{color:var(--muted);font-size:12px;line-height:1.5;margin-top:6px}
.tda-left{position:absolute;left:0;top:0;bottom:0;width:${LIST_W + 2}px;border-right:2px solid var(--line);background:var(--canvas)}
.tda-list{position:absolute;inset:0;overflow-y:auto}
.tda-row{height:${LIST_ROW_H}px;display:flex;align-items:center;border-bottom:1px solid var(--tda-grid);white-space:nowrap;color:var(--text)}
.tda-g{background:var(--bg)}
.tda-tri{width:18px;margin-left:8px;flex:none;color:var(--muted);font-size:12px}
.tda-sw{width:12px;height:12px;flex:none;margin-right:6px}
.tda-g b{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;padding-right:8px}
.tda-nm{margin-left:42px;font-size:12px;flex:1;overflow:hidden}
.tda-pc{margin:0 12px 0 6px;font-size:11px;color:var(--muted)}
.tda-empty{text-align:center;color:var(--muted);font-size:13px;line-height:1.6;padding-top:14px;white-space:pre-line}
.tda-menu{position:absolute;z-index:10;background:var(--canvas);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:4px;min-width:210px}
.tda-menu div{padding:6px 12px;border-radius:5px;font-size:13px;cursor:pointer;white-space:nowrap;color:var(--text)}
.tda-menu div:hover{background:var(--accent-weak);color:var(--accent-fg)}
`;
if (!document.getElementById('tdaCss')) document.head.insertAdjacentHTML('beforeend', `<style id="tdaCss">${CSS}</style>`);

/* ---- 날짜: 1970-01-01 부터 센 "날 번호"로 다룬다 (서머타임 · 시간대와 무관하게 하루 = 1) ---- */
const DAYMS = 864e5;
const dn = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAYMS);
const dnParts = v => { const t = new Date(v * DAYMS); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const isoDn = v => { const [y, m, d] = dnParts(v); return `${String(y).padStart(4, '0')}-${TD.pad2(m)}-${TD.pad2(d)}`; };
const wdDn = v => (new Date(v * DAYMS).getUTCDay() + 6) % 7;   // 월=0 ~ 일=6 (파이썬 date.weekday 와 같은 순서)
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/* 원래 date.fromisoformat 처럼 'YYYY-MM-DD' 만 받는다. 틀리면 null */
function dnIso(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim()); if (!m) return null;
  const v = dn(+m[1], +m[2], +m[3]), p = dnParts(v);
  return p[0] === +m[1] && p[1] === +m[2] && p[2] === +m[3] ? v : null;
}
const todayDn = () => dnIso(TD.todayIso());
/* 파이썬 round (반올림 대상이 정확히 .5 면 짝수 쪽) */
function pyRound(x){ const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; }
const md = v => { const [, m, d] = dnParts(v); return [m, d]; };

/* ---- 화면 상태 ---- */
let el = null, root, scroller, cv, hv, topP, leftP, listEl, menuEl, yearEl, ro = null, rafId = 0;
let year = new Date().getFullYear();
let W = 400, H = 12 * MONTH_ROW_H, dpr = 1, cellW = 1, rowH = MONTH_ROW_H;
let segs = [];          // 이번에 그린 막대 조각들 (클릭 판정용): {project, rect:[x0,y0,x1,y1], ts, te}
let drag = null;        // 기존 막대를 끄는 중
let cdrag = null;       // 빈 곳을 끌어서 새 할 일을 그리는 중
let inline = null;      // 끈 뒤 이름을 입력하는 중 {start, end, lane, groupId, color, input}
let selected = null;    // 좌클릭으로 선택한 할 일 id (v1.98)
let lastPt = null;      // 마지막 마우스 위치 (화면 좌표) — 다시 그릴 때 날짜 표시를 실제 마우스 자리에 맞추려고 (v2.01)
let listRows = [];
let zTop = 5;
let topPanel = null, leftPanel = null;

const P = () => TD.plan('annual');

/* ---- 저장 (원래 TodoApp._save_annual_plan_group 등과 같은 규칙) ---- */
function saveGroup(id, data){
  const d = P();
  if (id == null){   // 새 그룹: 팔레트에서 순서대로 색 하나 (한 번 정한 색은 그룹이 지워질 때까지 그대로)
    d.groups.push({id: TD.newId(), collapsed: false, color: PAL[d.groups.length % PAL.length], ...data});
  } else { const g = d.groups.find(x => x.id === id); if (g) Object.assign(g, data); }
  TD.savePlan('annual');
}
function deleteGroup(id){   // 그룹을 지우면 그 안의 할 일도 함께 지운다. 그룹이 하나도 안 남으면 빈 '미분류' 를 다시 만든다
  const d = P();
  d.groups = d.groups.filter(g => g.id !== id);
  d.projects = d.projects.filter(p => p.group_id !== id);
  if (!d.groups.length) d.groups.push({id: TD.newId(), name: '미분류', collapsed: false, color: PAL[0]});
  if (selected != null && !d.projects.some(p => p.id === selected)) selected = null;
  TD.savePlan('annual');
}
function saveProject(id, data){
  const d = P();
  if (id == null){   // 새 할 일: 색은 처음 만들 때 팔레트에서 순서대로 (막대 색은 그룹 색을 쓰지만 원래처럼 저장은 해 둔다)
    d.projects.push({id: TD.newId(), color: PAL[d.projects.length % PAL.length], ...data});
  } else { const p = d.projects.find(x => x.id === id); if (p) Object.assign(p, data); }
  TD.savePlan('annual');
}
function deleteProject(id){
  const d = P(); d.projects = d.projects.filter(p => p.id !== id);
  if (selected === id) selected = null;
  TD.savePlan('annual');
}

/* ---- 숨겨 두는 판 (원래 ClickToShowPanel): 열면 달력 위에 겹쳐 뜨고, 마우스가 벗어나면 잠시 뒤 다시 숨는다
        (안의 입력 칸에 포커스가 남아 있으면 기다린다) ---- */
function makePanel(node){
  const pn = {
    visible: false, t: 0,
    show(){ pn.cancel(); if (pn.visible) return; pn.visible = true; node.hidden = false; node.style.zIndex = ++zTop; },
    hide(){ pn.cancel(); if (!pn.visible) return; pn.visible = false; node.hidden = true; if (menuEl && node.contains(menuEl)) hideMenu(); },
    toggle(){ pn.visible ? pn.hide() : pn.show(); },
    schedule(ms = 250){ pn.cancel(); pn.t = setTimeout(pn.maybe, ms); },
    cancel(){ clearTimeout(pn.t); pn.t = 0; },
    maybe(){
      pn.t = 0; if (!pn.visible) return;
      const a = document.activeElement;
      if ((a && a !== document.body && node.contains(a)) || (menuEl && !menuEl.hidden && node.contains(menuEl))){ pn.schedule(400); return; }
      pn.hide();
    },
  };
  node.addEventListener('mouseenter', () => pn.cancel());
  node.addEventListener('mouseleave', () => pn.schedule());
  return pn;
}

/* ---- 레이아웃: 화면에 남는 세로 공간은 12개 달 줄에 고르게 나눠 아래 끝까지 꽉 채운다 (v1.88 _annual_row_h).
        화면이 기본 높이보다 작으면 세로 스크롤 ---- */
function layout(){
  if (!el) return;
  dpr = window.devicePixelRatio || 1;
  const availH = scroller.clientHeight;
  const extra = Math.max(0, availH - 12 * MONTH_ROW_H) / 12;
  rowH = MONTH_ROW_H + extra;
  H = extra > 0 ? availH : 12 * MONTH_ROW_H;
  cv.style.height = H + 'px';                 // 높이를 먼저 정해야 스크롤 막대가 생길지 정해지고, 그 뒤에 폭을 잰다
  W = Math.max(scroller.clientWidth, 400);
  cellW = W / GRID_COLS;
  for (const c of [cv, hv]){ c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
}

function geom(m){
  const y0 = (m - 1) * rowH, ms = dn(year, m, 1), days = daysIn(year, m);
  return {y0, hy1: y0 + HEADER_ROW_H, y1: y0 + rowH, days, ms, me: ms + days - 1, lead: wdDn(ms)};
}
function monthAt(y){ for (let m = 1; m <= 12; m++){ const y0 = (m - 1) * rowH; if (y >= y0 && y <= y0 + rowH) return m; } return null; }
/* 끌기용 날짜: 달 줄 밖이면 가장 가까운 달로, 그 달에 없는 칸이면 앞/뒤 달로 그냥 넘어간다 (v1.77 — 달 끝에서 끌어도 이동량이 정확하게) */
function dateAt(x, y){
  let m = monthAt(y); if (m == null) m = y < 0 ? 1 : 12;
  const col = Math.trunc(x / cellW + 1e-6), ms = dn(year, m, 1);
  return ms + col - wdDn(ms);
}
/* 마우스만 올렸을 때의 날짜: 그 달의 실제 날짜 칸일 때만 (빈 칸이면 표시 없음 — v2.08) */
function hoverAt(x, y){
  const m = monthAt(y); if (m == null) return [null, null];
  const g = geom(m), off = Math.trunc(x / cellW + 1e-6) - g.lead;
  return off < 0 || off >= g.days ? [m, null] : [m, g.ms + off];
}
function hitTest(x, y){
  for (let i = segs.length - 1; i >= 0; i--){
    const s = segs[i], [x0, y0, x1, y1] = s.rect;
    if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) continue;
    if (s.ts && x - x0 <= EDGE_PX) return [s, 'resize-start'];
    if (s.te && x1 - x <= EDGE_PX) return [s, 'resize-end'];
    return [s, 'move'];
  }
  return [null, null];
}
const laneY = (g, lane) => g.hy1 + lane * (LANE_H + LANE_GAP);
function canvasPt(e){ const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

/* ---- 그리기 ---- */
function colors(){
  const s = getComputedStyle(root), v = k => s.getPropertyValue(k).trim();
  return {canvas: v('--canvas'), text: v('--text'), muted: v('--muted'), grid: v('--tda-grid'), sat: v('--tda-sat'), sun: v('--tda-sun'),
    past: v('--tda-past'), pastSat: v('--tda-past-sat'), pastSun: v('--tda-past-sun'), font: v('--font') || 'sans-serif'};
}
let C = null;
const font = (px, bold) => `${bold ? '700 ' : ''}${px}px ${C.font}`;
const snap = v => Math.round(v * dpr) / dpr;
const onePx = () => Math.max(1, Math.round(dpr)) / dpr;
function vline(ctx, x, y0, y1){ const w = onePx(); ctx.fillRect(Math.min(snap(x), W - w), y0, w, y1 - y0); }
function hline(ctx, x0, x1, y){ const w = onePx(); ctx.fillRect(x0, Math.min(snap(y), H - w), x1 - x0, w); }
/* 글자 뒤에 바탕색 사각형을 깔고 쓴다 (원래의 "지우개" 방식). align: left/center/right, base: top/middle/bottom */
function textBox(ctx, text, x, y, px, bold, fg, bg, pad, align, base){
  ctx.font = font(px, bold);
  const w = ctx.measureText(text).width, h = Math.round(px * 1.35);
  const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const by = base === 'middle' ? y - h / 2 : base === 'bottom' ? y - h : y;
  if (bg){ ctx.fillStyle = bg; ctx.fillRect(bx - pad, by - pad, w + pad * 2, h + pad * 2); }
  ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx, by + h / 2);
}
/* 화살표 달린 선 (Tk create_line(arrow=...) 과 같은 모양: 화살촉이 있는 쪽은 선을 목까지만 긋고 삼각형을 붙인다) */
function arrowLine(ctx, x0, x1, y, color, first, last){
  const [a, b, c] = ARROW, hw = BAR_LINE_W / 2;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = BAR_LINE_W; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(first ? x0 + a : x0, y); ctx.lineTo(last ? x1 - a : x1, y); ctx.stroke();
  const head = (tip, dir) => {
    ctx.beginPath(); ctx.moveTo(tip, y);
    ctx.lineTo(tip - dir * b, y - c - hw); ctx.lineTo(tip - dir * a, y - hw);
    ctx.lineTo(tip - dir * a, y + hw); ctx.lineTo(tip - dir * b, y + c + hw); ctx.closePath(); ctx.fill();
  };
  if (first) head(x0, -1);
  if (last) head(x1, 1);
}
/* 할 일 하나의 한 달치 조각 (원래 _draw_gantt_bar): 진행한 만큼은 진하게, 나머지는 옅게. 진짜 시작/끝에만 화살촉.
   이름은 진짜 시작일이 있는 달에만 한 번, 선 가운데에 바탕색을 깔고 쓴다 (<----이름---->). rowBg 가 null 이면 미리보기 */
function drawBar(ctx, bx0, bx1, by0, by1, ps, pe, ss, se, ts, te, progress, color, name, rowBg, sel){
  if (sel){
    ctx.save(); ctx.strokeStyle = SELECT_COLOR; ctx.lineWidth = 2; ctx.setLineDash([4, 2]);
    ctx.strokeRect(bx0 - 3, by0 - 4, bx1 - bx0 + 6, by1 - by0 + 8); ctx.restore();
  }
  const mid = (by0 + by1) / 2, light = TD.lighten(color, 0.7);
  const total = pe - ps + 1, doneDays = pyRound(total * progress / 100), boundary = ps + doneDays;
  const doneX = boundary <= ss ? bx0 : boundary > se ? bx1 : bx0 + (boundary - ss) * cellW;
  const parts = [];
  if (doneX > bx0) parts.push([bx0, doneX, color]);
  if (bx1 > doneX) parts.push([doneX, bx1, light]);
  if (!parts.length) parts.push([bx0, bx1, color]);
  parts.forEach(([x0, x1, col], i) => arrowLine(ctx, x0, x1, mid, col, i === 0 && ts, i === parts.length - 1 && te));
  if (rowBg != null && ts && name) textBox(ctx, name, (bx0 + bx1) / 2, mid, 12, true, C.text, rowBg, 3, 'center', 'middle');
}

function schedule(){ if (!rafId) rafId = requestAnimationFrame(draw); }
function draw(){
  cancelAnimationFrame(rafId); rafId = 0;
  if (!el) return;
  C = colors();
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.canvas; ctx.fillRect(0, 0, W, H);   // 모든 달이 같은 바탕 한 가지 (v1.91 — 지브라 없음, 다크는 검정)
  yearEl.textContent = `${year}년`;
  const d = P(), groups = d.groups, projects = d.projects;
  const gcolor = new Map(groups.map(g => [g.id, g.color || PAL[0]]));
  const lane = new Map(projects.map((p, i) => [p.id, i % MAX_LANES]));
  const today = todayDn(), [ty, tm] = dnParts(today);
  // 기간을 미리 읽어 둔다 (끄는 중인 할 일은 끌고 있는 새 날짜로)
  const items = [];
  for (const p of projects){
    let s = dnIso(p.start), e = dnIso(p.end);
    if (s == null || e == null) continue;
    if (drag && drag.project === p){ s = drag.ns; e = drag.ne; }
    items.push({p, s, e});
  }
  segs = [];
  // 달 이름표("N월")는 모든 달이 "6월 1일 칸의 오른쪽 위" 와 같은 x 에 쓴다 (v1.97)
  const labelRight = (wdDn(dn(year, 6, 1)) + 1) * cellW - 4;

  for (let m = 1; m <= 12; m++){
    const g = geom(m), {y0, hy1, y1, days, ms, me, lead} = g;
    const isPast = year < ty || (year === ty && m < tm);
    const textY = (y0 + hy1) / 2;
    // 토/일 세로줄을 옅게 칠한다 (지난 달은 이미 흐리므로 건너뜀 — v1.88)
    if (!isPast){
      for (let day = 1; day <= days; day++){
        const col = lead + day - 1, wd = col % 7;
        if (wd !== 5 && wd !== 6) continue;
        ctx.fillStyle = wd === 6 ? C.sun : C.sat; ctx.fillRect(col * cellW, hy1, cellW, y1 - hy1);
      }
    }
    // 세로줄은 이 달의 날짜가 있는 칸에만 (v1.89)
    ctx.fillStyle = C.grid;
    for (let col = lead; col <= lead + days; col++) vline(ctx, col * cellW, y0, y1);
    // 날짜 숫자 (1월에는 한자 요일도 — v1.90). 지난 달 토/일은 옅은 파랑/빨강
    ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let day = 1; day <= days; day++){
      const col = lead + day - 1, x0 = col * cellW, wd = col % 7;
      ctx.fillStyle = wd === 6 ? (isPast ? C.pastSun : RED) : wd === 5 ? (isPast ? C.pastSat : BLUE) : (isPast ? C.past : C.muted);
      ctx.fillText(m === 1 ? `${day}${HANJA[wd]}` : String(day), x0 + 3, textY);
      if (ms + day - 1 === today){ ctx.strokeStyle = TODAY_FG; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, cellW, y1 - y0); }
    }
    // "N월" (날짜 숫자 위에 바탕색을 깔고 덮어 쓴다)
    ctx.font = font(20, true);
    const lt = `${m}월`, lw = ctx.measureText(lt).width;
    ctx.fillStyle = C.canvas; ctx.fillRect(labelRight - lw - 4, y0 + 2, lw + 8, hy1 - 2 - (y0 + 2));
    ctx.fillStyle = isPast ? C.past : C.text; ctx.textAlign = 'right'; ctx.fillText(lt, labelRight, textY); ctx.textAlign = 'left';

    // 이 달과 겹치는 할 일 막대
    for (const {p, s, e} of items){
      if (e < s || e < ms || s > me) continue;
      const ss = Math.max(s, ms), se = Math.min(e, me), ts = ss === s, te = se === e;
      const bx0 = (lead + ss - ms) * cellW, bx1 = (lead + se - ms + 1) * cellW;
      const by0 = laneY(g, lane.get(p.id) || 0), by1 = by0 + LANE_H;
      const color = gcolor.get(p.group_id) || PAL[0];
      const progress = Math.max(0, Math.min(100, Number(p.progress) || 0));
      // 이름 옆에 시작/종료일 · 요일 · 기간 (v1.88)
      const [sm, sd] = md(s), [em, ed] = md(e);
      const label = `${p.name || ''} (${sm}/${sd}(${WD[wdDn(s)]})~${em}/${ed}(${WD[wdDn(e)]}), ${e - s + 1}일)`;
      drawBar(ctx, bx0, bx1, by0, by1, s, e, ss, se, ts, te, progress, color, label, C.canvas, p.id === selected);
      // 오늘이 이 조각 안이면: 빨간 눈금 + "오늘 N%" (전체 기간 중 오늘까지 흐른 비율 — v1.84)
      if (ss <= today && today <= se){
        const pct = Math.max(0, Math.min(100, pyRound((today - s + 1) / (e - s + 1) * 100)));
        const tx = (lead + today - ms) * cellW;
        ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(tx, by0 - 3); ctx.lineTo(tx, by1 + 3); ctx.stroke();
        textBox(ctx, `오늘 ${pct}%`, tx, by0 - 4, 11, true, RED, C.canvas, 2, 'center', 'bottom');
      }
      const mid = (by0 + by1) / 2;
      segs.push({project: p, rect: [bx0, mid - BAR_HIT_HALF_H, bx1, mid + BAR_HIT_HALF_H], ts, te});
    }

    // 빈 곳을 끌어 새로 만드는 중이면 이 달 몫의 미리보기 선
    if (cdrag && !(cdrag.end < ms || cdrag.start > me)){
      const ss = Math.max(cdrag.start, ms), se = Math.min(cdrag.end, me);
      const by0 = laneY(g, cdrag.lane);
      drawBar(ctx, (lead + ss - ms) * cellW, (lead + se - ms + 1) * cellW, by0, by0 + LANE_H,
        cdrag.start, cdrag.end, ss, se, ss === cdrag.start, se === cdrag.end, 0, PREVIEW, '', null, false);
    }
    // 끈 뒤 이름 입력 중이면: 그룹 색 화살표 선, 첫 달 말고는 "(계속)"
    if (inline && !(inline.end < ms || inline.start > me)){
      const ss = Math.max(inline.start, ms), se = Math.min(inline.end, me), first = ss === inline.start;
      const bx0 = (lead + ss - ms) * cellW, bx1 = (lead + se - ms + 1) * cellW, mid = laneY(g, inline.lane) + LANE_H / 2;
      arrowLine(ctx, bx0, bx1, mid, inline.color, first, se === inline.end);
      if (first){
        const s = inline.input.style;
        s.left = (bx0 + 6) + 'px'; s.top = (mid - 9) + 'px'; s.width = Math.max(30, bx1 - bx0 - 8) + 'px';
      } else {
        ctx.font = font(11); ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('(계속)', bx0 + 4, mid - 12);
      }
    }
  }

  // 달 사이 가로 구분선: 위/아래 두 달 중 날짜가 있는 칸 전체 (v1.96) — 다 그린 뒤 맨 마지막에
  ctx.fillStyle = C.grid;
  for (let m = 1; m <= 12; m++){
    const g = geom(m); let x0 = g.lead, x1 = g.lead + g.days;
    if (m < 12){ const n = geom(m + 1); x0 = Math.min(x0, n.lead); x1 = Math.max(x1, n.lead + n.days); }
    hline(ctx, x0 * cellW, x1 * cellW, g.y1);
  }

  // 끌어서 만드는 중: "O월 O일(요) ~ O월 O일(요) (N일)" 배지를 끝나는 날 쪽에 (v1.84)
  if (cdrag && dnParts(cdrag.end)[0] === year){
    const e = cdrag.end, s = cdrag.start, [em, ed] = md(e), [sm, sd] = md(s), g = geom(em);
    const ex = (g.lead + ed) * cellW, by0 = laneY(g, cdrag.lane);
    textBox(ctx, `${sm}월 ${sd}일(${WD[wdDn(s)]}) ~ ${em}월 ${ed}일(${WD[wdDn(e)]}) (${e - s + 1}일)`, ex + 6, by0 - 2, 12, true, '#ffffff', PREVIEW, 4, 'left', 'bottom');
  }
  drawHover();
}

/* 마우스만 올렸을 때: 그 날짜 칸 전체를 빨간 테두리로 + "O월 O일(요)" 배지 (v1.83, v2.01). 겹쳐 놓은 투명 캔버스에만 그려서 빠르다 */
function drawHover(){
  if (!el) return;
  const ctx = hv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, hv.width, hv.height); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (drag || cdrag || inline || !lastPt) return;
  const r = cv.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
  if (lastPt[0] < sr.left || lastPt[0] > sr.right || lastPt[1] < sr.top || lastPt[1] > sr.bottom) return;
  const [m, day] = hoverAt(lastPt[0] - r.left, lastPt[1] - r.top);
  if (m == null || day == null) return;
  if (!C) C = colors();
  const g = geom(m), x0 = (g.lead + day - g.ms) * cellW;
  ctx.strokeStyle = HOVER; ctx.lineWidth = 2; ctx.strokeRect(x0, g.y0, cellW, g.y1 - g.y0);
  const [mm, dd] = md(day);
  textBox(ctx, `${mm}월 ${dd}일(${WD[wdDn(day)]})`, x0 + 6, g.y0 + 2, 12, true, '#ffffff', HOVER, 3, 'left', 'top');
}

/* ---- 왼쪽 목록 ---- */
function drawList(){
  if (!el) return;
  const d = P(), groups = d.groups, projects = d.projects;
  listRows = [];
  for (const g of groups){
    listRows.push({kind: 'group', group: g});
    if (!g.collapsed) for (const p of projects) if (p.group_id === g.id) listRows.push({kind: 'task', project: p, group: g});
  }
  listEl.innerHTML = listRows.length ? listRows.map((r, i) => {
    if (r.kind === 'group'){
      const g = r.group, n = projects.filter(p => p.group_id === g.id).length;
      return `<div class="tda-row tda-g" data-i="${i}"><span class="tda-tri">${g.collapsed ? '▸' : '▾'}</span><span class="tda-sw" style="background:${TD.esc(g.color || PAL[0])}"></span><b>${TD.esc(`${g.name || ''} (${n})`)}</b></div>`;
    }
    const p = r.project; let name = p.name || ''; if (name.length > 16) name = name.slice(0, 15) + '…';
    return `<div class="tda-row tda-t" data-i="${i}" title="${TD.esc(p.name || '')}"><span class="tda-nm">${TD.esc(name)}</span><span class="tda-pc">${Math.max(0, Math.min(100, Number(p.progress) || 0))}%</span></div>`;
  }).join('') : `<div class="tda-empty">아직 그룹이 없습니다.\n오른쪽 위 "+ 새 그룹"으로\n먼저 그룹을 만들어보세요.</div>`;
}
function rowOf(e){ const n = e.target.closest('.tda-row'); return n ? listRows[+n.dataset.i] : null; }
function refresh(){ drawList(); draw(); }

/* 그룹 줄 오른쪽 클릭 메뉴 */
function showMenu(e, group){
  const r = leftP.getBoundingClientRect(), rr = root.getBoundingClientRect();
  menuEl.innerHTML = `<div data-k="edit">그룹 편집(이름 변경 · 삭제)</div><div data-k="add">이 그룹에 새 할 일 추가</div>`;
  menuEl.hidden = false;
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  menuEl.style.left = Math.min(e.clientX, rr.right - mw - 4) - r.left + 'px';
  menuEl.style.top = Math.min(e.clientY, rr.bottom - mh - 4) - r.top + 'px';
  menuEl.onclick = ev => {
    const k = ev.target.dataset.k; if (!k) return;
    hideMenu();
    if (k === 'edit') openGroupDialog(group); else openProjectDialog(null, group.id);
  };
}
function hideMenu(){ if (menuEl){ menuEl.hidden = true; menuEl.innerHTML = ''; } }
const menuOpen = () => menuEl && !menuEl.hidden;
function onDocDown(e){ if (menuOpen() && !menuEl.contains(e.target)) hideMenu(); }

/* ---- 대화상자 (원래 ProjectEditDialog / GroupEditDialog) ---- */
const $ = s => document.querySelector(s);
function enterKey(fn){ $('#modal').onkeydown = ev => { if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229 && ev.target.tagName !== 'TEXTAREA'){ ev.preventDefault(); fn(); } }; }
function askYesNo(text, okLabel, yes, no){
  TD.modal(`<div class="tip" style="color:var(--text)">${TD.esc(text)}</div><div class="bt"><button id="tdaNo">아니요</button><button class="danger" id="tdaYes">${okLabel}</button></div>`);
  $('#tdaNo').onclick = () => { TD.closeModal(); if (no) no(); };
  $('#tdaYes').onclick = () => { TD.closeModal(); yes(); };
  enterKey(() => $('#tdaYes').click());
  $('#tdaYes').focus();
}
function openProjectDialog(project, defaultGroupId, keep){
  const groups = P().groups;
  if (!groups.length){ TD.toast('먼저 그룹을 추가해 주세요.'); return; }
  const p = project || {}, v = keep || {};
  const want = project ? project.group_id : defaultGroupId;
  let gi = groups.findIndex(g => g.id === (v.group_id !== undefined ? v.group_id : want)); if (gi < 0) gi = 0;
  const today = todayDn();
  const prog = v.progress != null ? v.progress : Math.trunc(Number(p.progress) || 0);
  const progs = Array.from({length: 21}, (_, i) => i * 5); if (!progs.includes(prog)) progs.push(prog), progs.sort((a, b) => a - b);
  TD.modal(`<h3>${project ? '할 일 수정' : '할 일 추가'}</h3>
<div class="fld"><label>이름</label><input type="text" id="tdaName" value="${TD.esc(v.name != null ? v.name : p.name || '')}"></div>
<div class="fld"><label>그룹</label><select id="tdaGrp">${groups.map((g, i) => `<option value="${i}"${i === gi ? ' selected' : ''}>${TD.esc(g.name || '')}</option>`).join('')}</select></div>
<div class="fld"><label>시작일\n(YYYY-MM-DD)</label><input type="text" id="tdaStart" value="${TD.esc(v.start != null ? v.start : p.start || isoDn(today))}"></div>
<div class="fld"><label>종료일\n(YYYY-MM-DD)</label><input type="text" id="tdaEnd" value="${TD.esc(v.end != null ? v.end : p.end || isoDn(today + 30))}"></div>
<div class="fld"><label>진행률</label><select id="tdaProg" style="width:90px">${progs.map(n => `<option${n === prog ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
<div class="bt">${project ? '<button class="danger left" id="tdaDel">삭제</button>' : ''}<button id="tdaCancel">취소</button><button class="primary" id="tdaOk">저장</button></div>`);
  const read = () => ({name: $('#tdaName').value, group_id: (groups[+$('#tdaGrp').value] || {}).id, start: $('#tdaStart').value, end: $('#tdaEnd').value, progress: +$('#tdaProg').value || 0});
  $('#tdaCancel').onclick = () => TD.closeModal();
  $('#tdaOk').onclick = () => {
    const f = read(), name = f.name.trim();
    if (!name){ TD.toast('할 일 이름을 입력해 주세요.'); $('#tdaName').focus(); return; }
    const s = dnIso(f.start), e = dnIso(f.end);
    if (s == null || e == null){ TD.toast('날짜는 YYYY-MM-DD 형식으로 입력해 주세요. (예: 2026-09-23)'); return; }
    if (e < s){ TD.toast('종료일이 시작일보다 빠릅니다.'); return; }
    TD.closeModal();
    saveProject(project ? project.id : null, {name, group_id: f.group_id != null ? f.group_id : null, start: isoDn(s), end: isoDn(e), progress: f.progress});
    refresh();
  };
  if (project) $('#tdaDel').onclick = () => {
    const f = read();   // "아니요" 면 고치던 내용 그대로 다시 연다
    askYesNo('이 할 일을 삭제할까요?', '삭제', () => { deleteProject(project.id); refresh(); }, () => openProjectDialog(project, defaultGroupId, f));
  };
  enterKey(() => $('#tdaOk').click());
  $('#tdaName').focus();
}
function openGroupDialog(group, keep){
  TD.modal(`<h3>${group ? '그룹 수정' : '그룹 추가'}</h3>
<div class="fld"><label>그룹 이름</label><input type="text" id="tdaGName" value="${TD.esc(keep != null ? keep : group ? group.name || '' : '')}"></div>
<div class="bt">${group ? '<button class="danger left" id="tdaGDel">삭제</button>' : ''}<button id="tdaGCancel">취소</button><button class="primary" id="tdaGOk">저장</button></div>`);
  $('#tdaGCancel').onclick = () => TD.closeModal();
  $('#tdaGOk').onclick = () => {
    const name = $('#tdaGName').value.trim();
    if (!name){ TD.toast('그룹 이름을 입력해 주세요.'); $('#tdaGName').focus(); return; }
    TD.closeModal(); saveGroup(group ? group.id : null, {name}); refresh();
  };
  if (group) $('#tdaGDel').onclick = () => {
    const keepName = $('#tdaGName').value;
    askYesNo('이 그룹과 그 안에 있는 할 일이 모두 삭제됩니다. 계속할까요?', '삭제', () => { deleteGroup(group.id); refresh(); }, () => openGroupDialog(group, keepName));
  };
  enterKey(() => $('#tdaGOk').click());
  $('#tdaGName').focus();
}

/* ---- 끈 뒤 바로 이름 입력 (원래 _start_annual_inline_create): 팝업 없이 선 위에 입력 칸. 그룹은 첫 번째 그룹 ---- */
function startInline(start, end, lane){
  const groups = P().groups;
  if (!groups.length){ TD.toast('먼저 그룹을 추가해 주세요.'); return; }
  if (inline) commitInline();
  if (dnParts(start)[0] !== year){ draw(); return; }   // 시작일이 보고 있는 해 밖이면 입력 칸을 둘 자리가 없다
  const g = groups[0], input = document.createElement('input');
  input.type = 'text'; input.className = 'tda-in'; input.spellcheck = false;
  scroller.appendChild(input);
  inline = {start, end, lane, groupId: g.id, color: g.color || PAL[0], input};
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cancelInline(); return; }
    if (e.code === 'F1' || e.code === 'F2'){ e.preventDefault(); e.stopPropagation(); (e.code === 'F1' ? topPanel : leftPanel).toggle(); return; }
    if (e.key === 'Enter'){
      e.preventDefault(); e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) input.addEventListener('compositionend', () => setTimeout(commitInline), {once: true});   // 한글 조합 중이면 조합이 끝난 뒤에
      else commitInline();
    }
  });
  input.addEventListener('blur', () => { if (inline && inline.input === input) commitInline(); });
  draw();
  input.focus();
}
function commitInline(){
  const pend = inline; if (!pend) return;
  inline = null;
  const text = pend.input.value.trim(); pend.input.remove();
  if (!text){ draw(); return; }
  saveProject(null, {name: text, group_id: pend.groupId, start: isoDn(pend.start), end: isoDn(pend.end), progress: 0});
  refresh();
}
function cancelInline(){ const pend = inline; if (!pend) return; inline = null; pend.input.remove(); draw(); }

/* ---- 달력 마우스 ---- */
function capture(e){ try { cv.setPointerCapture(e.pointerId); } catch(err){} }   // 끄는 동안 달력 밖으로 나가도 계속 따라오게
function onDown(e){
  if (e.button !== 0) return;
  hideMenu();
  if (inline) commitInline();   // 이름 입력 중에 다른 곳을 누르면 먼저 확정 (빈 칸이면 취소)
  const [cx, cy] = canvasPt(e);
  const [seg, mode] = hitTest(cx, cy);
  if (seg){
    cdrag = null;
    const p = seg.project, os = dnIso(p.start), oe = dnIso(p.end);
    if (os == null || oe == null){ drag = null; return; }
    drag = {project: p, mode, os, oe, pd: dateAt(cx, cy), px: cx, py: cy, moved: false, ns: os, ne: oe};
    selected = p.id;   // 누르는 순간 선택 표시 (v1.98)
    capture(e);
    draw(); return;
  }
  if (selected != null){ selected = null; schedule(); }   // 빈 곳을 누르면 선택 해제
  // 맨 위/맨 왼쪽 가장자리의 빈 곳 = 위쪽 메뉴 / 왼쪽 목록 열기 (지금 화면에 보이는 가장자리 기준)
  const sr = scroller.getBoundingClientRect();
  if (e.clientY - sr.top < HOTZONE){ drag = cdrag = null; topPanel.show(); return; }
  if (e.clientX - sr.left < HOTZONE){ drag = cdrag = null; leftPanel.show(); return; }
  // 빈 곳(레인 영역)을 누르면 거기서부터 새 할 일 그리기 시작
  drag = null;
  const m = monthAt(cy); if (m == null){ cdrag = null; return; }
  const g = geom(m); if (cy < g.hy1 || cy > g.y1){ cdrag = null; return; }
  const pd = dateAt(cx, cy);
  const lane = Math.max(0, Math.min(MAX_LANES - 1, Math.trunc((cy - g.hy1) / (LANE_H + LANE_GAP))));
  cdrag = {anchor: pd, start: pd, end: pd, lane, px: cx, py: cy, moved: false};
  capture(e);
  drawHover();
}
function onMove(e){
  const [cx, cy] = canvasPt(e);
  const d = drag;
  if (d){
    if (Math.abs(cx - d.px) > DRAG_TH || Math.abs(cy - d.py) > DRAG_TH) d.moved = true;
    const hd = dateAt(cx, cy);
    if (d.mode === 'move'){ const delta = hd - d.pd; d.ns = d.os + delta; d.ne = d.oe + delta; }
    else if (d.mode === 'resize-start'){ d.ns = Math.min(hd, d.oe); d.ne = d.oe; }
    else { d.ns = d.os; d.ne = Math.max(hd, d.os); }
    schedule(); return;
  }
  const cd = cdrag;
  if (cd){
    if (Math.abs(cx - cd.px) > DRAG_TH || Math.abs(cy - cd.py) > DRAG_TH) cd.moved = true;
    const cur = dateAt(cx, cy);
    if (cur < cd.anchor){ cd.start = cur; cd.end = cd.anchor; } else { cd.start = cd.anchor; cd.end = cur; }
    schedule(); return;
  }
  if (inline) return;
  lastPt = [e.clientX, e.clientY];
  // 막대 양 끝 = 좌우 화살표 커서, 막대 위 = 이동 커서 (v1.98)
  const [seg, mode] = hitTest(cx, cy);
  cv.style.cursor = seg ? (mode === 'move' ? 'move' : 'ew-resize') : '';
  drawHover();
}
function onUp(){
  const d = drag;
  if (d){
    drag = null;
    if (!d.moved){ draw(); return; }   // 움직이지 않았으면 선택만 남긴다 (수정 창은 두 번 클릭)
    if (d.ns !== d.os || d.ne !== d.oe) saveProject(d.project.id, {name: d.project.name || '', group_id: d.project.group_id, start: isoDn(d.ns), end: isoDn(d.ne), progress: d.project.progress || 0});
    refresh(); return;
  }
  const cd = cdrag; cdrag = null;
  if (!cd) return;
  draw();   // 미리보기 선을 지운다
  if (!cd.moved) return;   // 그냥 빈 곳 클릭 — 아무 일도 없음
  startInline(cd.start, cd.end, cd.lane);
}
function onCancel(){ if (drag || cdrag){ drag = cdrag = null; draw(); } }
function onDbl(e){
  const [cx, cy] = canvasPt(e);
  const [seg] = hitTest(cx, cy);
  if (seg) openProjectDialog(seg.project);
}
function onLeave(){ lastPt = null; cv.style.cursor = ''; drawHover(); }

/* ---- 연도 이동 ---- */
function shiftYear(n){ year += n; draw(); }
function goToday(){ year = new Date().getFullYear(); draw(); }

TD.views[3] = {
  mount(host, opts = {}){
    el = host;
    year = +opts.year || new Date().getFullYear();   // 5년 계획에서 연도를 골라 들어오면 그 해로 (v2.19)
    selected = null; drag = cdrag = inline = null; lastPt = null; segs = [];
    el.innerHTML = `<div class="tda">
  <div class="tda-scroll"><canvas class="tda-cal"></canvas><canvas class="tda-hov"></canvas></div>
  <div class="tda-left" hidden><div class="tda-list"></div><div class="tda-menu" hidden></div></div>
  <div class="tda-top" hidden>
    <div class="tda-hd">
      <h2>📊 연간 계획</h2>
      <button data-a="prev" title="전 해">◀</button><span class="tda-yr"></span><button data-a="today" title="올해로">오늘</button><button data-a="next" title="다음 해">▶</button>
      <span style="flex:1"></span>
      <button data-a="group">+ 새 그룹</button><button data-a="task">+ 새 할 일</button>
    </div>
    <div class="tda-tip">(왼쪽 목록 - 그룹 줄 클릭: 접기/펼치기 · 오른쪽 클릭: 그룹 이름 변경/삭제/할 일 추가 · 할 일 줄 클릭: 수정 · 오른쪽 달력 - 빈 곳을 끌면 새 할 일 · 막대 클릭: 선택(Delete 로 삭제) · 두 번 클릭: 수정 · 눌러서 끌면 일정 이동 · 양 끝을 끌면 기간 조절 · F1: 이 메뉴 열기/닫기 · F2: 왼쪽 목록 열기/닫기 · 달력의 맨 위/왼쪽 가장자리 클릭으로도 열림 · 1: 기본 화면 · 2: 월간 계획 · 4: 5년 계획 · 5: 5개년 계획 차수 · L: 라이트/다크 · Esc: 기본 화면으로)</div>
  </div>
</div>`;
    root = el.querySelector('.tda'); scroller = root.querySelector('.tda-scroll');
    cv = root.querySelector('.tda-cal'); hv = root.querySelector('.tda-hov');
    topP = root.querySelector('.tda-top'); leftP = root.querySelector('.tda-left');
    listEl = root.querySelector('.tda-list'); menuEl = root.querySelector('.tda-menu'); yearEl = root.querySelector('.tda-yr');

    topP.addEventListener('click', e => {
      const a = (e.target.closest('button') || {}).dataset; if (!a || !a.a) return;
      ({prev: () => shiftYear(-1), next: () => shiftYear(1), today: goToday, group: () => openGroupDialog(null), task: () => openProjectDialog(null)})[a.a]();
    });
    listEl.addEventListener('click', e => {
      const r = rowOf(e); if (!r) return;
      if (r.kind === 'group'){ saveGroup(r.group.id, {collapsed: !r.group.collapsed}); refresh(); }
      else openProjectDialog(r.project);
    });
    listEl.addEventListener('contextmenu', e => { e.preventDefault(); const r = rowOf(e); if (r && r.kind === 'group') showMenu(e, r.group); else hideMenu(); });
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    scroller.addEventListener('scroll', drawHover);
    document.addEventListener('pointerdown', onDocDown, true);

    topPanel = makePanel(topP); leftPanel = makePanel(leftP);
    ro = new ResizeObserver(() => { layout(); draw(); });
    ro.observe(el);
    layout(); refresh();
    // 처음 열 때는 위쪽 메뉴와 왼쪽 목록을 잠깐 보여줬다가 1.5초 뒤 숨긴다 (버튼들이 있다는 걸 알 수 있게)
    topPanel.show(); topPanel.schedule(1500);
    leftPanel.show(); leftPanel.schedule(1500);
  },
  unmount(){
    if (ro) ro.disconnect(); ro = null;
    cancelAnimationFrame(rafId); rafId = 0;
    if (topPanel) topPanel.cancel(); if (leftPanel) leftPanel.cancel();
    document.removeEventListener('pointerdown', onDocDown, true);
    if (inline){ const pend = inline; inline = null; pend.input.remove(); }
    drag = cdrag = null; el = null;
  },
  onKey(e){
    if (e.code === 'F1'){ e.preventDefault(); topPanel.toggle(); return true; }    // 위쪽 메뉴 열기/닫기
    if (e.code === 'F2'){ e.preventDefault(); leftPanel.toggle(); return true; }   // 왼쪽 목록 열기/닫기
    if (e.key === 'Delete' && selected != null){   // 선택한 할 일을 확인 없이 바로 삭제 (v1.99)
      e.preventDefault();
      if (P().projects.some(p => p.id === selected)) deleteProject(selected);
      selected = null; refresh(); return true;
    }
    return false;
  },
  escBack(){
    if (menuOpen()){ hideMenu(); return true; }
    if (inline){ cancelInline(); return true; }
    if (drag || cdrag){ drag = cdrag = null; draw(); return true; }
    if (topPanel.visible || leftPanel.visible){ topPanel.hide(); leftPanel.hide(); return true; }
    if (selected != null){ selected = null; draw(); return true; }
    return false;
  },
  onTheme(){ if (el) draw(); },   // 목록은 CSS 변수라 저절로 바뀌고, 달력 캔버스만 새 색으로 다시 그린다
  onData(kind){
    if (kind !== 'annual' || !el) return;
    drag = cdrag = null;   // 끌던 할 일 객체가 새로 바뀌었을 수 있으니 끌기는 버린다
    if (selected != null && !P().projects.some(p => p.id === selected)) selected = null;
    if (inline && !P().groups.some(g => g.id === inline.groupId)){ const g = P().groups[0]; if (g){ inline.groupId = g.id; inline.color = g.color || PAL[0]; } }
    refresh();
  },
};
})();
