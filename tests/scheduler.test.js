import { test } from 'node:test';
import assert from 'node:assert';
import {
  normalizeInput,
  buildDemands,
  createPersonPool,
  fillShift,
  calculateSchedule,
  applyLeaveAdjustment,
} from '../src/scheduler.js';

// ---------- Task 2: normalizeInput ----------
test('normalizeInput 填入預設並保留結構', () => {
  const input = {
    month: { weekday: 22, weekend: 8, lastDayIsWeekend: false },
    taipei: { r1to3: 2, r4: 1, f1: 1 },
    linko: {
      y2: { count: 2, canLastDay: 1 },
      r1: { count: 2, bigLeave: 0, smallLeave: 0 },
      r2: { count: 2, bigLeave: 0, smallLeave: 0, keelung: 0 },
      r3: { count: 2, bigLeave: 0, smallLeave: 0, keelung: 0, lCapablePeople: 1, lCapShifts: 4 },
      r4: { count: 2, bigLeave: 0, smallLeave: 0, keelung: 0 },
      f1: { count: 1, bigLeave: 0, smallLeave: 0 },
      f2: { count: 1, bigLeave: 0, smallLeave: 0 },
      f3: { count: 1, bigLeave: 0, smallLeave: 0 },
    },
    remaining: { ward: { weekday: 0, weekend: 2 }, l5: { weekday: 10, weekend: 4 } },
  };
  const n = normalizeInput(input);
  assert.equal(n.month.weekday, 22);
  assert.equal(n.month.lastDayIsWeekend, false);
  assert.equal(n.linko.r3.lCapShifts, 4);
  assert.equal(n.linko.r1.count, 2);
});

test('normalizeInput 缺漏的數值欄位預設為 0', () => {
  const input = {
    month: { weekday: 20 }, // weekend missing
    taipei: {}, // all missing
    linko: { r1: {} }, // count missing
    remaining: { ward: {}, l5: {} },
  };
  const n = normalizeInput(input);
  assert.equal(n.month.weekend, 0);
  assert.equal(n.month.lastDayIsWeekend, false);
  assert.equal(n.taipei.r1to3, 0);
  assert.equal(n.taipei.r4, 0);
  assert.equal(n.taipei.f1, 0);
  assert.equal(n.linko.r1.count, 0);
  assert.equal(n.remaining.ward.weekday, 0);
  assert.equal(n.remaining.l5.weekend, 0);
});

// ---------- Task 3: buildDemands ----------
test('buildDemands：每日班別需求=當月天數，病房/L5取剩餘值', () => {
  const n = {
    month: { weekday: 22, weekend: 8 },
    remaining: { ward: { weekday: 0, weekend: 2 }, l5: { weekday: 10, weekend: 4 } },
  };
  const d = buildDemands(n);
  assert.deepEqual(d.L1, { weekday: 22, weekend: 8 });
  assert.deepEqual(d.L, { weekday: 22, weekend: 8 });
  assert.deepEqual(d.T1, { weekday: 22, weekend: 8 });
  assert.deepEqual(d.T2, { weekday: 22, weekend: 8 });
  assert.deepEqual(d.LR, { weekday: 22, weekend: 8 });
  assert.deepEqual(d.L5, { weekday: 10, weekend: 4 });
  assert.deepEqual(d.ward, { weekday: 0, weekend: 2 });
});

// ---------- Task 4: createPersonPool + fillShift ----------
test('fillShift：順位前者先填，受每人上限約束', () => {
  // 兩個職級各2人，需求平日10假日4
  const pool = createPersonPool({
    A: { count: 2, bigLeave: 0, smallLeave: 0 },
    B: { count: 2, bigLeave: 0, smallLeave: 0 },
  });
  const left = fillShift(pool, ['A', 'B'], 'L1', { weekday: 10, weekend: 4 });
  // A 2人: 假日優先吃 min(4, wendCap=6, totalCap=16)=4; 平日 min(10, wkCap=12, totalCap-4=12)=10
  // → A 吃平10假4 (每人5平2假, ≤8 ≤3 OK), B 吃0
  assert.equal(left.weekday, 0);
  assert.equal(left.weekend, 0);
  assert.equal(pool.A.weekday, 10);
  assert.equal(pool.A.weekend, 4);
  assert.equal(pool.B.weekday, 0);
  assert.equal(pool.B.weekend, 0);
});

