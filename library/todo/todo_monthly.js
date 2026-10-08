/* 2 월간 계획 — 원래 프로그램의 MonthlyPlanWindow(v2.18) 를 웹으로 옮긴 화면입니다.
   한 달 달력을 칸마다 보여 줍니다.
     - 그 날짜에 걸친 연간 계획 할 일 막대(그룹 색, 최대 3개 + "+N개 더")
     - 그 날짜에 적어 둔 메모(칸을 두 번 클릭해서 쓰기/수정, 한 줄에 하나씩)
     - 그 날짜 시간표의 계획 개수와 이행률(계획이 있을 때만)
   맨 위에는 달마다 "이달의 목표"를 적는 칸이 있습니다. 목표/메모는 월간 계획 파일(monthly)에 저장됩니다. */
(() => {
'use strict';

/* 원래 상수: 토/일 날짜 숫자 색(MONTHLY_PLAN_SAT/SUN_FG), 오늘 칸(MINIMAP_TODAY_BG), 칸 테두리(ANNUAL_GRID),
   주말 칸 바탕(ANNUAL_PLAN_WEEKEND_SAT/SUN_TINT), 다른 달 날짜 글자(ANNUAL_PLAN_PAST_MONTH_FG) — 라이트/다크 두 벌 */
document.head.insertAdjacentHTML('beforeend', `<style>
.tdm-root{--tdm-sat:#2f6fb8;--tdm-sun:#d0463c;--tdm-today:#ecebfb;--tdm-grid:#e2e1ec;--tdm-sat-tint:#eeeffd;--tdm-sun-tint:#fdeff1;--tdm-past:#c9c9c9;
  flex:1;min-height:0;display:flex;flex-direction:column;font-family:var(--font);color:var(--text);background:var(--bg)}
html[data-theme=dark] .tdm-root{--tdm-sat:#6aa7ea;--tdm-sun:#f07b73;--tdm-today:#2a2950;--tdm-grid:#4a4956;--tdm-sat-tint:#171a30;--tdm-sun-tint:#2b181c;--tdm-past:#75757b}
.tdm-head{display:flex;align-items:center;padding:12px 16px;flex-shrink:0}
.tdm-title{font-size:20px;font-weight:700;color:var(--strong)}
.tdm-nav{display:flex;align-items:center;gap:4px;margin-left:16px}
.tdm-nav button{font-size:13px}
.tdm-nav .tdm-arrow{min-width:38px}
.tdm-mlabel{font-size:15px;font-weight:700;min-width:110px;text-align:center;color:var(--strong)}
.tdm-tip{padding:0 16px;font-size:12px;color:var(--muted);flex-shrink:0}
.tdm-goal{display:flex;align-items:flex-start;gap:10px;padding:8px 16px;flex-shrink:0}
.tdm-goal b{font-size:14px;padding-top:6px;white-space:nowrap;color:var(--strong)}
.tdm-goal textarea{flex:1;height:calc(2 * 1.5em + 14px);line-height:1.5;padding:6px 8px;font-size:14px;resize:vertical}
.tdm-wrap{flex:1;min-height:0;padding:0 16px 16px;display:flex}
.tdm-cal{flex:1;min-width:0;position:relative;overflow:hidden;background:var(--canvas);user-select:none;-webkit-user-select:none}
.tdm-wd{position:absolute;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--text)}
.tdm-cell{position:absolute;box-sizing:border-box;border:1px solid var(--tdm-grid);background:var(--canvas);overflow:hidden}
.tdm-cell.sat{background:var(--tdm-sat-tint)}.tdm-cell.sun{background:var(--tdm-sun-tint)}.tdm-cell.today{background:var(--tdm-today)}
.tdm-num{position:absolute;font-size:15px;font-weight:700;line-height:20px;color:var(--strong);white-space:nowrap}
.tdm-num.sat,.tdm-wd.sat{color:var(--tdm-sat)}.tdm-num.sun,.tdm-wd.sun{color:var(--tdm-sun)}.tdm-num.past{color:var(--tdm-past)}
.tdm-info{position:absolute;font-size:12px;line-height:16px;color:var(--muted);white-space:nowrap}
.tdm-bar{position:absolute;height:18px;line-height:18px;font-size:12px;color:#fff;padding:0 4px;box-sizing:border-box;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tdm-more{position:absolute;font-size:12px;line-height:16px;color:var(--muted);white-space:nowrap}
.tdm-note{position:absolute;font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.tdm-note.past{color:var(--tdm-past)}
.tdm-menu{position:absolute;z-index:20;min-width:200px;background:var(--canvas);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:4px 0;font-size:13px}
.tdm-menu div{padding:6px 14px;cursor:pointer;white-space:nowrap}
.tdm-menu div:hover{background:var(--btn-hover)}
.tdm-menu hr{border:0;border-top:1px solid var(--line);margin:4px 0}
#modal .box.tdm-notebox{width:min(92vw,480px)}
</style>`);

/* 원래 그리기 치수(픽셀): 칸 안쪽 여백 pad, 날짜 숫자 줄 높이, 막대 높이(작은 글자 줄 + 2), 메모 한 줄 높이 */
const PAD = 6, DAY_LINE = 20, SMALL_LINE = 16, BAR_H = SMALL_LINE + 2, NOTE_LINE = 18;
const MAX_BARS = 3;   // MONTHLY_PLAN_MAX_BARS: 날짜 칸 하나에 겹쳐 보여줄 연간 계획 막대의 최대 개수(넘치면 "+N개 더")

let el = null, root = null, cal = null, ta = null, menu = null, ro = null;
let year = 0, month = 0, goalKey = '';

const monthKey = () => `${year}-${TD.pad2(month)}`;
const monthly = () => { const d = TD.plan('monthly'); if (!d.goals) d.goals = {}; if (!d.notes) d.notes = {}; return d; };

/* 원래 compute_compliance_rate: 계획한 시간 중 실제로 그 시간에 무언가를 기록한 비율(%).
   실제 기록의 시간대를 겹치지 않게 합친 뒤, 계획 항목마다 겹치는 만큼 더한다. 계획 시간이 0이면 null */
function complianceRate(plan, actual){
  const total = plan.reduce((s, t) => s + Math.max(0, t.end - t.start), 0);
  if (total <= 0) return null;
  const iv = actual.filter(t => t.end > t.start).map(t => [t.start, t.end]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of iv){
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else merged.push([s, e]);
  }
  let covered = 0;
  for (const t of plan){
    if (t.end <= t.start) continue;
    for (const [s, e] of merged){ const lo = Math.max(t.start, s), hi = Math.min(t.end, e); if (hi > lo) covered += hi - lo; }
  }
  /* 파이썬 round 는 .5 를 짝수 쪽으로 보낸다(은행가 반올림) — 같은 숫자가 나오도록 맞춘다 */
  const x = covered / total * 100, f = Math.floor(x), r = x - f;
  const rate = r > .5 ? f + 1 : r < .5 ? f : (f % 2 ? f + 1 : f);
  return Math.max(0, Math.min(100, rate));
}

/* ---- 이달의 목표 ---- */
function loadGoal(){
  root.querySelector('.tdm-mlabel').textContent = `${year}년 ${month}월`;
  root.querySelector('.tdm-goal b').textContent = `${month}월의 목표`;
  goalKey = monthKey();
  ta.value = monthly().goals[goalKey] || '';
}
/* 원래는 목표 칸에서 포커스가 빠질 때(FocusOut)와 창을 닫을 때 저장했다.
   웹에서는 글자를 칠 때마다도 저장해 두어, 창이 갑자기 닫혀도 잃지 않게 한다(저장은 todo.html 이 모아서 한다) */
function saveGoal(){
  if (!ta || !goalKey) return;
  const text = ta.value.trim(), goals = monthly().goals;
  if (text === (goals[goalKey] || '')) return;
  if (text) goals[goalKey] = text; else delete goals[goalKey];
  TD.savePlan('monthly');
}

/* ---- 달 이동 ---- */
function shiftMonth(delta){
  saveGoal();
  const m = month - 1 + delta;
  year += Math.floor(m / 12); month = ((m % 12) + 12) % 12 + 1;
  loadGoal(); redraw();
}
function goToday(){
  saveGoal();
  const t = new Date(); year = t.getFullYear(); month = t.getMonth() + 1;
  loadGoal(); redraw();
}

/* ---- 날짜 메모 ---- */
/* 원래 MonthNoteDialog: 그 날의 일정/약속/할 일을 자유롭게 적는 창(Ctrl+Enter: 저장, Esc: 취소) */
function editNote(iso){
  closeMenu();
  const notes = monthly().notes;
  TD.modal(`<h3>${TD.esc(TD.kdate(iso))} 메모</h3>
    <div class="tip">이 날의 일정/약속/할 일을 적어두세요. 한 줄에 하나씩 적으면 달력 칸에 줄마다 보입니다. (Ctrl+Enter: 저장)</div>
    <textarea id="tdmNote">${TD.esc(notes[iso] || '')}</textarea>
    <div class="bt"><button id="tdmNoteCancel">취소</button><button class="primary" id="tdmNoteSave">저장</button></div>`, 'tdm-notebox');
  const box = document.querySelector('#tdmNote');
  const save = () => {
    const text = box.value.trim(), n = monthly().notes;
    TD.closeModal();
    if (text !== (n[iso] || '')){
      if (text) n[iso] = text; else delete n[iso];
      TD.savePlan('monthly');
    }
    redraw();
  };
  document.querySelector('#tdmNoteSave').onclick = save;
  document.querySelector('#tdmNoteCancel').onclick = () => TD.closeModal();
  document.querySelector('#modal').onkeydown = e => { if (e.key === 'Enter' && e.ctrlKey){ e.preventDefault(); save(); } };
  box.focus(); box.setSelectionRange(box.value.length, box.value.length);
}
function deleteNote(iso){
  closeMenu();
  TD.confirmBox(`${TD.kdate(iso)} 메모를 지울까요?`, () => {
    delete monthly().notes[iso];
    TD.savePlan('monthly');
    redraw();
  }, '지우기');
}
function goToDate(iso){
  closeMenu();
  saveGoal();      // 원래 _close(): 목표를 저장하고 창을 닫은 뒤 그 날짜로 간다
  TD.goDay(iso);
}

/* ---- 오른쪽 클릭 메뉴 ---- */
function closeMenu(){ if (menu){ menu.remove(); menu = null; } }
function openMenu(iso, cx, cy){
  closeMenu();
  menu = document.createElement('div');
  menu.className = 'tdm-menu';
  menu.innerHTML = `<div data-a="edit">메모 쓰기/수정</div>`
    + (monthly().notes[iso] ? `<div data-a="del">메모 지우기</div>` : '')
    + `<hr><div data-a="go">이 날짜의 할 일 보기 (기본 화면)</div>`;
  menu.addEventListener('pointerdown', e => e.stopPropagation());
  menu.addEventListener('contextmenu', e => e.preventDefault());
  menu.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'edit') editNote(iso);
    else if (a.dataset.a === 'del') deleteNote(iso);
    else goToDate(iso);
  });
  root.appendChild(menu);
  const r = root.getBoundingClientRect();
  const x = Math.max(0, Math.min(cx - r.left, r.width - menu.offsetWidth - 4));
  const y = Math.max(0, Math.min(cy - r.top, r.height - menu.offsetHeight - 4));
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
}
const onDocDown = () => closeMenu();

