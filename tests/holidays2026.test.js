import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOLIDAYS_2026, MAKEUPS_2026, getMonthDays } from '../src/holidays2026.js';

// ─── HOLIDAYS_2026 資料完整性 ─────────────────────────────────────────────────

describe('HOLIDAYS_2026 資料', () => {
  it('應包含 16 個平日假期', () => {
    assert.equal(HOLIDAYS_2026.length, 16);
  });

  it('MAKEUPS_2026 應為空陣列（2026 已取消補班）', () => {
    assert.deepEqual(MAKEUPS_2026, []);
  });

  it('每個日期格式應為 YYYY-MM-DD', () => {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    for (const d of HOLIDAYS_2026) {
      assert.match(d, re, `格式錯誤: ${d}`);
    }
  });

  it('所有日期應在 2026 年', () => {
    for (const d of HOLIDAYS_2026) {
      assert.equal(d.slice(0, 4), '2026', `非 2026 年: ${d}`);
    }
  });

  it('應包含元旦 2026-01-01', () => {
    assert.ok(HOLIDAYS_2026.includes('2026-01-01'));
  });

  it('應包含春節期間 6 個假日（02-16 ~ 02-20 + 02-27）', () => {
    const springDates = ['2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-27'];
    for (const d of springDates) {
      assert.ok(HOLIDAYS_2026.includes(d), `缺少春節假日: ${d}`);
    }
  });

  it('所有假日應確實落在平日（週一~週五）', () => {
    for (const iso of HOLIDAYS_2026) {
      const [y, m, d] = iso.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      assert.ok(
        dow >= 1 && dow <= 5,
        `${iso} 落在週末（dow=${dow}），不應列入 HOLIDAYS_2026`
      );
    }
  });

  it('不應有重複日期', () => {
    const set = new Set(HOLIDAYS_2026);
    assert.equal(set.size, HOLIDAYS_2026.length);
  });
});

// ─── getMonthDays：各月總天數驗證 ─────────────────────────────────────────────
// 獨立計算依據：2026-01-01 = 週四

describe('getMonthDays: weekday + weekend === 該月天數', () => {
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 1; m <= 12; m++) {
    it(`2026-${String(m).padStart(2,'0')} 總天數應為 ${monthDays[m-1]}`, () => {
      const { weekday, weekend } = getMonthDays(2026, m);
      assert.equal(weekday + weekend, monthDays[m - 1]);
    });
  }
});

// ─── getMonthDays：各月精確值（獨立推算）────────────────────────────────────
//
// 推算方式：先算純週末天數，再加上落在平日的假日數（HOLIDAYS_2026）。
//
// 2026-01（Jan 1=Thu）:
//   純週末：Sat/Sun → 1/3,4; 1/10,11; 1/17,18; 1/24,25; 1/31 = 9 天
//   平日假日：01-01 (Thu) = 1 天
//   weekend=10, weekday=31-10=21, lastDay=Jan31(Sat)→true
//
// 2026-02（Feb 1=Sun）:
//   純週末：2/1,7,8,14,15,21,22,28 = 8 天
//   平日假日：02-16(Mon),02-17(Tue),02-18(Wed),02-19(Thu),02-20(Fri),02-27(Fri) = 6 天
//   weekend=14, weekday=28-14=14, lastDay=Feb28(Sat)→true
//
// 2026-03（Mar 1=Sun）:
//   純週末：3/1,7,8,14,15,21,22,28,29 = 9 天
//   平日假日：0 天
//   weekend=9, weekday=31-9=22, lastDay=Mar31(Tue)→false
//
// 2026-04（Apr 1=Wed）:
//   純週末：4/4,5,11,12,18,19,25,26 = 8 天
//   平日假日：04-03(Fri),04-06(Mon) = 2 天
//   weekend=10, weekday=30-10=20, lastDay=Apr30(Thu)→false
//
// 2026-05（May 1=Fri）:
//   純週末：5/2,3,9,10,16,17,23,24,30,31 = 10 天
//   平日假日：05-01(Fri) = 1 天
//   weekend=11, weekday=31-11=20, lastDay=May31(Sun)→true
//
// 2026-06（Jun 1=Mon）:
//   純週末：6/6,7,13,14,20,21,27,28 = 8 天
//   平日假日：06-19(Fri) = 1 天
//   weekend=9, weekday=30-9=21, lastDay=Jun30(Tue)→false
//
// 2026-07（Jul 1=Wed）:
//   純週末：7/4,5,11,12,18,19,25,26 = 8 天
//   平日假日：0 天
//   weekend=8, weekday=31-8=23, lastDay=Jul31(Fri)→false
//
// 2026-08（Aug 1=Sat）:
//   純週末：8/1,2,8,9,15,16,22,23,29,30 = 10 天
//   平日假日：0 天
//   weekend=10, weekday=31-10=21, lastDay=Aug31(Mon)→false
//
// 2026-09（Sep 1=Tue）:
//   純週末：9/5,6,12,13,19,20,26,27 = 8 天
//   平日假日：09-25(Fri),09-28(Mon) = 2 天
//   weekend=10, weekday=30-10=20, lastDay=Sep30(Wed)→false
//
// 2026-10（Oct 1=Thu）:
//   純週末：10/3,4,10,11,17,18,24,25,31 = 9 天
//   平日假日：10-09(Fri),10-26(Mon) = 2 天
//   weekend=11, weekday=31-11=20, lastDay=Oct31(Sat)→true
//
// 2026-11（Nov 1=Sun）:
//   純週末：11/1,7,8,14,15,21,22,28,29 = 9 天
//   平日假日：0 天
//   weekend=9, weekday=30-9=21, lastDay=Nov30(Mon)→false
//
// 2026-12（Dec 1=Tue）:
//   純週末：12/5,6,12,13,19,20,26,27 = 8 天
//   平日假日：12-25(Fri) = 1 天
//   weekend=9, weekday=31-9=22, lastDay=Dec31(Thu)→false

