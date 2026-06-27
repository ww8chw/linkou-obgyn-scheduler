// 林口長庚婦產科住院醫師排班「數量」計算核心。
// 只計算各班別/各職級/每人應值幾平幾假，不產生逐日班表。
//
// 硬性上限（絕對不破）：每人 ≤ 8 班、≤ 3 假。
// 平日軟上限 6（允許 5平3假 與 6平2假 兩種型態）。
// 特休只減平日、不減假日。

export const MAX_TOTAL = 8; // 每人總班數硬上限
export const MAX_WEEKEND = 3; // 每人假日硬上限
export const MAX_WEEKDAY = 6; // 平日軟上限（容許 6平2假）
const EPS = 1e-9; // 浮點比較容差

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
    taipei: {
      r1to3: D(t.r1to3),
      r4: D(t.r4),
      f1: D(t.f1),
      f1Big: D(t.f1Big),
      f1Small: D(t.f1Small),
    },
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
// 特休（大特休 -2 平、小特休 -1 平）會降低群組「真實」平日/總容量，
// 故從 wkCap/totalCap 扣除 freed，使 fillShift 在特休重的群組提早停止，
// 剩餘自然流向下一職級（spec §4.4c「往上一個職級順位推」）。假日不受特休影響。
function groupCapacity(g, effCount) {
  const c = effCount == null ? g.count : effCount;
  const freed = (g.bigLeave || 0) * 2 + (g.smallLeave || 0) * 1;
  const wkCap = c * MAX_WEEKDAY - g.weekday - freed; // 平日寬鬆到 6，再扣特休釋出
  const wendCap = c * MAX_WEEKEND - g.weekend;
  const totalCap = c * MAX_TOTAL - (g.weekday + g.weekend) - freed;
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
  // 與平日 baseWk 一致：per-person 週末取 floor，保證 count * wendEach 不超過真實總額，
  // 餘數 (weekend % count) 由排班者手動分配給部分人，本工具只報均分的基準值。
  const wendEach = count > 0 ? Math.floor(weekend / count) : 0;
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

// ---------- 每人分佈（處理不整除 + 特休）----------
// 規則：
//  - 先分假日：一班一班發給目前假日最少者（不破 3 假上限），多出的假日優先給
//    無特休者 → 特休者落在假日較少組。
//  - 再分平日：水位填充「個人總班數(含已分配假日)+handicap」最低者；特休者帶
//    handicap（大特休 +2、小特休 +1），因此總班數較少（平日永不為負）。
//  - 全體加總恆等於群組配額（假日加總=E、平日加總=W，絕不靜默增減）。
//  - 特休者班數本就較少，不由他人吸收。
// 回傳 [{people, leave:null|'small'|'big', weekday, weekend}]。
export function distributePerson(count, weekday, weekend, bigLeave = 0, smallLeave = 0) {
  if (count <= 0) return [];
  const n = count;
  // 每人特休別與 handicap（特休者總班數較少）。
  const leaveType = [];
  for (let i = 0; i < bigLeave; i++) leaveType.push('big');
  for (let i = 0; i < smallLeave; i++) leaveType.push('small');
  for (let i = 0; i < n - bigLeave - smallLeave; i++) leaveType.push(null);
  const red = leaveType.map((t) => (t === 'big' ? 2 : t === 'small' ? 1 : 0));

  const W = Math.max(0, weekday);
  const E = Math.max(0, weekend);

  // 1) 假日：發給目前假日最少者（不破 3 假上限）；同分無特休者優先 → 特休落在假日少組。
  const wend = new Array(n).fill(0);
  for (let s = 0; s < E; s++) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (wend[i] >= MAX_WEEKEND) continue; // 不破 3 假上限
      if (best < 0) { best = i; continue; }
      if (
        wend[i] < wend[best] ||
        (wend[i] === wend[best] && (red[i] < red[best] || (red[i] === red[best] && i < best)))
      ) {
        best = i;
      }
    }
    if (best < 0) break; // 理論上不會發生（E ≤ 3n）
    wend[best] += 1;
  }

  // 2) 平日：水位填充「總班數(含假日)+handicap」最低者；特休者因 handicap 總班數較少。
  const wk = new Array(n).fill(0);
  for (let s = 0; s < W; s++) {
    let best = 0;
    for (let i = 1; i < n; i++) {
      const ci = wend[i] + wk[i] + red[i];
      const cb = wend[best] + wk[best] + red[best];
      if (ci < cb || (ci === cb && (red[i] < red[best] || (red[i] === red[best] && i < best)))) {
        best = i;
      }
    }
    wk[best] += 1;
  }

  // 分桶：依（特休別 + 平 + 假）；排序：無特休 → 小特休 → 大特休，同組平日多者在前。
  const order = { null: 0, small: 1, big: 2 };
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const key = leaveType[i] + '|' + wk[i] + '|' + wend[i];
    const cur = map.get(key) || { people: 0, leave: leaveType[i], weekday: wk[i], weekend: wend[i] };
    cur.people += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort(
    (a, b) => order[a.leave] - order[b.leave] || b.weekday - a.weekday || a.weekend - b.weekend
  );
}

