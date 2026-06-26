// 端到端煙霧測試：以真實完整輸入跑 calculateSchedule，
// 驗證輸出結構（taipei / linko 各職級 perPersonBuckets/基礎班數、warnings 陣列）且不拋錯。
import { test } from 'node:test';
import assert from 'node:assert';
import { calculateSchedule } from '../src/scheduler.js';
import { getMonthDays } from '../src/holidays2026.js';

test('smoke：真實完整輸入跑得通且輸出結構正確', () => {
  const month = getMonthDays(2026, 7);
  assert.equal(typeof month.weekday, 'number');
  assert.equal(typeof month.weekend, 'number');

  const input = {
    month,
    taipei: { r1to3: 3, r4: 1, f1: 1 },
    linko: {
      y2: { count: 2, canLastDay: 2 },
      r1: { count: 2, bigLeave: 1, smallLeave: 0 },
      r2: { count: 3, bigLeave: 0, smallLeave: 1, keelung: 1 },
      r3: { count: 3, bigLeave: 0, smallLeave: 0, keelung: 0, lCapablePeople: 2, lCapShifts: 30 },
      r4: { count: 3, bigLeave: 0, smallLeave: 0, keelung: 0 },
      f1: { count: 3, bigLeave: 0, smallLeave: 0 },
      f2: { count: 2, bigLeave: 0, smallLeave: 0 },
      f3: { count: 2, bigLeave: 0, smallLeave: 0 },
    },
    remaining: { ward: { weekday: 0, weekend: 2 }, l5: { weekday: 10, weekend: 4 } },
  };

  let result;
  assert.doesNotThrow(() => {
    result = calculateSchedule(input);
  });

  // 頂層結構。
  assert.ok(result.taipei, 'result.taipei 應存在');
  assert.ok(result.linko, 'result.linko 應存在');
  assert.ok(Array.isArray(result.warnings), 'warnings 應為陣列');

  // 台北三組皆有 T1/T2 數值。
  for (const k of ['r1to3', 'r4', 'f1']) {
    const g = result.taipei[k];
    assert.ok(g, `taipei.${k} 應存在`);
    assert.equal(typeof g.T1.weekday, 'number');
    assert.equal(typeof g.T2.weekday, 'number');
  }

  // 林口每職級皆有每人分佈與基礎班數。
  for (const k of ['y2', 'r1', 'r2', 'r3', 'r4', 'f1', 'f2', 'f3']) {
    const g = result.linko[k];
    assert.ok(g, `linko.${k} 應存在`);
    assert.ok(Array.isArray(g.perPersonBuckets), `linko.${k}.perPersonBuckets 應為陣列`);
    assert.ok(g.baseShift, `linko.${k}.baseShift 應存在`);
    assert.equal(typeof g.baseShift.weekday, 'number', `linko.${k}.baseShift.weekday 應為數值`);
    assert.equal(typeof g.baseShift.weekend, 'number', `linko.${k}.baseShift.weekend 應為數值`);
  }

  // 有特休的職級每人分佈中應出現對應特休桶。
  assert.ok(result.linko.r1.perPersonBuckets.some((b) => b.leave === 'big'), 'R1 有大特休桶');
  assert.ok(result.linko.r2.perPersonBuckets.some((b) => b.leave === 'small'), 'R2 有小特休桶');
});