describe('getMonthDays: 各月精確值', () => {
  // January
  it('2026-01：元旦（平日）+9個週末=10非工作日，21工作日，最後一天Sat', () => {
    const r = getMonthDays(2026, 1);
    assert.equal(r.weekday, 21);
    assert.equal(r.weekend, 10);
    assert.equal(r.lastDayIsWeekend, true);
  });

  // February — 春節重頭戲
  it('2026-02：6個春節平日假+8個週末=14非工作日，14工作日，最後一天Sat', () => {
    const r = getMonthDays(2026, 2);
    assert.equal(r.weekday, 14);
    assert.equal(r.weekend, 14);
    assert.equal(r.lastDayIsWeekend, true);
  });

  // March — no holidays
  it('2026-03：無平日假，9個週末，22工作日，最後一天Tue', () => {
    const r = getMonthDays(2026, 3);
    assert.equal(r.weekday, 22);
    assert.equal(r.weekend, 9);
    assert.equal(r.lastDayIsWeekend, false);
  });

  // April — 2 holidays
  it('2026-04：2個平日假（04-03,04-06）+8週末=10非工作日，20工作日，最後一天Thu', () => {
    const r = getMonthDays(2026, 4);
    assert.equal(r.weekday, 20);
    assert.equal(r.weekend, 10);
    assert.equal(r.lastDayIsWeekend, false);
  });

  // May — 1 holiday (05-01 勞動節)
  it('2026-05：勞動節（平日）+10週末=11非工作日，20工作日，最後一天Sun', () => {
    const r = getMonthDays(2026, 5);
    assert.equal(r.weekday, 20);
    assert.equal(r.weekend, 11);
    assert.equal(r.lastDayIsWeekend, true);
  });

  // June — 1 holiday (06-19 端午)
  it('2026-06：端午節（平日）+8週末=9非工作日，21工作日，最後一天Tue', () => {
    const r = getMonthDays(2026, 6);
    assert.equal(r.weekday, 21);
    assert.equal(r.weekend, 9);
    assert.equal(r.lastDayIsWeekend, false);
  });

  // July — no holidays
  it('2026-07：無平日假，8週末，23工作日，最後一天Fri', () => {
    const r = getMonthDays(2026, 7);
    assert.equal(r.weekday, 23);
    assert.equal(r.weekend, 8);
    assert.equal(r.lastDayIsWeekend, false);
  });

  // August — no holidays (Aug 1 = Sat, so 10 weekend days)
  it('2026-08：無平日假，10週末（8/1=Sat起頭），21工作日，最後一天Mon', () => {
    const r = getMonthDays(2026, 8);
    assert.equal(r.weekday, 21);
    assert.equal(r.weekend, 10);
    assert.equal(r.lastDayIsWeekend, false);
  });

  // September — 2 holidays (中秋補假+教師節)
  it('2026-09：2個平日假（09-25,09-28）+8週末=10非工作日，20工作日，最後一天Wed', () => {
    const r = getMonthDays(2026, 9);
    assert.equal(r.weekday, 20);
    assert.equal(r.weekend, 10);
    assert.equal(r.lastDayIsWeekend, false);
  });

  // October — 2 holidays
  it('2026-10：2個平日假（10-09,10-26）+9週末=11非工作日，20工作日，最後一天Sat', () => {
    const r = getMonthDays(2026, 10);
    assert.equal(r.weekday, 20);
    assert.equal(r.weekend, 11);
    assert.equal(r.lastDayIsWeekend, true);
  });

  // November — no holidays
  it('2026-11：無平日假，9週末（11/1=Sun起頭），21工作日，最後一天Mon', () => {
    const r = getMonthDays(2026, 11);
    assert.equal(r.weekday, 21);
    assert.equal(r.weekend, 9);
    assert.equal(r.lastDayIsWeekend, false);
  });

  // December — 1 holiday (12-25 行憲紀念日)
  it('2026-12：行憲紀念日（平日）+8週末=9非工作日，22工作日，最後一天Thu', () => {
    const r = getMonthDays(2026, 12);
    assert.equal(r.weekday, 22);
    assert.equal(r.weekend, 9);
    assert.equal(r.lastDayIsWeekend, false);
  });
});