test('fillShift：硬上限 - 每人不超過8班3假，溢出回傳leftover', () => {
  // 1人，需求平日10假日5 → 1人最多平6假3總8 → 假日優先吃3, 平日吃 min(10, wkCap=6, totalCap-3=5)=5
  const pool = createPersonPool({ A: { count: 1 } });
  const left = fillShift(pool, ['A'], 'L1', { weekday: 10, weekend: 5 });
  assert.equal(pool.A.weekend, 3); // 假日硬上限3
  assert.equal(pool.A.weekday, 5); // 總上限8 → 8-3=5平
  assert.equal(pool.A.weekday + pool.A.weekend, 8);
  assert.equal(left.weekday, 5); // 10-5
  assert.equal(left.weekend, 2); // 5-3
});

test('fillShift：shiftCap 限制單一班別群組總量(R3 L班)', () => {
  const pool = createPersonPool({ R3: { count: 2 } });
  const left = fillShift(pool, ['R3'], 'L', { weekday: 10, weekend: 4 }, { shiftCap: 5 });
  // shiftCap=5 該班別群組最多5班；假日優先 → 假4 + 平1 = 5
  assert.equal(pool.R3.weekend, 4);
  assert.equal(pool.R3.weekday, 1);
  assert.equal(left.weekday, 9);
  assert.equal(left.weekend, 0);
});

test('fillShift：weekday 軟上限為6 (允許6平2假)', () => {
  // 1人需求平日8假日0 → 平日軟上限6, 總上限8 → 吃6平
  const pool = createPersonPool({ A: { count: 1 } });
  const left = fillShift(pool, ['A'], 'L1', { weekday: 8, weekend: 0 });
  assert.equal(pool.A.weekday, 6);
  assert.equal(left.weekday, 2);
});

// ---------- Task 6: excludeKeelung ----------
test('excludeKeelung：基隆籍不計入 T1/T2 有效人數', () => {
  const result = calculateSchedule({
    month: { weekday: 20, weekend: 8, lastDayIsWeekend: false },
    taipei: { r1to3: 0, r4: 0, f1: 0 },
    linko: {
      y2: { count: 2, canLastDay: 2 }, r1: { count: 2 },
      r2: { count: 2, keelung: 2 }, // R2 全基隆籍，不能值T1
      r3: { count: 4, lCapablePeople: 4, lCapShifts: 60 },
      r4: { count: 4 }, f1: { count: 4 }, f2: { count: 2 }, f3: { count: 2 },
    },
    remaining: { ward: { weekday: 0, weekend: 0 }, l5: { weekday: 20, weekend: 8 } },
  });
  assert.equal((result.linko.r2.byShift.T1?.weekday || 0), 0);
  assert.equal((result.linko.r2.byShift.T1?.weekend || 0), 0);
});

// ---------- Task 5: calculateSchedule end-to-end ----------
test('calculateSchedule：基本案例各班別填補、結構正確', () => {
  const result = calculateSchedule({
    month: { weekday: 22, weekend: 8, lastDayIsWeekend: false },
    taipei: { r1to3: 3, r4: 1, f1: 1 },
    linko: {
      y2: { count: 2, canLastDay: 2 },
      r1: { count: 2 }, r2: { count: 2 }, r3: { count: 2, lCapablePeople: 2, lCapShifts: 30 },
      r4: { count: 2 }, f1: { count: 2 }, f2: { count: 2 }, f3: { count: 2 },
    },
    remaining: { ward: { weekday: 0, weekend: 2 }, l5: { weekday: 22, weekend: 8 } },
  });
  assert.ok(result.taipei.r1to3.T1.weekday > 0);
  assert.ok(Array.isArray(result.warnings));
  // 病房班 only weekend 2 → goes to y2
  assert.equal(result.linko.y2.byShift.ward.weekend, 2);
});

test('calculateSchedule：硬上限永不被破壞', () => {
  const result = calculateSchedule({
    month: { weekday: 22, weekend: 8, lastDayIsWeekend: false },
    taipei: { r1to3: 3, r4: 1, f1: 1 },
    linko: {
      y2: { count: 2, canLastDay: 2 },
      r1: { count: 2 }, r2: { count: 2 }, r3: { count: 2, lCapablePeople: 2, lCapShifts: 30 },
      r4: { count: 2 }, f1: { count: 2 }, f2: { count: 2 }, f3: { count: 2 },
    },
    remaining: { ward: { weekday: 0, weekend: 2 }, l5: { weekday: 22, weekend: 8 } },
  });
  for (const k of ['y2', 'r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3']) {
    const g = result.linko[k];
    if (g.count === 0) continue;
    const totEach = (g.total.weekday + g.total.weekend) / g.count;
    const wendEach = g.total.weekend / g.count;
    assert.ok(totEach <= 8 + 1e-9, `${k} total ${totEach} > 8`);
    assert.ok(wendEach <= 3 + 1e-9, `${k} weekend ${wendEach} > 3`);
  }
});

