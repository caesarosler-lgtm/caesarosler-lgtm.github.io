/* =====================================================================
   트레이딩 저널 — 체결 파일 가져오기 · 매매 묶기 · 손익 계산 (journal_calc.js, 2026-10-08 '국내 단타·스캘핑 복기 도구')
   화면(journal.html)과 시험(tests/journal_calc.test.js — node)이 함께 쓰는 '순수 계산'만 둔다. 화면 · 저장 · 서버는 여기 없다.
   돈은 모두 원 단위 정수 (부동소수점으로 금액을 계산하지 않는다).
   ===================================================================== */
(function(root){
'use strict';

/* ---------- 1. 체결 파일의 열 ---------- */
// [열 이름, 화면 이름, 꼭 있어야 하나]  — 종목코드 · 종목명은 둘 중 하나는 있어야 한다
const FIELDS = [
  ['date', '날짜', true], ['time', '시각', false], ['code', '종목코드', false], ['name', '종목명', false], ['side', '매수/매도', true],
  ['qty', '수량', true], ['price', '단가', true], ['fee', '수수료', false], ['tax', '세금', false], ['execNo', '체결번호', false],
];
const GUESS = {
  date: /체결일|거래일|매매일|주문일|일자|날짜|^date/i, time: /체결시간|체결시각|주문시간|시각|시간|^time/i, code: /종목코드|^코드$|단축코드|^code|symbol/i,
  name: /종목명|^종목$|^name/i, side: /매매구분|매도.?매수|매수.?매도|주문구분|^구분$|거래구분|^side|^type/i, qty: /체결수량|거래수량|^수량|qty|quantity/i,
  price: /체결단가|체결가격|체결가|거래단가|^단가|^가격|price/i, fee: /수수료|fee|commission/i, tax: /제세금|세금|거래세|농특세|tax/i, execNo: /체결번호|주문번호|원주문|exec|order.?no/i,
};
const ACCOUNT = /계좌|account|acct/i;   // 계좌번호 열은 고를 수 없고, 저장하지 않는다
const isAccountCol = h => ACCOUNT.test(String(h || ''));
const clean = s => String(s == null ? '' : s).trim();

/* 머리 줄 찾기: 위쪽 제목 줄을 건너뛰고, 아는 열 이름이 가장 많이 들어 있는 줄 (처음 15줄 안에서) */
function findHeader(rows){
  let best = 0, score = -1;
  rows.slice(0, 15).forEach((r, i) => {
    const s = r.filter(c => Object.values(GUESS).some(re => re.test(clean(c)))).length;
    if (s > score){ score = s; best = i; }
  });
  return best;
}
/* 머리 줄의 지문 — 같은 증권사 파일인지 알아보는 데 쓴다 (열 이름을 순서대로) */
const headerSig = head => head.map(h => clean(h).replace(/\s+/g, '')).filter(Boolean).join('|');
/* 처음 보는 파일: 열 이름으로 짐작 (사람이 화면에서 고친다) */
function guessMap(head){
  const map = {}, used = new Set();
  for (const [k] of FIELDS){
    const i = head.findIndex((h, j) => !used.has(j) && !isAccountCol(h) && GUESS[k].test(clean(h)));
    if (i >= 0){ map[k] = clean(head[i]); used.add(i); }
  }
  return map;
}

/* ---------- 2. 한 줄 → 체결 하나 (문제 있는 줄은 이유를 한국어로) ---------- */
function toInt(v){   // '1,234' · 1234 · '1234.0' → 1234,  '' → null,  1234.5 → NaN (정수가 아님)
  const s = clean(v).replace(/[,\s원주]/g, '');
  if (s === '' || s === '-') return null;
  if (!/^[-+]?\d+(\.0+)?$/.test(s)) return NaN;
  return parseInt(s, 10);
}
function toDate(v){
  const s = clean(v), m = s.match(/(\d{4})[-./년\s]?\s*(\d{1,2})[-./월\s]?\s*(\d{1,2})/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function toTime(v){   // '09:01:05' · '9:01' · '090105' · '90105' · 날짜와 함께 '2026-10-08 09:01:05'
  let s = clean(v);
  const dt = s.match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}[ T](\d{1,2}:\d{2}(?::\d{2})?)/); if (dt) s = dt[1];
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m){ const d = s.replace(/\D/g, ''); if (/^\d{5,6}$/.test(d)){ const p = d.padStart(6, '0'); m = [0, p.slice(0, 2), p.slice(2, 4), p.slice(4, 6)]; } else if (/^\d{3,4}$/.test(d)){ const p = d.padStart(4, '0'); m = [0, p.slice(0, 2), p.slice(2, 4), '00']; } }
  if (!m) return null;
  const [h, mi, se] = [+m[1], +m[2], +(m[3] || 0)];
  if (h > 23 || mi > 59 || se > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
}
function toSide(v){
  const s = clean(v);
  if (/매수|buy|^b$|^\+/i.test(s) && !/매도/.test(s)) return 'B';
  if (/매도|sell|^s$|^-/i.test(s)) return 'S';
  return null;
}
function toCode(v){
  let s = clean(v).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length === 7 && s[0] === 'A') s = s.slice(1);   // 'A005930'
  if (/^\d{1,6}$/.test(s)) s = s.padStart(6, '0');
  return /^[0-9A-Z]{6}$/.test(s) ? s : '';
}

/* rows = 파일의 모든 줄(글자 칸), headerIdx = 머리 줄 번호, map = {열 이름: 머리 줄의 이름}
   → {fills, errors: [{line, msg}], skipped}.  line = 파일에서 몇 번째 줄인지 (사람이 보는 번호, 1부터) */
function parseRows(rows, headerIdx, map){
  const head = (rows[headerIdx] || []).map(clean), col = {}, errors = [], fills = [];
  for (const [k] of FIELDS) if (map[k]){ const i = head.indexOf(map[k]); if (i >= 0 && !isAccountCol(head[i])) col[k] = i; }
  const need = FIELDS.filter(([k, , req]) => req && col[k] == null).map(([, l]) => l);
  if (col.code == null && col.name == null) need.push('종목코드 또는 종목명');
  if (need.length) return {fills, errors: [{line: headerIdx + 1, msg: `꼭 필요한 열을 고르지 않았어요: ${need.join(', ')}`}], skipped: 0, fatal: true};
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++){
    const r = rows[i], g = k => col[k] != null ? clean(r[col[k]]) : '', line = i + 1;
    if (!r.some(c => clean(c))){ skipped++; continue; }                      // 빈 줄
    if (/합계|소계|총계|total/i.test(r.map(clean).join(' ')) && !toDate(g('date'))){ skipped++; continue; }   // 합계 줄 (수량 합계가 적혀 있어도 날짜가 없으면)
    const bad = [];
    const date = toDate(g('date')); if (!date) bad.push(`날짜를 읽지 못했어요 ("${g('date')}")`);
    let time = col.time != null ? toTime(g('time')) : toTime(g('date'));
    if (col.time != null && !time) bad.push(`시각을 읽지 못했어요 ("${g('time')}")`);
    const side = toSide(g('side')); if (!side) bad.push(`매수인지 매도인지 알 수 없어요 ("${g('side')}")`);
    const qty = toInt(g('qty')); if (!(qty > 0)) bad.push(qty === null ? '수량이 비어 있어요' : Number.isNaN(qty) ? `수량이 정수가 아니에요 ("${g('qty')}")` : `수량이 0 이하예요 ("${g('qty')}")`);
    const price = toInt(g('price')); if (!(price > 0)) bad.push(price === null ? '단가가 비어 있어요' : Number.isNaN(price) ? `단가가 원 단위 정수가 아니에요 ("${g('price')}")` : `단가가 0 이하예요 ("${g('price')}")`);
    const fee = col.fee != null ? toInt(g('fee')) : null; if (Number.isNaN(fee) || fee < 0) bad.push(`수수료를 읽지 못했어요 ("${g('fee')}")`);
    const tax = col.tax != null ? toInt(g('tax')) : null; if (Number.isNaN(tax) || tax < 0) bad.push(`세금을 읽지 못했어요 ("${g('tax')}")`);
    const code = col.code != null ? toCode(g('code')) : '', name = g('name');
    if (col.code != null && !code && !name) bad.push(`종목코드를 읽지 못했어요 ("${g('code')}")`);
    if (!code && !name) bad.push('종목코드 · 종목명이 모두 비어 있어요');
    if (bad.length){ errors.push({line, msg: bad.join(' · ')}); continue; }
    fills.push({date, time: time || '', side, qty, price, fee: fee == null ? '' : fee, tax: side === 'S' && tax != null ? tax : '', code, name, execNo: g('execNo'), line});
  }
  return {fills, errors, skipped};
}

