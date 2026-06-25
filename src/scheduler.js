// 林口長庚婦產科住院醫師排班「數量」計算核心。
// 只計算各班別/各職級/每人應值幾平幾假，不產生逐日班表。
//
// 硬性上限（絕對不破）：每人 ≤ 8 班、≤ 3 假。
// 平日軟上限 6（允許 5平3假 與 6平2假 兩種型態）。
// 特休只減平日、不減假日。

export const MAX_TOTAL = 8; // 每人總班數硬上限
export const MAX_WEEKEND = 3; // 每人假日硬上限
export const MAX_WEEKDAY = 6; // 平日軟上限（容許 6平2假）

const D = (v) => (v == null ? 0 : Number(v));

// ---------- Task 2: normalizeInput ----------
export function normalizeInput(raw) {
  const lvl = (o = {}) => ({ ...o, count: D(o.count) });
  const m = raw.month || {};
  const t = raw.taipei || {};
  const r = raw.remaining || {};
  const ward = r.ward || {};
  const l5 = r.l5 || {};
  return {
    month: {
      weekday: D(m.weekday),
      weekend: D(m.weekend),
      lastDayIsWeekend: !!m.lastDayIsWeekend,
    },
    taipei: { r1to3: D(t.r1to3), r4: D(t.r4), f1: D(t.f1) },
    linko: Object.fromEntries(
      Object.entries(raw.linko || {}).map(([k, v]) => [k, lvl(v)])
    ),
    remaining: {
      ward: { weekday: D(ward.weekday), weekend: D(ward.weekend) },
      l5: { weekday: D(l5.weekday), weekend: D(l5.weekend) },
    },
  };
}

// ---------- Task 3: buildDemands ----------
export function buildDemands(n) {
  const day = { weekday: n.month.weekday, weekend: n.month.weekend };
  return {
    ward: { ...n.remaining.ward },
    L5: { ...n.remaining.l5 },
    L1: { ...day },
    L: { ...day },
    T1: { ...day },
    T2: { ...day },
    LR: { ...day },
  };
}

// ---------- Task 4 / 6: allocation engine ----------
export function createPersonPool(levels) {
  const pool = {};
  for (const [name, lv] of Object.entries(levels)) {
    pool[name] = {
      count: lv.count,
      weekday: 0,
      weekend: 0,
      bigLeave: lv.bigLeave || 0,
      smallLeave: lv.smallLeave || 0,
      keelung: lv.keelung || 0,
      byShift: {}, // {L1:{weekday,weekend},...}
    };
  }
  return pool;
}

// T1/T2 時，基隆籍不可值班 → 有效人數扣除基隆籍。
function effectiveCount(g, opts) {
  return opts.excludeKeelung ? Math.max(0, g.count - (g.keelung || 0)) : g.count;
}

// 群組剩餘可吃容量（以有效人數 × 上限估算）。
function groupCapacity(g, effCount) {
  const c = effCount == null ? g.count : effCount;
  const wkCap = c * MAX_WEEKDAY - g.weekday; // 平日寬鬆到 6
  const wendCap = c * MAX_WEEKEND - g.weekend;
  const totalCap = c * MAX_TOTAL - (g.weekday + g.weekend);
  return {
    wkCap: Math.max(0, wkCap),
    wendCap: Math.max(0, wendCap),
    totalCap: Math.max(0, totalCap),
  };
}

function addToGroup(g, shift, wk, wend) {
  g.weekday += wk;
  g.weekend += wend;
  g.byShift[shift] = g.byShift[shift] || { weekday: 0, weekend: 0 };
  g.byShift[shift].weekday += wk;
  g.byShift[shift].weekend += wend;
}

export function fillShift(pool, order, shift, demand, opts = {}) {
  let { weekday, weekend } = demand;
  for (const name of order) {
    const g = pool[name];
    if (!g) continue;
    const effCount = effectiveCount(g, opts);
    if (effCount === 0) continue;
    const cap = groupCapacity(g, effCount);
    // 假日稀缺 → 先吃假日，再吃平日（但都不可超 totalCap）。
    let takeWend = Math.min(weekend, cap.wendCap, cap.totalCap);
    let takeWk = Math.min(weekday, cap.wkCap, cap.totalCap - takeWend);
    // opts.shiftCap：此班別在此群組的總量上限（R3 的 L 班用）。
    if (opts.shiftCap != null) {
      const used = (g.byShift[shift]?.weekday || 0) + (g.byShift[shift]?.weekend || 0);
      const allow = Math.max(0, opts.shiftCap - used);
      if (takeWk + takeWend > allow) {
        takeWend = Math.min(takeWend, allow); // 先保假日
        takeWk = Math.min(takeWk, allow - takeWend);
      }
    }
    if (takeWk + takeWend > 0) addToGroup(g, shift, takeWk, takeWend);
    weekday -= takeWk;
    weekend -= takeWend;
    if (weekday <= 0 && weekend <= 0) break;
  }
  return { weekday: Math.max(0, weekday), weekend: Math.max(0, weekend) };
}