// ---------- Task 7: applyLeaveAdjustment ----------
test('applyLeaveAdjustment：大特休-2平、小特休-1平，假日不減，缺額同級吸收', () => {
  // 某職級3人共值15平6假，1人大特休
  const g = { count: 3, weekday: 15, weekend: 6, bigLeave: 1, smallLeave: 0 };
  const out = applyLeaveAdjustment(g);
  // baseWk = floor(15/3)=5; wendEach = round(6/3)=2
  assert.equal(out.normal.weekday, 5);
  assert.equal(out.normal.weekend, 2);
  assert.equal(out.big.weekday, 3); // 5-2
  assert.equal(out.big.weekend, 2); // 假日不減
  // 大特休少值2平 → 2位無特休者吸收, 各+1 → 6平 (≤8 OK)
  assert.equal(out.normalAdjusted.weekday, 6);
  assert.equal(out.normalAdjusted.weekend, 2);
  assert.equal(out.pushedUp.weekday, 0);
});

test('applyLeaveAdjustment：假日只均分不因特休改變', () => {
  const g = { count: 2, weekday: 10, weekend: 4, bigLeave: 0, smallLeave: 1 };
  const out = applyLeaveAdjustment(g);
  // baseWk=5, wendEach=2
  assert.equal(out.normal.weekday, 5);
  assert.equal(out.small.weekday, 4); // 5-1
  assert.equal(out.small.weekend, 2); // 假日不減
  // small 少值1平 → 1位normal吸收 +1 → 6平
  assert.equal(out.normalAdjusted.weekday, 6);
});

test('applyLeaveAdjustment：吸收後超過8則往上推', () => {
  // 2人共16平0假, 1人大特休 → baseWk=8; normalCount=1
  // big=6平; freed=2; 1位normal吸收 → 8+2=10 > 8 → 上限 8-0=8, pushedUp=(10-8)*1=2
  const g = { count: 2, weekday: 16, weekend: 0, bigLeave: 1, smallLeave: 0 };
  const out = applyLeaveAdjustment(g);
  assert.equal(out.normal.weekday, 8);
  assert.equal(out.big.weekday, 6);
  assert.equal(out.normalAdjusted.weekday, 8); // capped at 8 (wendEach=0)
  assert.equal(out.pushedUp.weekday, 2);
});

// ---------- spec §4.4c/§5.1: 特休釋出平日納入職級容量，不靜默遺失 ----------
test('groupCapacity(特休)：fillShift 不分配超過 count*6-freed 的平日，溢出推往下一職級', () => {
  // A: count 2, bigLeave 1 → freed=2 → 平日真實容量 = 2*6-2 = 10、總容量 = 2*8-2 = 14
  // 需求 16 平 0 假，遠超 A 的 10 → A 只吃 10，剩 6 溢出至下一職級 B
  const pool = createPersonPool({
    A: { count: 2, bigLeave: 1, smallLeave: 0 },
    B: { count: 2, bigLeave: 0, smallLeave: 0 },
  });
  const left = fillShift(pool, ['A', 'B'], 'L1', { weekday: 16, weekend: 0 });
  assert.equal(pool.A.weekday, 10, 'A 不可超過 count*6-freed=10');
  // 溢出確實被推到下一職級 B（往上一職級推）
  assert.equal(pool.B.byShift.L1.weekday, 6, '溢出 6 平日推往下一職級 B');
  assert.equal(left.weekday, 0, '無班數靜默遺失');
  assert.equal(left.weekend, 0);

  // 不變量：A 的每人拆解（normal*normalCount + big*bigLeave + small*smallLeave）= 群組配額
  const adj = applyLeaveAdjustment(pool.A);
  const sum =
    adj.normalAdjusted.weekday * adj.normalCount +
    adj.big.weekday * adj.bigLeave +
    adj.small.weekday * adj.smallLeave;
  assert.equal(sum, pool.A.weekday, '每人平日拆解必須加總回群組配額');
  assert.equal(adj.pushedUp.weekday, 0, '容量修正後不應再有殘留溢出');
});

