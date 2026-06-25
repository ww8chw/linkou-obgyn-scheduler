// 2026 行政院人事行政總處公告。HOLIDAYS_2026: 落在平日(週一~週五)卻放假的日期。
// 2026 已取消補班制度，故 MAKEUPS_2026 為空。
//
// 備註：以下國定假日落在週六/週日，已由星期判斷涵蓋，不需列入 HOLIDAYS_2026：
//   2026-02-14 (情人節非國定), 2026-02-15 (春節前夕 Sun), 2026-04-04 (清明節 Sat),
//   2026-04-05 (清明節 Sun), 2026-09-26 (中秋 Sat), 2026-10-10 (國慶日 Sat),
//   2026-10-25 (台灣光復節 Sun)
export const HOLIDAYS_2026 = [
  '2026-01-01', // 元旦 (四)
  '2026-02-16', // 除夕 (一)
  '2026-02-17', // 春節 (二)
  '2026-02-18', // 春節 (三)
  '2026-02-19', // 春節 (四)
  '2026-02-20', // 春節補假 (五)
  '2026-02-27', // 和平紀念日補假 (五)
  '2026-04-03', // 兒童節補假 (五)
  '2026-04-06', // 清明節補假 (一)
  '2026-05-01', // 勞動節 (五)
  '2026-06-19', // 端午節 (五)
  '2026-09-25', // 中秋節補假 (五)
  '2026-09-28', // 教師節 (一)
  '2026-10-09', // 國慶日補假 (五)
  '2026-10-26', // 台灣光復節補假 (一)
  '2026-12-25', // 行憲紀念日 (五)
];

// 2026 已取消補班制度
export const MAKEUPS_2026 = [];

/**
 * 計算指定年月的工作日與非工作日數量。
 *
 * @param {number} year  西元年
 * @param {number} month 月份 (1–12)
 * @returns {{ weekday: number, weekend: number, lastDayIsWeekend: boolean }}
 *   weekday: 工作日數（週一~週五 且非假日）
 *   weekend: 非工作日數（週六/日 或 假日）
 *   lastDayIsWeekend: 該月最後一天是否為非工作日
 */
export function getMonthDays(year, month) {
  const holidaySet = new Set(HOLIDAYS_2026);
  const makeupSet = new Set(MAKEUPS_2026);
  const daysInMonth = new Date(year, month, 0).getDate();
  let weekday = 0, weekend = 0;
  let lastDayIsWeekend = false;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = date.getDay();
    let isHoliday = (dow === 0 || dow === 6);
    if (makeupSet.has(iso)) isHoliday = false; // 補班日強制為工作日
    if (holidaySet.has(iso)) isHoliday = true;  // 假日覆蓋補班（2026 無此情形）
    if (isHoliday) weekend++; else weekday++;
    if (d === daysInMonth) lastDayIsWeekend = isHoliday;
  }
  return { weekday, weekend, lastDayIsWeekend };
}