/* ---------- 3. 같은 체결을 두 번 넣지 않기 ----------
   체결 하나의 열쇠: 체결번호가 있으면 (증권사 + 날짜 + 체결번호), 없으면 (날짜 · 시각 · 종목 · 매수매도 · 단가 · 수량) + '같은 파일 안에서 몇 번째인지'.
   단타에서는 같은 초 · 같은 가격 · 같은 수량의 진짜 다른 체결이 나온다 → 순번으로 구분한다 (같은 파일을 다시 올리면 순번도 같아 중복으로 걸러진다). */
const baseKey = f => [f.date, (f.time || '').slice(0, 8), f.code || f.name, f.side, f.price, f.qty].join('|');
function fillKeys(fills, broker){
  const seen = new Map();
  return fills.map(f => {
    if (f.execNo) return `${broker || ''}|${f.date}|#${f.execNo}`;
    const b = baseKey(f), n = seen.get(b) || 0; seen.set(b, n + 1);
    return `${broker || ''}|${b}|~${n}`;
  });
}

/* ---------- 4. 체결 → 매매 (같은 증권사 · 같은 종목의 잔량이 0 에서 시작해 다시 0 이 될 때까지가 1건) ----------
   trades = 지금 매매들 (읽기만), fills = 새 체결 (시간 순으로 정렬해서 넘긴다)
   → {add, dup, newTrades: [{key, broker, code, name, fills}], append: [{tradeId, fills}]}  (화면이 이걸로 실제 기록을 만든다) */