// 基礎班數 = 無特休者中「最滿載」的那一桶：取總班數最多者，同總數取平日多者
//（即偏好 6平2假 而非 5平3假 的標準滿載型態）。無無特休者則取整體最滿載。
export function baseShift(buckets) {
  if (!buckets || buckets.length === 0) return { weekday: 0, weekend: 0 };
  const normal = buckets.filter((b) => b.leave == null);
  const pool = normal.length ? normal : buckets;
  const top = pool.reduce((a, b) => {
    const ta = a.weekday + a.weekend;
    const tb = b.weekday + b.weekend;
    if (tb > ta || (tb === ta && b.weekday > a.weekday)) return b;
    return a;
  });
  return { weekday: top.weekday, weekend: top.weekend };
}

// 群組「基礎假日數」= 每人分佈中人數最多的那個假日值（眾數），供職級單調性比較。
function baseWeekend(count, weekend) {
  if (count <= 0) return 0;
  const f = Math.floor(weekend / count);
  const rem = weekend - f * count;
  return rem * 2 > count ? f + 1 : f; // 多數人落在 f+1 時取 f+1
}

// ---------- Task 8: formatResult ----------
function fmtGroup(g) {
  const buckets = distributePerson(g.count, g.weekday, g.weekend, g.bigLeave, g.smallLeave);
  return {
    count: g.count,
    total: { weekday: g.weekday, weekend: g.weekend },
    byShift: g.byShift,
    perPersonBuckets: buckets,
    baseShift: baseShift(buckets),
  };
}

function formatResult(linko, taipei, warnings) {
  const L = {};
  for (const k of ['y2', 'r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3']) {
    L[k] = fmtGroup(linko[k]);
  }
  const Tp = {};
  for (const [k, src] of [['r1to3', 'tr1to3'], ['r4', 'tr4'], ['f1', 'tf1']]) {
    const g = taipei[src];
    const buckets = distributePerson(g.count, g.weekday, g.weekend, g.bigLeave, g.smallLeave);
    Tp[k] = {
      count: g.count,
      T1: g.byShift.T1 || { weekday: 0, weekend: 0 },
      T2: g.byShift.T2 || { weekday: 0, weekend: 0 },
      perPersonBuckets: buckets,
      baseShift: baseShift(buckets),
    };
  }
  return { taipei: Tp, linko: L, warnings };
}

// 平均班數排除特休者：以「無特休者」每人班數（基礎班數）為代表（特休者班數本就較少，不列入平均）。
// 全員特休時無代表者，退回以總額均分。
export function avgExclLeave(g) {
  const normalCount = g.count - (g.bigLeave || 0) - (g.smallLeave || 0);
  if (g.count > 0 && normalCount > 0) {
    const b = baseShift(distributePerson(g.count, g.weekday, g.weekend, g.bigLeave, g.smallLeave));
    return { weekday: b.weekday, weekend: b.weekend, total: b.weekday + b.weekend };
  }
  const c = g.count || 1;
  return { weekday: g.weekday / c, weekend: g.weekend / c, total: (g.weekday + g.weekend) / c };
}