// ---------- Task 7: applyLeaveAdjustment ----------
// 將群組總平/假班數依特休拆解為 normal / big / small 每人平假，並做同級吸收。
// 特休只減平日，假日永遠均分不減。
export function applyLeaveAdjustment(g) {
  const { count, weekday, weekend, bigLeave = 0, smallLeave = 0 } = g;
  const normalCount = count - bigLeave - smallLeave;
  const wendEach = count > 0 ? Math.round(weekend / count) : 0;
  const baseWk = count > 0 ? Math.floor(weekday / count) : 0;
  const big = { weekday: Math.max(0, baseWk - 2), weekend: wendEach };
  const small = { weekday: Math.max(0, baseWk - 1), weekend: wendEach };
  const normal = { weekday: baseWk, weekend: wendEach };

  // 特休者少值的平日總額（大特休 -2、小特休 -1）。
  const freed = bigLeave * 2 + smallLeave * 1;
  const normalAdjusted = { ...normal };
  const pushedUp = { weekday: 0, weekend: 0 };

  if (normalCount > 0) {
    const addEach = Math.floor(freed / normalCount);
    const newWk = baseWk + addEach;
    const wkCeil = MAX_TOTAL - wendEach; // 在此假日數下的平日上限（受總 8 班約束）
    if (newWk > wkCeil) {
      normalAdjusted.weekday = wkCeil;
      pushedUp.weekday = (newWk - wkCeil) * normalCount;
    } else {
      normalAdjusted.weekday = newWk;
    }
  } else if (freed > 0) {
    // 全員特休 → 整批往上推。
    pushedUp.weekday = freed;
  }

  return { normal, normalAdjusted, big, small, pushedUp, normalCount, bigLeave, smallLeave };
}

// ---------- Task 8: formatResult ----------
function fmtGroup(g) {
  const adj = applyLeaveAdjustment(g);
  const out = {
    count: g.count,
    total: { weekday: g.weekday, weekend: g.weekend },
    byShift: g.byShift,
    perPerson: adj.normalAdjusted,
  };
  if (g.bigLeave > 0) out.bigLeavePerPerson = adj.big;
  if (g.smallLeave > 0) out.smallLeavePerPerson = adj.small;
  return out;
}

function formatResult(linko, taipei, n, warnings) {
  const L = {};
  for (const k of ['y2', 'r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3']) {
    L[k] = fmtGroup(linko[k]);
  }
  const Tp = {};
  for (const [k, src] of [['r1to3', 'tr1to3'], ['r4', 'tr4'], ['f1', 'tf1']]) {
    const g = taipei[src];
    Tp[k] = {
      count: g.count,
      T1: g.byShift.T1 || { weekday: 0, weekend: 0 },
      T2: g.byShift.T2 || { weekday: 0, weekend: 0 },
    };
  }
  return { taipei: Tp, linko: L, warnings };
}