test('原失敗案例 {count:2,weekday:16,bigLeave:1}：容量受限後不再靜默遺失', () => {
  // 直接以群組驗證：先前 16 被全配後拆解只剩 14，2 平日靜默消失。
  // 修正後容量上限為 14（總）/10（平），fillShift 只會配到 10 平。
  const pool = createPersonPool({ G: { count: 2, bigLeave: 1, smallLeave: 0 } });
  const left = fillShift(pool, ['G'], 'L1', { weekday: 16, weekend: 0 });
  const adj = applyLeaveAdjustment(pool.G);
  const sum =
    adj.normalAdjusted.weekday * adj.normalCount +
    adj.big.weekday * adj.bigLeave +
    adj.small.weekday * adj.smallLeave;
  // 配給此群組的平日必須完全等於每人拆解之和（無遺失）
  assert.equal(sum, pool.G.weekday, '群組配額與每人拆解一致，無靜默遺失');
  // 無法吃下的部分以 leftover 回傳（非靜默吞掉）
  assert.equal(pool.G.weekday + left.weekday, 16, 'leftover + 已配 = 原需求');
  assert.ok(left.weekday > 0, '吃不下的平日以 leftover 顯性回報');
});

// ---------- Task 8: formatResult ----------
test('formatResult：輸出含台北/林口每人與特休平假', () => {
  const result = calculateSchedule({
    month: { weekday: 22, weekend: 8, lastDayIsWeekend: false },
    taipei: { r1to3: 3, r4: 1, f1: 1 },
    linko: {
      y2: { count: 2, canLastDay: 2 }, r1: { count: 2, bigLeave: 1 },
      r2: { count: 2 }, r3: { count: 2, lCapablePeople: 2, lCapShifts: 30 },
      r4: { count: 2 }, f1: { count: 2 }, f2: { count: 2 }, f3: { count: 2 },
    },
    remaining: { ward: { weekday: 0, weekend: 2 }, l5: { weekday: 22, weekend: 8 } },
  });
  assert.ok(result.linko.r1.perPerson);
  assert.ok(result.linko.r1.bigLeavePerPerson); // r1 有大特休
  assert.equal(result.linko.r2.smallLeavePerPerson, undefined); // r2 無小特休
  assert.ok(result.taipei.r4.T2);
  assert.ok(result.taipei.r4.T1);
});

// ---------- Task 9: validateLimits warnings ----------
test('validateLimits：人力嚴重不足會產生警示', () => {
  const result = calculateSchedule({
    month: { weekday: 28, weekend: 12, lastDayIsWeekend: false },
    taipei: { r1to3: 0, r4: 0, f1: 0 },
    linko: {
      y2: { count: 1, canLastDay: 1 }, r1: { count: 1 }, r2: { count: 1 },
      r3: { count: 1, lCapablePeople: 1, lCapShifts: 40 }, r4: { count: 1 },
      f1: { count: 1 }, f2: { count: 1 }, f3: { count: 1 },
    },
    remaining: { ward: { weekday: 0, weekend: 0 }, l5: { weekday: 28, weekend: 12 } },
  });
  assert.ok(result.warnings.length > 0); // 人力嚴重不足必有警示
});

test('validateLimits：F級未達最低值班數會警示', () => {
  // 充足人力使每職級每人班數很低 → F1<3, F2<2, F3<1
  const result = calculateSchedule({
    month: { weekday: 4, weekend: 2, lastDayIsWeekend: false },
    taipei: { r1to3: 0, r4: 0, f1: 0 },
    linko: {
      y2: { count: 4, canLastDay: 4 }, r1: { count: 4 }, r2: { count: 4 },
      r3: { count: 4, lCapablePeople: 4, lCapShifts: 40 }, r4: { count: 4 },
      f1: { count: 4 }, f2: { count: 4 }, f3: { count: 4 },
    },
    remaining: { ward: { weekday: 0, weekend: 0 }, l5: { weekday: 4, weekend: 2 } },
  });
  // F3 will get LR/T2 leftover only; with abundant people F3 likely 0 → below min 1
  const hasFwarn = result.warnings.some((w) => /F[123]/.test(w) && /低於/.test(w));
  assert.ok(hasFwarn, 'expected an F-rank below-minimum warning');
});