const byDT = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
const posKey = (broker, code, name) => `${broker || ''}|${code || name}`;
function planImport(trades, fills, broker){
  const have = new Set(), legacy = new Map();   // 이미 있는 체결의 열쇠 (fid) · 열쇠가 없는 옛 체결은 내용으로 센다
  const open = new Map();                        // 지금 보유 중인 매매: posKey → {trade, qty}
  for (const t of trades){
    let q = 0;
    for (const f of t.fills || []){
      if (f.fid) have.add(f.fid);
      else { const k = [t.broker || '', f.date, (f.time || '').slice(0, 5), t.code || t.name, f.side, +f.price, +f.qty].join('|'); legacy.set(k, (legacy.get(k) || 0) + 1); }
      q += f.side === 'B' ? +f.qty : -(+f.qty);
    }
    if (q > 0) open.set(posKey(t.broker, t.code, t.name), {trade: t, qty: q});
  }
  const keys = fillKeys(fills, broker), out = {add: 0, dup: 0, newTrades: [], append: []}, appendBy = new Map();
  const order = fills.map((f, i) => i).sort((a, b) => byDT(fills[a], fills[b]) || a - b);
  for (const i of order){
    const f = fills[i], fid = keys[i];
    const lk = [broker || '', f.date, (f.time || '').slice(0, 5), f.code || f.name, f.side, f.price, f.qty].join('|');
    if (have.has(fid)){ out.dup++; continue; }
    if (legacy.get(lk) > 0){ legacy.set(lk, legacy.get(lk) - 1); out.dup++; continue; }
    have.add(fid);
    const pk = posKey(broker, f.code, f.name);
    let o = open.get(pk);
    if (!o || o.qty <= 0){
      o = {fresh: {key: pk + '|' + f.date + '|' + (f.time || ''), broker: broker || '', code: f.code, name: f.name || f.code, fills: []}, qty: 0};
      out.newTrades.push(o.fresh); open.set(pk, o);
    }
    const nf = {date: f.date, time: f.time, side: f.side, price: f.price, qty: f.qty, fee: f.fee, tax: f.tax, fid, ...(f.execNo ? {xno: f.execNo} : {})};
    if (o.fresh) o.fresh.fills.push(nf);
    else { if (!appendBy.has(o.trade.id)){ const a = {tradeId: o.trade.id, fills: []}; appendBy.set(o.trade.id, a); out.append.push(a); } appendBy.get(o.trade.id).fills.push(nf); }
    o.qty += f.side === 'B' ? f.qty : -f.qty;
    out.add++;
    if (o.qty <= 0) open.delete(pk);   // 잔량 0 = 이 매매 끝. 같은 날 다시 사면 새 매매
  }
  return out;
}

