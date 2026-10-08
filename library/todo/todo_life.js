/* =====================================================================
   내일의 할일 — 5 5개년 계획 차수 (원래 프로그램의 LifePlanWindow, v2.20)
   "단축키 5번으로 5년씩의 계획을 내 나이에 매칭시켜서, 5개년 계획 1차, 2차, 3차... 식으로 보여달라"는 요청으로 만든 화면.
   5년 계획(4)의 고정 구간(2026 부터 5년씩)을 1차, 2차... 로 번호 매겨 한 줄에 하나씩 쌓고(만 80세가 들어 있는 차수까지), 한 칸 = 1년.
     - 왼쪽: "N차 5개년 계획", 연도 범위, 만 나이 범위, 그 차수의 목표(두 번 클릭해서 쓰기 - 이 화면에서만 적는 값)
     - 연도 칸: 연도, 그해 생일 기준 만 나이, 그해의 목표(5년 계획과 같은 값 - 두 번 클릭해서 쓰기),
       장기 목표 막대(연 단위로 줄여서 보여주기만 함 - 편집은 5년 계획에서)
     - D-day 기준일(만 57세 생일)이 있는 해는 빨갛게 표시한다.
   차수 제목을 누르면 그 구간의 5년 계획(4)으로, 연도를 누르면 그해의 연간 계획(3)으로 간다.
   같이 쓰는 도구(목표 쓰기 창, 오른쪽 클릭 메뉴, 레인 배치...)는 todo_five.js 의 TD.fiveShared 를 쓴다.
   ===================================================================== */