// ─── lastDayIsWeekend 全年驗證 ────────────────────────────────────────────────
// Jan31=Sat(T), Feb28=Sat(T), Mar31=Tue(F), Apr30=Thu(F),
// May31=Sun(T), Jun30=Tue(F), Jul31=Fri(F), Aug31=Mon(F),
// Sep30=Wed(F), Oct31=Sat(T), Nov30=Mon(F), Dec31=Thu(F)

describe('getMonthDays: lastDayIsWeekend 全年', () => {
  const expected = [true, true, false, false, true, false, false, false, false, true, false, false];
  for (let m = 1; m <= 12; m++) {
    it(`2026-${String(m).padStart(2,'0')} 最後一天 lastDayIsWeekend 應為 ${expected[m-1]}`, () => {
      const { lastDayIsWeekend } = getMonthDays(2026, m);
      assert.equal(lastDayIsWeekend, expected[m - 1]);
    });
  }
});

// ─── 邊界情形 ─────────────────────────────────────────────────────────────────

describe('getMonthDays: 邊界與語意驗證', () => {
  it('weekday 和 weekend 均為非負整數', () => {
    for (let m = 1; m <= 12; m++) {
      const { weekday, weekend } = getMonthDays(2026, m);
      assert.ok(weekday >= 0 && Number.isInteger(weekday));
      assert.ok(weekend >= 0 && Number.isInteger(weekend));
    }
  });

  it('2026-02-27（週五）是假日，應計入 weekend', () => {
    // Feb 2026 has that date; comparing with/without it
    // We know Feb weekend=14 (verified above), which includes 02-27
    const { weekend } = getMonthDays(2026, 2);
    assert.ok(weekend >= 9, '02-27 必須被計為 weekend');
  });

  it('2026-09-25（週五，中秋補假）應計為非工作日', () => {
    // Sep has weekend=10, which is 2 more than the pure 8 Sat/Sun
    const { weekend } = getMonthDays(2026, 9);
    assert.ok(weekend > 8, '09-25 應增加 weekend 計數超過純週末數 8');
  });

  it('2026-07 全月無假日：純週末計算應與 Sat/Sun 計數一致', () => {
    // Jul 1=Wed: Sat/Sun pairs: Jul4,5; Jul11,12; Jul18,19; Jul25,26 = 8
    const { weekday, weekend } = getMonthDays(2026, 7);
    assert.equal(weekend, 8);
    assert.equal(weekday, 23);
  });

  it('getMonthDays 回傳物件應含 weekday, weekend, lastDayIsWeekend 三個欄位', () => {
    const result = getMonthDays(2026, 1);
    assert.ok('weekday' in result);
    assert.ok('weekend' in result);
    assert.ok('lastDayIsWeekend' in result);
  });
});