// ---------- Task 9: validateLimits ----------
function validateLimits(linko, warnings) {
  const minF = { f1: 3, f2: 2, f3: 1 };
  let anyFbelow = false;
  for (const [k, min] of Object.entries(minF)) {
    const g = linko[k];
    if (g.count > 0) {
      const each = avgExclLeave(g).total;
      if (each < min - EPS) {
        anyFbelow = true;
        warnings.push(`${k.toUpperCase()} 每人約 ${each.toFixed(1)} 班，低於最低 ${min} 班`);
      }
    }
  }
  for (const k of ['y2', 'r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3']) {
    const g = linko[k];
    if (g.count === 0) continue;
    // 安全網（spec §4.4c/§5.1）：特休釋出的平日吸收後若仍超過 8 班上限，
    // 必須往上一職級調整，絕不靜默遺失班數。容量已修正後此值通常為 0。
    const adj = applyLeaveAdjustment(g);
    if (adj.pushedUp.weekday > 0) {
      warnings.push(
        `${k.toUpperCase()} 特休調整後仍有 ${adj.pushedUp.weekday} 個平日班超出 8 班上限，需人工往上一職級調整`
      );
    }
    const avg = avgExclLeave(g);
    const totEach = avg.total;
    const wendEach = avg.weekend;
    if (totEach > MAX_TOTAL + EPS) {
      warnings.push(`${k.toUpperCase()} 每人約 ${totEach.toFixed(1)} 班，超過 8 班上限`);
    }
    if (wendEach > MAX_WEEKEND + EPS) {
      warnings.push(`${k.toUpperCase()} 每人約 ${wendEach.toFixed(1)} 假日班，超過 3 假上限`);
    }
    if (!anyFbelow && ['r1', 'r2', 'r3', 'r4'].includes(k) && totEach < MAX_TOTAL - EPS) {
      warnings.push(
        `${k.toUpperCase()} 每人約 ${totEach.toFixed(1)} 班，低於 8 班（無 F 級缺額時 R 級不應低於 8）`
      );
    }
  }

  // 職級單調性（假日）：主動調整後若資深仍高於資淺（受硬上限/可換班別限制無法搬平），才警示。
  const unitName = (keys) => keys.map((k) => k.toUpperCase()).join('/');
  for (let i = 1; i < RANK_UNITS.length; i++) {
    const jr = unitAgg(linko, RANK_UNITS[i - 1]);
    const sr = unitAgg(linko, RANK_UNITS[i]);
    if (jr.count === 0 || sr.count === 0) continue;
    if (baseWeekend(sr.count, sr.weekend) > baseWeekend(jr.count, jr.weekend)) {
      warnings.push(
        `假日單調性：${unitName(RANK_UNITS[i])} 每人假日仍高於資淺 ${unitName(RANK_UNITS[i - 1])}（受硬上限限制無法自動搬平），請人工微調`
      );
    }
  }
}

// ---------- 職級單調性主動調整（item ④⑤）----------
// 規則：資淺職級每人假日數 ≥ 資深職級（學長姐不該比學弟妹值更多假）。
// Y2 與 R1 視為同一職級單位。資深若超過資淺，把 1 個假日「在同一個班別內」
// 與資淺對調（資深該班別 假→平、資淺同班別 平→假）：
//  - 該班別全院平/假總需求不變（資深 -1 假被資淺 +1 假抵銷）。
//  - 群組 byShift 與群組總額同步更新，故「各班別」與「每人」永遠加總一致。
// 受每人 ≤3 假硬上限約束；找不到可對調的同班別時則不動，改由警示提醒人工微調。
const RANK_UNITS = [['y2', 'r1'], ['r2'], ['r3'], ['r4'], ['f1'], ['f2'], ['f3']];

function unitAgg(linko, keys) {
  let count = 0, weekday = 0, weekend = 0;
  for (const k of keys) {
    const g = linko[k];
    if (!g) continue;
    count += g.count;
    weekday += g.weekday;
    weekend += g.weekend;
  }
  return { count, weekday, weekend };
}

// 將 1 個假日從資深單位(srKeys)同班別對調到資淺單位(jrKeys)。
// 需存在某班別 s：資深某群組該班別有假日(weekend≥1)、資淺某群組該班別有平日(weekday≥1)。
// 同步更新雙方 byShift 與群組總額，保持加總一致與該班別全院需求守恆。
function swapWeekendSameShift(linko, srKeys, jrKeys) {
  for (const sk of srKeys) {
    const sg = linko[sk];
    if (!sg || sg.count === 0) continue;
    for (const shift of Object.keys(sg.byShift)) {
      if ((sg.byShift[shift].weekend || 0) < 1) continue;
      for (const jk of jrKeys) {
        const jg = linko[jk];
        if (!jg || jg.count === 0) continue;
        if ((jg.byShift[shift]?.weekday || 0) < 1) continue;
        if (jg.weekend + 1 > jg.count * MAX_WEEKEND) continue; // 資淺加假後仍 ≤3/人
        // 資深 該班別 假→平
        sg.byShift[shift].weekend -= 1;
        sg.byShift[shift].weekday += 1;
        sg.weekend -= 1;
        sg.weekday += 1;
        // 資淺 同班別 平→假
        jg.byShift[shift].weekday -= 1;
        jg.byShift[shift].weekend += 1;
        jg.weekday -= 1;
        jg.weekend += 1;
        return true;
      }
    }
  }
  return false;
}