(() => {
'use strict';
const F = TD.fiveShared;
if (!F){ console.error('todo_five.js 가 먼저 불러와져야 합니다'); return; }
const {hit, box, px, measure, localXY, packLanes, popupMenu, closeMenu, noteDialog, blockStartFor, ageIn} = F;
const esc = TD.esc, PAL = TD.PROJECT_COLOR_PALETTE;

// 첫 차수는 5년 계획의 기준 해부터, 만 80세가 되는 해가 들어 있는 차수까지
const FIRST_YEAR = F.BASE_YEAR;
const N_BLOCKS = Math.max(1, Math.floor((F.BIRTH_Y + F.LIFE_END_AGE - FIRST_YEAR) / 5) + 1);
const blockNo = bs => Math.floor((bs - FIRST_YEAR) / 5) + 1;

const TIP = '(차수 제목 클릭: 그 5년 계획 보기 · 왼쪽 칸 두 번 클릭: 차수 목표 쓰기 · '
  + '연도 클릭: 그해 연간 계획 · 연도 칸 두 번 클릭: 그해의 목표 쓰기 · '
  + '장기 목표 막대는 5년 계획(4)에서 편집 · 나이는 그해 생일 기준 만 나이 · '
  + '단축키 1: 기본 · 2: 월간 · 3: 연간 · 4: 5년 · 5: 5개년 계획 차수 · L: 라이트/다크 · Esc: 닫기)';

let S = null;   // {el, cv, inner, nowLabel, rects, ro, raf}
const five = () => TD.plan('five');

/* ---- 목표 편집 (원래 _edit_text / _edit_block_goal / _edit_year_goal) ---- */
function editText(storeKey, key, label, hint){
  const old = (five()[storeKey] || {})[key] || '';
  noteDialog(label, old, hint, v => {
    const d = five(), values = d[storeKey] || (d[storeKey] = {});
    if (v === (values[key] || '')) return;
    if (v) values[key] = v; else delete values[key];
    TD.savePlan('five'); redraw();
  });
}
function editBlockGoal(bs){
  const n = blockNo(bs);
  editText('block_goals', String(bs),
    `${n}차 5개년 계획 (${bs}~${bs + 4}, 만 ${ageIn(bs)}~${ageIn(bs + 4)}세)`,
    '이 5년 동안 이루고 싶은 큰 목표/테마를 적어두세요. (Ctrl+Enter: 저장)');
}
function editYearGoal(year){
  editText('year_goals', String(year), `${year}년의 목표 (만 ${ageIn(year)}세)`,
    '이 해에 집중할 목표/테마를 적어두세요. (Ctrl+Enter: 저장)');
}

/* ---- 마우스 (원래 _on_click / _on_double_click / _on_right_click) ---- */
function onClick(e){
  if (e.button !== 0 || !S) return;
  const [x, y] = localXY(S.inner, e), rc = S.rects;
  let h = hit(rc.title, x, y);
  if (h){ TD.setView(4, {year: h[4]}); return; }
  h = hit(rc.goal, x, y);   // 장기 목표 막대: 그 차수의 5년 계획에서 편집
  if (h){ TD.setView(4, {year: h[4]}); return; }
  h = hit(rc.yl, x, y);
  if (h) TD.setView(3, {year: h[4]});
}
function onDblClick(e){
  if (!S) return;
  const [x, y] = localXY(S.inner, e), rc = S.rects;
  for (const list of [rc.title, rc.goal, rc.yl]) if (hit(list, x, y)) return;
  let h = hit(rc.block, x, y);
  if (h){ editBlockGoal(h[4]); return; }
  h = hit(rc.year, x, y);
  if (h) editYearGoal(h[4]);
}
function onContext(e){
  e.preventDefault();
  if (!S) return;
  const [x, y] = localXY(S.inner, e), rc = S.rects;
  const bh = hit(rc.block, x, y), yh = hit(rc.year, x, y);
  let items;
  if (bh){
    const bs = bh[4];
    items = [
      {label: `${blockNo(bs)}차 5개년 계획 목표 쓰기/수정`, fn: () => editBlockGoal(bs)},
      {label: `${bs}~${bs + 4} 5년 계획 보기 (4)`, fn: () => TD.setView(4, {year: bs})},
    ];
  } else if (yh){
    const yy = yh[4];
    items = [
      {label: `${yy}년의 목표 쓰기/수정`, fn: () => editYearGoal(yy)},
      {label: `${yy}년 연간 계획 보기 (3)`, fn: () => TD.setView(3, {year: yy})},
      {label: '이 해가 속한 5년 계획 보기 (4)', fn: () => TD.setView(4, {year: yy})},
    ];
  } else { closeMenu(); return; }
  popupMenu(items, e.clientX, e.clientY);
}
function onMove(e){
  if (!S) return;
  const [x, y] = localXY(S.inner, e), rc = S.rects;
  S.inner.style.cursor = hit(rc.title, x, y) || hit(rc.goal, x, y) || hit(rc.yl, x, y) ? 'pointer' : '';
}

/* ---- 그리기 (원래 _redraw) ---- */
function schedule(){ if (S && !S.raf) S.raf = requestAnimationFrame(() => { if (!S) return; S.raf = 0; redraw(); }); }
function redraw(again){
  if (!S) return;
  const d = five(), cv = S.cv, inner = S.inner;
  const rc = S.rects = {title: [], block: [], yl: [], year: [], goal: []};
  const today = new Date(), tY = today.getFullYear();
  const nowBlock = blockStartFor(tY);
  S.nowLabel.textContent = nowBlock >= FIRST_YEAR ? `지금: ${blockNo(nowBlock)}차 · ${tY}년 · 만 ${ageIn(tY)}세` : '';
  const W = cv.clientWidth, Hv = cv.clientHeight;
  if (W < 100 || Hv < 100){ inner.innerHTML = ''; inner.style.height = '0px'; return; }

  const pad = 6, leftW = Math.min(260, W * 0.22);
  const goalLine = 16, lineH = 18, titleLine = 21, yearLine = 20;   // 12px 굵게 · 13px · 16px 굵게 · 15px 굵게 의 줄 높이
  const headH = goalLine + 2 * pad, cellW = (W - leftW) / 5;
  const rowH = Math.max((Hv - headH) / N_BLOCKS, 120);   // 창이 낮으면 줄 높이를 지키고 스크롤
  const H = headH + N_BLOCKS * rowH;
  const goalH = goalLine + 4;
  const out = [];

  for (let c = 0; c < 5; c++)
    out.push(box(leftW + c * cellW, 0, cellW, headH, 't', `line-height:${headH}px;text-align:center;font-size:13px;font-weight:700;color:var(--text)`, `${c + 1}년차`));

  // 장기 목표 막대를 연 단위로 줄여서 레인 배치(차수를 넘겨도 같은 레인)
  const lastIdx = N_BLOCKS * 5 - 1, items = [];
  for (const g of d.goals || []){
    const s = parseInt(String(g.start || '').slice(0, 4), 10) - FIRST_YEAR, e = parseInt(String(g.end || '').slice(0, 4), 10) - FIRST_YEAR;
    if (isNaN(s) || isNaN(e) || e < 0 || s > lastIdx) continue;
    items.push([Math.max(0, s), Math.min(lastIdx, e), g]);
  }
  const goalLanes = packLanes(items);

  for (let r = 0; r < N_BLOCKS; r++){
    const bs = FIRST_YEAR + 5 * r, y0 = headH + r * rowH, y1 = y0 + rowH;
    const pastBlock = bs + 4 < tY;

    // 왼쪽: 차수 제목 / 연도·나이 범위 / 차수 목표
    out.push(box(0, y0, leftW + 1, rowH + 1, 'c', `background:${bs === nowBlock ? 'var(--tdf-today)' : 'var(--tdf-canvas)'}`));
    rc.block.push([0, y0, leftW, y1, bs]);
    const title = `${r + 1}차 5개년 계획`;
    out.push(box(pad * 2, y0 + pad, leftW - pad * 3, titleLine, 't', `font-size:16px;font-weight:700;line-height:${titleLine}px;color:${pastBlock ? 'var(--tdf-past)' : 'var(--strong)'}`, esc(title)));
    rc.title.push([0, y0, pad * 2 + measure(title, 'bold 16px') + pad, y0 + pad + titleLine, bs]);
    let ty = y0 + pad + titleLine + 2;
    out.push(box(pad * 2, ty, leftW - pad * 3, lineH, 't', `font-size:13px;line-height:${lineH}px;color:var(--muted)`, `${bs}~${bs + 4} · 만 ${ageIn(bs)}~${ageIn(bs + 4)}세`));
    ty += lineH + 4;
    const text = (d.block_goals || {})[String(bs)] || '';
    const maxLines = Math.floor((y1 - pad - ty) / lineH);
    if (text && maxLines > 0)
      out.push(box(pad * 2, ty, leftW - 4 * pad, maxLines * lineH, 'w', `-webkit-line-clamp:${maxLines}`, esc(text)));
    else if (!text && maxLines > 0)
      out.push(box(pad * 2, ty, leftW - 3 * pad, 16, 't', 'font-size:12px;color:var(--muted)', '(두 번 클릭해서 차수 목표 쓰기)'));

    // 연도 칸 5개
    const barsTop = y0 + pad + yearLine + 4;
    for (let c = 0; c < 5; c++){
      const year = bs + c, x0 = leftW + c * cellW, x1 = x0 + cellW;
      const fill = year === tY ? 'var(--tdf-today)' : year < tY ? 'var(--tdf-track)' : 'var(--tdf-canvas)';
      out.push(box(x0, y0, cellW + 1, rowH + 1, 'c', `background:${fill}`));
      rc.year.push([x0, y0, x1, y1, year]);
      out.push(box(x0 + pad, y0 + pad, cellW - 2 * pad, yearLine, 't', `font-size:15px;font-weight:700;line-height:${yearLine}px;color:${year < tY ? 'var(--tdf-past)' : 'var(--strong)'}`, String(year)));
      rc.yl.push([x0, y0, x0 + pad + measure(String(year), 'bold 15px') + pad, y0 + pad + yearLine, year]);
      // 그해 생일 기준 만 나이 (D-day 해는 빨간 글자 + 빨간 테두리)
      const death = year === F.deathYear;
      let ageText = `만 ${ageIn(year)}세`;
      if (death){
        ageText += ` · ${F.DDAY_CAPTION}`;
        out.push(box(x0 + 1, y0 + 1, cellW - 2, rowH - 2, '', 'border:2px solid var(--tdf-sun)'));
      }
      out.push(box(x0 + pad, y0 + pad + (yearLine - lineH) / 2, cellW - 2 * pad, lineH, 't',
        `text-align:right;font-size:13px;line-height:${lineH}px;color:${death ? 'var(--tdf-sun)' : 'var(--muted)'};font-weight:${death ? 700 : 400}`, esc(ageText)));
    }

    // 장기 목표 막대(연 단위, 보기 전용)
    const rowS = r * 5;
    let nLanes = 0;
    for (const [lane, s, e, goal] of goalLanes){
      const segS = Math.max(s, rowS), segE = Math.min(e, rowS + 4);
      if (segS > segE) continue;
      const gy = barsTop + lane * (goalH + 2);
      if (gy + goalH > y1 - pad) continue;
      nLanes = Math.max(nLanes, lane + 1);
      const x0 = leftW + (segS - rowS) * cellW + 2, x1 = leftW + (segE - rowS + 1) * cellW - 2;
      const color = /^#[0-9a-f]{6}$/i.test(goal.color || '') ? goal.color : PAL[0];
      out.push(box(x0, gy, x1 - x0, goalH, 'bar', `background:${color};color:#ffffff;font-size:12px;font-weight:700;line-height:${goalH}px;padding:0 4px`, esc(goal.name || '')));
      rc.goal.push([x0, gy, x1, gy + goalH, bs]);
    }

    // 그해의 목표(막대 아래)
    const ty0 = barsTop + nLanes * (goalH + 2) + (nLanes ? 2 : 0);
    for (let c = 0; c < 5; c++){
      const year = bs + c, x0 = leftW + c * cellW;
      const t = (d.year_goals || {})[String(year)] || '';
      if (!t) continue;
      const ml = Math.floor((y1 - pad - ty0) / lineH);
      if (ml > 0) out.push(box(x0 + pad, ty0, cellW - 2 * pad, ml * lineH, 'w', `-webkit-line-clamp:${ml}`, esc(t)));
    }
  }

  inner.style.height = px(H);
  inner.innerHTML = out.join('');
  if (!again && cv.clientWidth !== W) redraw(true);
}

TD.views[5] = {
  mount(el){
    el.innerHTML = `<div class="tdf-root">
      <div class="tdf-head">
        <span class="tdf-title">📜 5개년 계획</span>
        <span class="tdf-now"></span>
      </div>
      <div class="tdf-tip">${esc(TIP)}</div>
      <div class="tdf-wrap"><div class="tdf-cv"><div class="tdf-in"></div></div></div>
    </div>`;
    const cv = el.querySelector('.tdf-cv'), inner = el.querySelector('.tdf-in');
    S = {el, cv, inner, nowLabel: el.querySelector('.tdf-now'), rects: {title: [], block: [], yl: [], year: [], goal: []}, raf: 0};
    inner.addEventListener('click', onClick);
    inner.addEventListener('dblclick', onDblClick);
    inner.addEventListener('contextmenu', onContext);
    inner.addEventListener('mousemove', onMove);
    cv.addEventListener('scroll', closeMenu);
    S.ro = new ResizeObserver(schedule); S.ro.observe(cv);
    redraw();
    // 지금 차수가 화면 밖(스크롤 아래)이면 그 줄이 보이게
    const tY = new Date().getFullYear(), r = Math.floor((blockStartFor(tY) - FIRST_YEAR) / 5);
    if (r > 0 && cv.scrollHeight > cv.clientHeight){
      const rowH = (inner.offsetHeight - 28) / N_BLOCKS;
      cv.scrollTop = Math.max(0, 28 + r * rowH - rowH * 0.5);
    }
  },
  unmount(){
    closeMenu();
    if (!S) return;
    if (S.ro) S.ro.disconnect();
    if (S.raf) cancelAnimationFrame(S.raf);
    S = null;
  },
  onKey(){ return false; },
  escBack(){ return closeMenu(); },
  onTheme(){ redraw(); },
  onData(kind){ if (kind === 'five'){ closeMenu(); redraw(); } },
};
})();
