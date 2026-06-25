// UI 層：讀表單 → 呼叫 calculateSchedule → 渲染結果與警示。
import { getMonthDays } from './holidays2026.js';
import { calculateSchedule } from './scheduler.js';

const $ = (id) => document.getElementById(id);

// 班別代碼 → 中文標籤（依 spec §5）。
const SHIFT_LABEL = {
  ward: '病房班',
  L5: 'L5',
  L1: 'L1',
  L: 'L',
  T1: 'T1',
  T2: 'T2',
  LR: 'LR',
};
// byShift 顯示順序（與 spec §5 一致）。
const SHIFT_ORDER = ['ward', 'L', 'L1', 'T1', 'L5', 'T2', 'LR'];
const LINKO_ORDER = ['y2', 'r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3'];

// {weekday,weekend} → "X平Y假"
function pf(p) {
  const wk = p && p.weekday ? p.weekday : 0;
  const wend = p && p.weekend ? p.weekend : 0;
  return `${wk}平${wend}假`;
}

// 選月份 → 自動帶入天數（可手動覆寫）。
function onMonthChange() {
  const m = Number($('month').value);
  const r = getMonthDays(2026, m);
  $('weekday').value = r.weekday;
  $('weekend').value = r.weekend;
  $('lastDayIsWeekend').checked = r.lastDayIsWeekend;
}

// 讀取所有欄位為 calculateSchedule 期望的 INPUT 形狀。
function readInput() {
  const num = (id) => {
    const el = $(id);
    return el ? Number(el.value || 0) : 0;
  };
  // 基本職級（人數 + 大/小特休 + 可選基隆籍）。
  const lv = (p, withKeelung) => {
    const o = { count: num(p + '_count'), bigLeave: num(p + '_big'), smallLeave: num(p + '_small') };
    if (withKeelung) o.keelung = num(p + '_keelung');
    return o;
  };
  return {
    month: {
      weekday: num('weekday'),
      weekend: num('weekend'),
      lastDayIsWeekend: $('lastDayIsWeekend') ? $('lastDayIsWeekend').checked : false,
    },
    taipei: { r1to3: num('t_r1to3'), r4: num('t_r4'), f1: num('t_f1') },
    linko: {
      y2: { count: num('y2_count'), canLastDay: num('y2_last') },
      r1: lv('r1', false),
      r2: lv('r2', true),
      r3: { ...lv('r3', true), lCapablePeople: num('r3_lppl'), lCapShifts: num('r3_lcap') },
      r4: lv('r4', true),
      f1: lv('f1', false),
      f2: lv('f2', false),
      f3: lv('f3', false),
    },
    remaining: {
      ward: { weekday: num('ward_wk'), weekend: num('ward_wend') },
      l5: { weekday: num('l5_wk'), weekend: num('l5_wend') },
    },
  };
}

// 建一個 class + text 的元素。
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderTaipei(tp) {
  const wrap = el('div', 'result-group');
  wrap.appendChild(el('h3', null, '台北輪訓'));
  // R1-3：只 T1；R4 / F1：T1 + T2。
  const rows = [
    ['R1-3', tp.r1to3, false],
    ['R4', tp.r4, true],
    ['F1', tp.f1, true],
  ];
  for (const [name, g, withT2] of rows) {
    if (!g) continue;
    const line = el('div', 'rline');
    line.appendChild(el('span', null, `${name} `));
    line.appendChild(el('span', 'cnt', `${g.count} 人`));
    let txt = `：總共應值 T1 ${pf(g.T1)}`;
    if (withT2) txt += `、T2 ${pf(g.T2)}`;
    line.appendChild(el('span', null, txt));
    wrap.appendChild(line);
  }
  return wrap;
}

function renderLinkoGroup(name, g) {
  const wrap = el('div', 'result-group');
  const h = el('h3', null, name.toUpperCase() + ' ');
  h.appendChild(el('span', 'cnt', `${g.count} 人`));
  wrap.appendChild(h);

  // 各班別總數（依固定順序，只顯示有值的班別）。
  const parts = [];
  const bs = g.byShift || {};
  for (const k of SHIFT_ORDER) {
    if (bs[k]) parts.push(`${SHIFT_LABEL[k] || k} ${pf(bs[k])}`);
  }
  // 防漏：若有未在順序表內的班別也補上。
  for (const k of Object.keys(bs)) {
    if (!SHIFT_ORDER.includes(k)) parts.push(`${SHIFT_LABEL[k] || k} ${pf(bs[k])}`);
  }
  const shiftLine = el('div', 'rline');
  shiftLine.appendChild(el('span', 'lbl', '各班別：'));
  shiftLine.appendChild(el('span', null, parts.length ? parts.join('、') : '（無）'));
  wrap.appendChild(shiftLine);

  // 每人。
  const pp = el('div', 'rline perperson', `因此每人 ${pf(g.perPerson)}`);
  wrap.appendChild(pp);

  // 大/小特休（只在 result 物件含有時顯示）。
  if (g.bigLeavePerPerson) {
    wrap.appendChild(el('div', 'rline leave', `大特休：${pf(g.bigLeavePerPerson)}`));
  }
  if (g.smallLeavePerPerson) {
    wrap.appendChild(el('div', 'rline leave', `小特休：${pf(g.smallLeavePerPerson)}`));
  }
  return wrap;
}

function renderWarnings(warnings) {
  const box = $('warnings');
  box.textContent = '';
  if (!warnings || warnings.length === 0) {
    box.appendChild(el('div', 'ok-box', '\u2713 無警示'));
    return;
  }
  const wb = el('div', 'warn-box');
  wb.appendChild(el('div', null, `\u26A0 警示（${warnings.length}）：請人工調整`));
  const ul = el('ul');
  for (const w of warnings) ul.appendChild(el('li', null, w));
  wb.appendChild(ul);
  box.appendChild(wb);
}

function render(result) {
  renderWarnings(result.warnings);

  const out = $('result');
  out.textContent = '';

  out.appendChild(el('div', 'section-title', '台北輪訓'));
  out.appendChild(renderTaipei(result.taipei));

  out.appendChild(el('div', 'section-title', '林口各職級'));
  for (const k of LINKO_ORDER) {
    const g = result.linko[k];
    if (g) out.appendChild(renderLinkoGroup(k, g));
  }
}

function init() {
  const monthSel = $('month');
  if (monthSel) monthSel.addEventListener('change', onMonthChange);
  const calcBtn = $('calc');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      try {
        render(calculateSchedule(readInput()));
      } catch (err) {
        const box = $('warnings');
        if (box) {
          box.textContent = '';
          box.appendChild(el('div', 'warn-box', '計算發生錯誤：' + (err && err.message ? err.message : String(err))));
        }
      }
    });
  }
  onMonthChange();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