/* ---------- 5. 손익: 선입선출(FIFO) · 원 단위 정수 (2단계) ----------
   비율(%)은 1만분의 1 % 단위의 정수로 바꿔 쓴다: 0.015% → 150, 0.20% → 2000.  금액 × 단위 ÷ 1,000,000 을 내림 → 원 단위 정수.
   수수료 · 세금은 파일(증권사)의 실제 금액이 있으면 그것, 없으면 설정의 비율로 (매수 · 매도 모두 수수료, 세금은 매도만).
   매수 수수료는 그 매수 묶음(lot)의 원가에 넣고, 일부만 팔면 남은 수량에 비례해 내림으로 나눈다 (마지막 한 주가 나머지를 모두 가져가 합계가 정확히 맞는다).
   실현손익(매도 한 번) = 매도 금액 − 매도 수수료 − 세금 − (먼저 산 묶음부터 꺼낸 원가 + 그 몫의 매수 수수료). */
const rateUnits = pct => Math.round((Number(pct) || 0) * 10000);
function pctOf(amount, units){
  if (!amount || !units) return 0;
  const p = amount * units;
  return Number.isSafeInteger(p) ? Math.floor(p / 1000000) : Number(BigInt(amount) * BigInt(units) / 1000000n);
}
const given = v => v !== '' && v != null;
const feeOf = (f, feeUnits) => given(f.fee) ? Math.round(+f.fee) : pctOf(f.price * f.qty, feeUnits);
const taxOf = (f, taxUnits) => f.side !== 'S' ? 0 : given(f.tax) ? Math.round(+f.tax) : pctOf(f.price * f.qty, taxUnits);
const minutesOf = f => { const m = String(f.time || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? +m[1] * 60 + +m[2] + (+m[3] || 0) / 60 : null; };
function dayIndex(d){ const [y, m, dd] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5); }