/* ---- 그리기 ---- */
/* 월요일부터 시작하는 주(calendar.Calendar(firstweekday=0).monthdatescalendar 와 같음) */
function monthWeeks(y, m){
  const first = new Date(y, m - 1, 1), start = new Date(y, m - 1, 1 - (first.getDay() + 6) % 7);
  const last = new Date(y, m, 0), weeks = [];
  for (let d = new Date(start); d <= last || weeks[weeks.length - 1].length < 7; d.setDate(d.getDate() + 1)){
    if (!weeks.length || weeks[weeks.length - 1].length === 7) weeks.push([]);
    weeks[weeks.length - 1].push(new Date(d));
  }
  return weeks;
}

function redraw(){
  if (!cal) return;
  closeMenu();
  const W = cal.clientWidth - 1, H = cal.clientHeight - 1;
  if (W < 50 || H < 50){ cal.innerHTML = ''; return; }
  const headH = DAY_LINE + 2 * PAD;
  const weeks = monthWeeks(year, month);
  const cw = W / 7, ch = (H - headH) / weeks.length;
  const store = TD.store || {}, notes = monthly().notes;
  const ann = TD.plan('annual') || {};
  const groups = {}; for (const g of ann.groups || []) groups[g.id] = g;
  const projects = ann.projects || [];
  const today = TD.todayIso();
  const px = v => Math.round(v) + 'px';
  let h = '';

  /* 요일 머리글(월요일부터 - 연간 계획과 같은 순서) */
  TD.WD.forEach((name, c) => {
    h += `<div class="tdm-wd${c === 5 ? ' sat' : c === 6 ? ' sun' : ''}" style="left:${px(c * cw)};top:0;width:${px(cw)};height:${px(headH)}">${name}</div>`;
  });

  weeks.forEach((week, r) => week.forEach((d, c) => {
    const x0 = Math.round(c * cw), y0 = Math.round(headH + r * ch);
    const x1 = Math.round((c + 1) * cw), y1 = Math.round(headH + (r + 1) * ch);
    const w = x1 - x0, hh = y1 - y0, inner = w - 2 * PAD;
    const inMonth = d.getMonth() + 1 === month, iso = TD.iso(d);
    const cls = iso === today ? ' today' : inMonth && c === 5 ? ' sat' : inMonth && c === 6 ? ' sun' : '';
    /* 칸끼리 테두리가 한 줄로 겹치도록 1px 더 넓게 그린다 */
    h += `<div class="tdm-cell${cls}" data-d="${iso}" style="left:${x0}px;top:${y0}px;width:${w + 1}px;height:${hh + 1}px">`;

    /* 날짜 숫자(다른 달의 날짜는 흐리게, "월/일"로) */
    const numCls = inMonth ? (c === 5 ? ' sat' : c === 6 ? ' sun' : '') : ' past';
    h += `<div class="tdm-num${numCls}" style="left:${PAD}px;top:${PAD}px">${inMonth ? d.getDate() : `${d.getMonth() + 1}/${d.getDate()}`}</div>`;

    /* 그 날짜 시간표의 계획 개수 · 이행률(계획이 있을 때만) */
    const entry = store[iso] || {}, plan = entry.tasks || [];
    if (plan.length){
      const rate = complianceRate(plan, entry.actual_tasks || []);
      h += `<div class="tdm-info" style="right:${PAD}px;top:${PAD + (DAY_LINE - SMALL_LINE) / 2}px">계획 ${plan.length}${rate === null ? '' : ` · ${rate}%`}</div>`;
    }

    let y = PAD + DAY_LINE + 4;
    /* 연간 계획 할 일 막대(그 날짜에 걸친 것만) */
    const covering = projects.filter(p => p.start && p.end && p.start <= iso && iso <= p.end);
    for (const p of covering.slice(0, MAX_BARS)){
      if (y + BAR_H > hh - PAD) break;
      const g = groups[p.group_id] || {};
      const color = g.color || p.color || TD.PROJECT_COLOR_PALETTE[0];
      h += `<div class="tdm-bar" style="left:${PAD}px;top:${y}px;width:${inner}px;background:${TD.esc(color)}">${TD.esc(p.name || '')}</div>`;
      y += BAR_H + 2;
    }
    if (covering.length > MAX_BARS && y + BAR_H <= hh - PAD){
      h += `<div class="tdm-more" style="left:${PAD}px;top:${y}px">+${covering.length - MAX_BARS}개 더</div>`;
      y += BAR_H;
    }
    if (covering.length) y += 2;

    /* 날짜 메모(한 줄에 하나씩, 칸에 넘치면 "⋯ 외 N줄") */
    const lines = (notes[iso] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const maxLines = Math.floor((hh - PAD - y) / NOTE_LINE);
    if (lines.length && maxLines > 0){
      let shown = lines;
      if (lines.length > maxLines){ shown = lines.slice(0, maxLines - 1); shown.push(`⋯ 외 ${lines.length - shown.length}줄`); }
      for (const ln of shown){
        h += `<div class="tdm-note${inMonth ? '' : ' past'}" style="left:${PAD}px;top:${y}px;width:${inner}px">${TD.esc('• ' + ln)}</div>`;
        y += NOTE_LINE;
      }
    }
    h += '</div>';
  }));
  cal.innerHTML = h;
}

const onVis = () => { if (document.hidden) saveGoal(); };
const onLeave = () => saveGoal();

TD.views[2] = {
  mount(target, opts = {}){
    el = target;
    const t = new Date();
    year = t.getFullYear(); month = t.getMonth() + 1;
    /* 5년 계획 등에서 달을 골라 들어올 때는 그 달로 연다 */
    if (opts.year && opts.month){ year = +opts.year; month = +opts.month; }
    el.innerHTML = `<div class="tdm-root">
      <div class="tdm-head"><span class="tdm-title">🗓 월간 계획</span>
        <div class="tdm-nav"><button class="tdm-arrow" data-n="-1">◀</button><span class="tdm-mlabel"></span><button data-n="0">오늘</button><button class="tdm-arrow" data-n="1">▶</button></div></div>
      <div class="tdm-tip">(칸을 두 번 클릭: 그날 메모 쓰기/수정 · 오른쪽 클릭: 메모 지우기/그 날짜 할 일 보기 · 단축키 1: 기본 화면 · 2: 월간 계획 · 3: 연간 계획 · 4: 5년 계획 · 5: 5개년 계획 차수 · L: 라이트/다크 · Esc: 닫기)</div>
      <div class="tdm-goal"><b></b><textarea spellcheck="false"></textarea></div>
      <div class="tdm-wrap"><div class="tdm-cal"></div></div>
    </div>`;
    root = el.querySelector('.tdm-root'); cal = el.querySelector('.tdm-cal'); ta = el.querySelector('.tdm-goal textarea');

    root.querySelector('.tdm-nav').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      b.blur();   // 단추에 포커스가 남아 있어도 단축키는 먹지만, 깔끔하게 뺀다
      const n = +b.dataset.n; if (n) shiftMonth(n); else goToday();
    });
    ta.addEventListener('input', saveGoal);
    ta.addEventListener('blur', saveGoal);

    /* 달력을 누르면 목표 칸에서 포커스를 빼서 1~5 단축키가 다시 먹게 한다(원래 canvas.focus_set) */
    cal.addEventListener('pointerdown', e => { if (e.button === 0 && document.activeElement === ta) ta.blur(); });
    cal.addEventListener('dblclick', e => {
      const c = e.target.closest('.tdm-cell'); if (!c) return;
      e.preventDefault(); editNote(c.dataset.d);
    });
    cal.addEventListener('contextmenu', e => {
      e.preventDefault();
      const c = e.target.closest('.tdm-cell'); if (!c) return;
      if (document.activeElement === ta) ta.blur();
      openMenu(c.dataset.d, e.clientX, e.clientY);
    });
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', onLeave);
    addEventListener('beforeunload', onLeave);

    ro = new ResizeObserver(() => redraw());
    ro.observe(cal);
    loadGoal(); redraw();
  },
  unmount(){
    saveGoal();
    if (ro) ro.disconnect();
    document.removeEventListener('pointerdown', onDocDown);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('pagehide', onLeave);
    removeEventListener('beforeunload', onLeave);
    closeMenu();
    el = root = cal = ta = ro = null; goalKey = '';
  },
  /* 원래 창에는 Esc(닫기) 말고 따로 쓰는 단축키가 없었다 */
  onKey(){ return false; },
  escBack(){ if (menu){ closeMenu(); return true; } return false; },
  onTheme(){ redraw(); },
  onData(kind){
    if (kind === 'monthly'){
      /* 다른 창이 바꿨다: 목표 칸에 쓰는 중이 아니면 새 내용으로 바꾼다 */
      if (ta && document.activeElement !== ta){ goalKey = monthKey(); ta.value = monthly().goals[goalKey] || ''; }
      redraw();
    } else if (kind === 'annual') redraw();
  },
};
})();