// ---------- Task 9: validateLimits ----------
function validateLimits(linko, warnings) {
  const minF = { f1: 3, f2: 2, f3: 1 };
  let anyFbelow = false;
  for (const [k, min] of Object.entries(minF)) {
    const g = linko[k];
    if (g.count > 0) {
      const each = (g.weekday + g.weekend) / g.count;
      if (each < min - 1e-9) {
        anyFbelow = true;
        warnings.push(`${k.toUpperCase()} 每人約 ${each.toFixed(1)} 班，低於最低 ${min} 班`);
      }
    }
  }
  for (const k of ['y2', 'r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3']) {
    const g = linko[k];
    if (g.count === 0) continue;
    const totEach = (g.weekday + g.weekend) / g.count;
    const wendEach = g.weekend / g.count;
    if (totEach > MAX_TOTAL + 1e-9) {
      warnings.push(`${k.toUpperCase()} 每人約 ${totEach.toFixed(1)} 班，超過 8 班上限`);
    }
    if (wendEach > MAX_WEEKEND + 1e-9) {
      warnings.push(`${k.toUpperCase()} 每人約 ${wendEach.toFixed(1)} 假日班，超過 3 假上限`);
    }
    if (!anyFbelow && ['r1', 'r2', 'r3', 'r4'].includes(k) && totEach < MAX_TOTAL - 1e-9) {
      warnings.push(
        `${k.toUpperCase()} 每人約 ${totEach.toFixed(1)} 班，低於 8 班（無 F 級缺額時 R 級不應低於 8）`
      );
    }
  }

  // 職級單調性（假日）：低職級假日 ≥ 高職級，差距過大時警示（非硬性重排）。
  const ranks = ['r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3'];
  for (let i = 0; i < ranks.length - 1; i++) {
    const lo = linko[ranks[i]];
    const hi = linko[ranks[i + 1]];
    if (lo.count === 0 || hi.count === 0) continue;
    const loW = lo.weekend / lo.count;
    const hiW = hi.weekend / hi.count;
    if (hiW - loW > 1 + 1e-9) {
      warnings.push(
        `假日單調性：${ranks[i + 1].toUpperCase()} 每人 ${hiW.toFixed(1)} 假，高於低職級 ${ranks[i].toUpperCase()} ${loW.toFixed(1)} 假，請人工微調`
      );
    }
  }
}

// ---------- Task 5: calculateSchedule ----------
export function calculateSchedule(raw) {
  const n = normalizeInput(raw);
  const demands = buildDemands(n);
  const L = n.linko;
  const T = n.taipei;

  const get = (k) => L[k] || { count: 0 };
  const linko = createPersonPool({
    y2: get('y2'),
    r1: get('r1'),
    r2: get('r2'),
    r3: get('r3'),
    r4: get('r4'),
    f1: get('f1'),
    f2: get('f2'),
    f3: get('f3'),
  });
  const taipei = createPersonPool({
    tr1to3: { count: T.r1to3 },
    tr4: { count: T.r4 },
    tf1: { count: T.f1 },
  });

  const warnings = [];
  const leftover = (label, r) => {
    if (r.weekday > 0 || r.weekend > 0) {
      warnings.push(`${label} 缺人：尚有 ${r.weekday}平${r.weekend}假 無法分配`);
    }
  };

  // 1 病房班：Y2(可值最後一天) → R1 → R2 → R3
  leftover('病房班', fillShift(linko, ['y2', 'r1', 'r2', 'r3'], 'ward', demands.ward));
  // 2 L5：Y2、R1 → R2 → R3 → R4 → F1
  leftover('L5', fillShift(linko, ['y2', 'r1', 'r2', 'r3', 'r4', 'f1'], 'L5', demands.L5));
  // 3 L1：R2 → R3
  leftover('L1', fillShift(linko, ['r2', 'r3'], 'L1', demands.L1));
  // 4 L（總值班）：R3（受班數上限）→ R4 → F1 → F2
  {
    let rem = fillShift(linko, ['r3'], 'L', demands.L, { shiftCap: get('r3').lCapShifts || 0 });
    rem = fillShift(linko, ['r4', 'f1', 'f2'], 'L', rem);
    leftover('L', rem);
  }
  // 5 T1：台北R1-3 → 台北R4 → 林R1 → R2 → R3 → R4 → 台北F1（林口基隆籍跳過）
  {
    let rem = fillShift(taipei, ['tr1to3', 'tr4'], 'T1', demands.T1);
    rem = fillShift(linko, ['r1', 'r2', 'r3', 'r4'], 'T1', rem, { excludeKeelung: true });
    rem = fillShift(taipei, ['tf1'], 'T1', rem);
    leftover('T1', rem);
  }
  // 6 T2：台北F1 → 林R4 → 林F1 → 林F2 → 林F3（林口基隆籍跳過）
  {
    let rem = fillShift(taipei, ['tf1'], 'T2', demands.T2);
    rem = fillShift(linko, ['r4', 'f1', 'f2', 'f3'], 'T2', rem, { excludeKeelung: true });
    leftover('T2', rem);
  }
  // 7 LR：林R4 → 林F1 → 林F2 → 林F3
  leftover('LR', fillShift(linko, ['r4', 'f1', 'f2', 'f3'], 'LR', demands.LR));

  validateLimits(linko, warnings);
  return formatResult(linko, taipei, n, warnings);
}