function tradeCalc(fillsIn, opt = {}){
  const feeU = opt.feeUnits || 0, taxU = opt.taxUnits || 0;
  const fills = (fillsIn || []).map(f => ({...f, price: Math.round(+String(f.price ?? '').replace(/,/g, '')) || 0, qty: Math.round(+String(f.qty ?? '').replace(/,/g, '')) || 0, _src: f}))
    .filter(f => f.date && f.qty > 0 && f.price > 0).sort(byDT);
  const lots = [], rows = [], events = [];
  let qty = 0, cost = 0, realized = 0, buyAmt = 0, sellAmt = 0, buyQty = 0, sellQty = 0, fee = 0, tax = 0, maxQty = 0, maxCost = 0, closedCost = 0;
  for (const f of fills){
    const am = f.price * f.qty, fe = feeOf(f, feeU), tx = taxOf(f, taxU);
    let pnl = null;
    if (f.side === 'B'){
      lots.push({qty: f.qty, price: f.price, fee: fe});
      qty += f.qty; cost += am + fe; buyAmt += am; buyQty += f.qty;
    } else {
      let need = f.qty, basis = 0;
      while (need > 0 && lots.length){
        const lot = lots[0], n = Math.min(need, lot.qty), part = n === lot.qty ? lot.fee : Math.floor(lot.fee * n / lot.qty);
        basis += lot.price * n + part; lot.qty -= n; lot.fee -= part; need -= n;
        if (lot.qty === 0) lots.shift();
      }
      if (need > 0) basis += f.price * need;      // 산 기록보다 더 판 몫 (기록 누락): 손익 0 으로 본다
      pnl = am - fe - tx - basis;
      realized += pnl; closedCost += basis;
      qty = lots.reduce((s, l) => s + l.qty, 0); cost = lots.reduce((s, l) => s + l.price * l.qty + l.fee, 0);
      sellAmt += am; sellQty += f.qty;
      events.push({date: f.date, time: f.time || '', pnl});
    }
    fee += fe; tax += tx; maxQty = Math.max(maxQty, qty); maxCost = Math.max(maxCost, cost);
    rows.push({f: f._src, amt: am, fee: fe, tax: tx, qty, avg: qty ? cost / qty : 0, pnl});
  }
  const status = !fills.length ? 'plan' : qty > 0 ? 'open' : 'closed';
  const first = fills[0], last = fills[fills.length - 1];
  let holdMin = null;   // 보유 시간(분): 처음 체결 ~ 잔량 0 이 된 체결 (시각이 없으면 모름)
  if (status === 'closed' && minutesOf(first) != null && minutesOf(last) != null) holdMin = Math.round((dayIndex(last.date) - dayIndex(first.date)) * 1440 + minutesOf(last) - minutesOf(first));
  const em = first ? minutesOf(first) : null;
  return {fills: fills.map(f => f._src), rows, events, qty, cost, realized, buyAmt, sellAmt, buyQty, sellQty, fee, tax, maxQty, maxCost, closedCost, status,
    open: first ? first.date : null, close: status === 'closed' ? last.date : null, holdMin,
    entryTime: first ? (first.time || '') : '', entryMin: em == null ? null : Math.floor(em - 540)};   // entryMin = 장 시작(09:00) 뒤 몇 분에 들어갔나 (장전이면 음수)
}

/* ---------- 6. 분석 (4단계) ----------
   items = 청산한 매매 [{pnl 원(정수), r, open 'YYYY-MM-DD', close, closeTime, setup, mistakes[], emoPre, emoPost, again 'y'|'n'|'', entryMin, holdMin, holdDays, code, name}]
   val = 'pnl'(원) 또는 'r'(R 배수) — 합계 · 평균 · 기대값 · 낙폭은 이 값으로, 이김 · 짐은 늘 원 손익의 부호로 (원 > 0 이김, < 0 짐, 0 본전).
   승률 = 이긴 수 ÷ 전체(본전 포함). 손익비 = 평균 수익 ÷ |평균 손실|. 기대값 = 합계 ÷ 건수. 최대 낙폭 = 누적 고점에서 가장 많이 내려간 폭(음수).
   연속 손실 = 청산 순서로 짐(< 0)이 이어진 가장 긴 횟수 (이김 · 본전에서 끊김). */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function dowOf(d){ const [y, m, dd] = d.split('-').map(Number); return DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; }
