/**
 * 月度区间工具 —— 单一事实来源。
 *
 * ⚠️ 为什么不能用 `new Date(y, m - 1, 1)`（FIX-14）：
 *
 * 本项目绝大多数金额表的 `created_at` 是 `timestamp without time zone`
 * （PostgreSQL 只存墙钟时间，不带时区）。而 Drizzle 在把 JS `Date` 作为查询
 * 参数时，会序列化成 **UTC 字面量**再送给数据库比较。于是：
 *
 *   new Date(2026, 7, 1)            // 本地 Asia/Shanghai 月初零点
 *   → 序列化为 "2026-07-31T16:00:00.000Z"   // 前一天 16:00
 *
 * 查询窗口整体前移 8 小时（Asia/Shanghai），产生两个方向的错账：
 *   - 每月 00:00–08:00 的消费被划到**上个月**（本月少算）
 *   - 每月 16:00 之后直到月末的消费被划到**下个月**（本月又多算）
 *
 * 实测 2026-08 因此少算 ¥1301.63，占该月总额 15%。财务对账差这些钱就是错账，
 * 而且不会报错——查询正常返回，只是数字是错的，极难发现。
 *
 * 修法：用 `Date.UTC` 直接构造墙钟时间的 UTC 字面量，不做本地时区换算，
 * 与 `timestamp without time zone` 列的存储语义严格对齐。
 *
 * 若目标列确实是 `timestamptz`（带时区），则应反过来用本地时区构造——
 * 届时请先确认列类型，不要照搬本文件的用法。
 */

/** 某月的半开区间 [月初零点, 次月初零点)，UTC 字面量语义 */
export interface MonthRange {
  start: Date;
  end: Date;
}

/** 把 Date 的 UTC 字段读出来当作墙钟时间（用于 `timestamp without time zone` 列） */
function wallClockUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()));
}

/** 由 "YYYY-MM" 解析该月区间；非法输入回退到 1970-01，避免抛错打断报表 */
export function monthRangeOf(period: string): MonthRange {
  const [yRaw = NaN, mRaw = NaN] = period.split('-').map(Number);
  // ⚠️ 不能靠解构默认值 `= 1970`兜底：默认值只在 undefined 时生效。
  // 另外 Number('') === 0（不是 NaN），所以空串会得到「公元 0 年」——
  // 必须显式要求正整数。
  const y: number = Number.isInteger(yRaw) && (yRaw as number) >= 1 ? (yRaw as number) : 1970;
  const m: number =
    Number.isInteger(mRaw) && (mRaw as number) >= 1 && (mRaw as number) <= 12 ? (mRaw as number) : 1;
  // 次月年初；m=12 时自动滚到次年 1 月
  const endYear = m === 12 ? y + 1 : y;
  const endMonth = m === 12 ? 1 : m + 1;
  return {
    start: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(endYear, endMonth - 1, 1, 0, 0, 0, 0)),
  };
}

/** 含参考日的当月区间（reference 缺省为现在），参考日的“日期部分”按墙钟处理 */
export function monthRangeOfDate(reference?: Date): MonthRange {
  const now = reference ?? new Date();
  return {
    start: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)),
  };
}

/**
 * 单日零点（同样按墙钟语义），用于「本月至今」之外的日粒度窗口。
 * 返回 UTC 字面量，可直接与 `timestamp without time zone` 列比较。
 */
export function startOfDayWallClock(d: Date = new Date()): Date {
  return wallClockUtc(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** 某个墙钟日期所在月的第一天（UTC 字面量） */
export function startOfMonthWallClock(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0));
}