function enforceMonotonicity(linko) {
  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 1; i < RANK_UNITS.length; i++) {
      const jr = unitAgg(linko, RANK_UNITS[i - 1]); // 資淺
      const sr = unitAgg(linko, RANK_UNITS[i]); // 資深
      if (jr.count === 0 || sr.count === 0) continue;
      if (baseWeekend(sr.count, sr.weekend) <= baseWeekend(jr.count, jr.weekend)) continue;
      if (jr.weekend + 1 > jr.count * MAX_WEEKEND) continue;
      if (swapWeekendSameShift(linko, RANK_UNITS[i], RANK_UNITS[i - 1])) changed = true;
    }
    if (!changed) break;
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
    tf1: { count: T.f1, bigLeave: T.f1Big, smallLeave: T.f1Small },
  });

  const warnings = [];
  const leftover = (label, r) => {
    if (r.weekday > 0 || r.weekend > 0) {
      warnings.push(`${label} 缺人：尚有 ${r.weekday}平${r.weekend}假 無法分配`);
    }
  };

  // 班別順位採「各職級內部順位」：依各職級優先吃的班別先後填補。
  //   R2：L1 > T1 > L5（L5 為最低，留到最後清尾）
  //   R3：L1 > L > T1 > L5
  //   R4：L > T1 > T2 > LR > L5
  //   台北F1：T2 > T1
  //   Y2/R1：病房班、L5（主要 L5 來源）
  // 因 R4(T1>T2) 與 台北F1(T2>T1) 分屬林口/台北兩池、各自獨立填補，可同時成立。

  // 1 病房班：Y2(可值最後一天) → R1 → R2 → R3
  leftover('病房班', fillShift(linko, ['y2', 'r1', 'r2', 'r3'], 'ward', demands.ward));
  // 2 L5（主要）：Y2、R1 先吃；R2/R3/R4/F1 的 L5 為最低順位，留到最後清尾。
  let l5rem = fillShift(linko, ['y2', 'r1'], 'L5', demands.L5);
  // 3 L1：R2 → R3（R2 最高順位為 L1）
  leftover('L1', fillShift(linko, ['r2', 'r3'], 'L1', demands.L1));
  // 4 L（總值班）：R3（受班數上限）→ R4 → F1 → F2（R4 最高順位為 L）
  {
    let rem = fillShift(linko, ['r3'], 'L', demands.L, { shiftCap: get('r3').lCapShifts || 0 });
    rem = fillShift(linko, ['r4', 'f1', 'f2'], 'L', rem);
    leftover('L', rem);
  }
  // 5 T2（台北F1 優先）：台北F1 順位 T2 > T1，故先吃 T2，餘量留待步驟 7 由林口承接。
  let t2rem = fillShift(taipei, ['tf1'], 'T2', demands.T2);
  // 6 T1：台北R1-3 → 台北R4 → 林R1 → R2 → R3 → R4 → 台北F1（林口基隆籍跳過）
  {
    let rem = fillShift(taipei, ['tr1to3', 'tr4'], 'T1', demands.T1);
    rem = fillShift(linko, ['r1', 'r2', 'r3', 'r4'], 'T1', rem, { excludeKeelung: true });
    rem = fillShift(taipei, ['tf1'], 'T1', rem);
    leftover('T1', rem);
  }
  // 7 T2（其餘）：林R4 → 林F1 → 林F2 → 林F3（林口基隆籍跳過）
  leftover('T2', fillShift(linko, ['r4', 'f1', 'f2', 'f3'], 'T2', t2rem, { excludeKeelung: true }));
  // 8 LR：林R4 → 林F1 → 林F2 → 林F3（R4 順位 LR 在 L5 之前）
  leftover('LR', fillShift(linko, ['r4', 'f1', 'f2', 'f3'], 'LR', demands.LR));
  // 9 L5（清尾）：R2 → R3 → R4 → F1 的最低順位 L5。
  leftover('L5', fillShift(linko, ['r2', 'r3', 'r4', 'f1'], 'L5', l5rem));

  // 職級單調性主動調整（每天 T1/T2 已先確保有人，故此處不動 T1/T2 覆蓋）。
  enforceMonotonicity(linko);

  // item ③：台北 F1 每人總班數應與林口 F1 一致；但「每天 T1/T2 要有人」優先，
  // 覆蓋需求已先滿足，若兩者每人總班數不同則僅警示、由人工微調，不犧牲覆蓋。
  const tf1 = taipei.tf1;
  const lf1 = linko.f1;
  if (tf1.count > 0 && lf1.count > 0) {
    const tEach = (tf1.weekday + tf1.weekend) / tf1.count;
    const lEach = (lf1.weekday + lf1.weekend) / lf1.count;
    if (Math.abs(tEach - lEach) > 1 + EPS) {
      warnings.push(
        `台北 F1 每人約 ${tEach.toFixed(1)} 班，與林口 F1 每人約 ${lEach.toFixed(1)} 班不一致（為確保每天 T1/T2 有人，請人工微調）`
      );
    }
  }

  validateLimits(linko, warnings);
  return formatResult(linko, taipei, warnings);
}