function stats(list, val){
  const v = x => x[val] || 0, n = list.length;
  const W = list.filter(x => x.pnl > 0), L = list.filter(x => x.pnl < 0);
  const total = list.reduce((s, x) => s + v(x), 0), sw = W.reduce((s, x) => s + v(x), 0), sl = L.reduce((s, x) => s + v(x), 0);
  const avgWin = W.length ? sw / W.length : 0, avgLoss = L.length ? sl / L.length : 0;
  let cum = 0, peak = 0, mdd = 0, run = 0, maxLossStreak = 0;
  for (const x of list){
    cum += v(x); peak = Math.max(peak, cum); mdd = Math.min(mdd, cum - peak);
    run = x.pnl < 0 ? run + 1 : 0; maxLossStreak = Math.max(maxLossStreak, run);
  }
  return {n, wins: W.length, losses: L.length, flats: n - W.length - L.length, winRate: n ? W.length / n * 100 : 0, total, avgWin, avgLoss,
    payoff: W.length && L.length && avgLoss ? avgWin / Math.abs(avgLoss) : null, expectancy: n ? total / n : 0, mdd, maxLossStreak};
}
function groupBy(list, keyFn, val, order){
  const m = new Map();
  for (const x of list) for (const k of [].concat(keyFn(x))){ if (k == null || k === '') continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  const rows = [...m].map(([key, L]) => ({key, ...stats(L, val)}));
  return order ? rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : rows.sort((a, b) => b.total - a.total);
}
const hm = m => String(9 + Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function slotOf(entryMin, w){   // 장 시작(09:00) 뒤 w분 단위 칸, 정규장(09:00~15:30) 밖은 따로
  if (entryMin == null) return '(시각 모름)';
  if (entryMin < 0) return '장 전';
  if (entryMin >= 390) return '장 마감 뒤';
  const a = Math.floor(entryMin / w) * w; return hm(a) + '–' + hm(Math.min(a + w, 390));
}
const HOLD_ORDER = ['5분 미만', '5~15분', '15~30분', '30분~1시간', '1~3시간', '3시간 이상 (당일)', '오버나잇~5일', '6~20일', '21일 이상', '당일 (시각 모름)'];
function holdBucket(x){
  if (x.holdMin != null && x.open === x.close){
    const m = x.holdMin; return m < 5 ? '5분 미만' : m < 15 ? '5~15분' : m < 30 ? '15~30분' : m < 60 ? '30분~1시간' : m < 180 ? '1~3시간' : '3시간 이상 (당일)';
  }
  const d = x.holdDays || 0; return d === 0 ? '당일 (시각 모름)' : d <= 5 ? '오버나잇~5일' : d <= 20 ? '6~20일' : '21일 이상';
}
function analyze(itemsIn, val = 'pnl'){
  const items = [...itemsIn].sort((a, b) => (a.close + (a.closeTime || '')).localeCompare(b.close + (b.closeTime || '')));
  const slotOrder = w => ['장 전', ...Array.from({length: Math.ceil(390 / w)}, (_, i) => hm(i * w) + '–' + hm(Math.min(i * w + w, 390))), '장 마감 뒤', '(시각 모름)'];
  let cum = 0;
  return {
    basic: stats(items, val),
    // 실수: 그 실수가 있었던 매매의 손익을 실수마다 더한다 (한 매매에 실수가 둘이면 둘 다에 들어간다) — 가장 많이 잃게 한 실수부터
    byMistake: groupBy(items, x => x.mistakes || [], val).sort((a, b) => a.total - b.total),
    bySetup: groupBy(items, x => x.setup || '(미지정)', val).sort((a, b) => b.expectancy - a.expectancy),
    bySlot10: groupBy(items, x => slotOf(x.entryMin, 10), val, slotOrder(10)),
    bySlot30: groupBy(items, x => slotOf(x.entryMin, 30), val, slotOrder(30)),
    byDow: groupBy(items, x => x.open ? dowOf(x.open) + '요일' : '', val, ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']),
    byHold: groupBy(items, holdBucket, val, HOLD_ORDER),
    bySymbol: groupBy(items, x => x.name || x.code || '(종목 없음)', val),
    byEmoPre: groupBy(items, x => x.emoPre || '(미기록)', val),
    byEmoPost: groupBy(items, x => x.emoPost || '(미기록)', val),
    byAgain: groupBy(items, x => x.again === 'y' ? '예 — 다시 해도 같은 매매' : x.again === 'n' ? '아니오 — 다시는 안 한다' : '(답하지 않음)', val, ['예 — 다시 해도 같은 매매', '아니오 — 다시는 안 한다', '(답하지 않음)']),
    curve: items.map(x => ({x, cum: (cum += x[val] || 0)})),
  };
}

/* ---------- 7. AI 주간 복기에 보내는 요약 (5단계) ----------
   분석에 필요한 것만, 늘 R 단위로 (원 금액 · 계좌 규모 · 증권사 · 체결번호 · 계좌번호는 넣지 않는다). items 는 analyze 와 같은 모양. */
const fRr = v => (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + Math.abs(v).toFixed(2) + 'R';
function weekFacts(items){
  const a = analyze(items, 'r'), b = a.basic, L = [];
  L.push(`[이번 주 숫자 — R 단위] 청산 ${b.n}건 · ${b.wins}승 ${b.losses}패${b.flats ? ' ' + b.flats + '본전' : ''} · 승률 ${b.winRate.toFixed(0)}% · 합계 ${fRr(b.total)} · 기대값 ${fRr(b.expectancy)} · 손익비 ${b.payoff ? b.payoff.toFixed(2) : '–'} · 최대 낙폭 ${fRr(b.mdd)} · 연속 손실 최대 ${b.maxLossStreak}번`);
  const row = r => `${r.key} ${r.n}건 · 승률 ${r.winRate.toFixed(0)}% · 기대값 ${fRr(r.expectancy)} · 합계 ${fRr(r.total)}`;
  if (a.bySetup.length) L.push('[셋업별]', ...a.bySetup.map(r => '- ' + row(r)));
  if (a.byMistake.length) L.push('[실수 태그별 — 많이 잃게 한 순]', ...a.byMistake.map(r => `- ${r.key} ${r.n}건 · 합계 ${fRr(r.total)}`));
  const ag = a.byAgain.filter(r => !r.key.startsWith('('));
  if (ag.length) L.push('[다시 해도 같은 매매를 하겠다는 답]', ...ag.map(r => '- ' + row(r)));
  const sl = a.bySlot30.filter(r => r.key.includes('–'));
  if (sl.length) L.push('[진입 시각 — 30분 단위]', ...sl.map(r => '- ' + row(r)));
  if (a.byEmoPre.some(r => !r.key.startsWith('('))) L.push('[매매 전 감정별]', ...a.byEmoPre.map(r => '- ' + row(r)));
  return L.join('\n');
}

/* ---------- 9. 훈련 문제은행 (2026-10-10, 드림로드 노트부터) ----------
   문제 case = {id, src, ref(노트의 어느 곳), topic, level 1~3, kind 'pick'|'num'|'ox', stem(상황), q(질문), choices[], ans, tol, unit, why(해설), status 'draft'|'ok'|'off', virtual, created}
     ans: pick = 고른 번호(0부터) · num = 숫자(± tol 까지 정답) · ox = 'o' | 'x'.  정답은 '앞으로 오를까'가 아니라 '노트의 원칙대로라면' 이다.
   풀이 log = {id, cid, at(ISO), day(YYYY-MM-DD), a, ok, conf 1~3, ms}
   간격 반복: 연속으로 맞힌 횟수 n → 다음 출제는 마지막 날 + DRILL_IV[n-1] 일. 틀리면 같은 날 한 번 더(맨 뒤에), 하루 두 번까지. */
const DRILL_IV = [1, 3, 7, 16, 35, 75];
const addDaysIso = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
function drillCheck(c, a){
  if (c.kind === 'num'){ const v = Number(String(a ?? '').replace(/[,\s원%주]/g, '')); return String(a ?? '').trim() !== '' && Number.isFinite(v) && Math.abs(v - Number(c.ans)) <= (Number(c.tol) || 0); }
  return String(a) === String(c.ans);
}
function drillState(log){   // cid → {n 연속 정답, tries, oks, last 마지막 날, lastOk, today 오늘 푼 횟수는 drillQueue 에서, due 다음 출제일}
  const m = {};
  [...log].filter(l => l && l.cid).sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach(l => {
    const s = m[l.cid] || (m[l.cid] = {n: 0, tries: 0, oks: 0, last: '', lastOk: false, days: {}});
    s.tries++; if (l.ok){ s.oks++; s.n++; } else s.n = 0; s.last = l.day; s.lastOk = !!l.ok; s.days[l.day] = (s.days[l.day] || 0) + 1;
  });
  for (const k in m){ const s = m[k]; s.due = s.lastOk ? addDaysIso(s.last, DRILL_IV[Math.min(s.n, DRILL_IV.length) - 1]) : s.last; }
  return m;
}
function drillQueue(cases, log, day){   // 오늘 낼 문제 id 순서: 다시 볼 때가 된 것 → 새 문제(쉬운 것부터) → 오늘 틀린 것(맨 뒤)
  const st = drillState(log), ok = cases.filter(c => c && c.status === 'ok');
  const due = [], fresh = [], wrong = [];
  ok.forEach((c, i) => {
    const s = st[c.id];
    if (!s) fresh.push([c, i]);
    else if (s.last === day){ if (!s.lastOk && (s.days[day] || 0) < 2) wrong.push([c, i]); }
    else if (s.due <= day) due.push([c, i, s]);
  });
  due.sort((a, b) => a[2].due.localeCompare(b[2].due) || a[1] - b[1]);
  fresh.sort((a, b) => (Number(a[0].level) || 1) - (Number(b[0].level) || 1) || a[1] - b[1]);
  return [...due, ...fresh, ...wrong].map(x => x[0].id);
}
function drillStats(cases, log, day){
  const ok = cases.filter(c => c && c.status === 'ok'), byId = Object.fromEntries(ok.map(c => [c.id, c])), L = log.filter(l => l && byId[l.cid]), st = drillState(L);
  const rate = (n, k) => n ? k / n * 100 : null;
  const grp = (keyOf, order) => { const g = {}; L.forEach(l => { const k = keyOf(l); const x = g[k] || (g[k] = {key: k, n: 0, ok: 0}); x.n++; if (l.ok) x.ok++; });
    const out = Object.values(g).map(x => ({...x, rate: rate(x.n, x.ok)})); return order ? out.sort(order) : out; };
  const days = new Set(L.map(l => l.day)); let streak = 0, d = days.has(day) ? day : addDaysIso(day, -1);
  while (days.has(d)){ streak++; d = addDaysIso(d, -1); }
  const topicCases = {}; ok.forEach(c => { const k = c.topic || '(유형 없음)'; topicCases[k] = (topicCases[k] || 0) + 1; });
  return {cases: ok.length, tries: L.length, oks: L.filter(l => l.ok).length, rate: rate(L.length, L.filter(l => l.ok).length),
    today: L.filter(l => l.day === day).length, todayOk: L.filter(l => l.day === day && l.ok).length, streak,
    seen: Object.keys(st).length, mastered: Object.values(st).filter(s => s.n >= 3).length,
    byTopic: grp(l => byId[l.cid].topic || '(유형 없음)', (a, b) => (a.rate ?? 101) - (b.rate ?? 101) || b.n - a.n).map(x => ({...x, cases: topicCases[x.key] || 0})),
    byConf: [1, 2, 3].map(c => { const xs = L.filter(l => Number(l.conf) === c), k = xs.filter(l => l.ok).length; return {conf: c, n: xs.length, ok: k, rate: rate(xs.length, k)}; })};
}

const JC = {FIELDS, GUESS, isAccountCol, findHeader, headerSig, guessMap, toInt, toDate, toTime, toSide, toCode, parseRows, baseKey, fillKeys, planImport, byDT,
  rateUnits, pctOf, feeOf, taxOf, tradeCalc, minutesOf, stats, groupBy, slotOf, holdBucket, analyze, dowOf, weekFacts,
  DRILL_IV, addDaysIso, drillCheck, drillState, drillQueue, drillStats};
if (typeof module !== 'undefined' && module.exports) module.exports = JC; else root.JC = JC;
})(typeof window !== 'undefined' ? window : globalThis);
