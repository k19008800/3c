/**
 * 月度区间时区回归测试（FIX-14）
 *
 * 这些断言不是形式主义：本项目金额表的 created_at 是 `timestamp without time zone`，
 * 而 Drizzle 把 JS Date 序列化成 UTC 字面量。用本地时区构造月初会让查询窗口
 * 前移 8 小时（Asia/Shanghai），实测 2026-08 少算 ¥1301.63（占该月 15%）。
 *
 * 本文件锁死「月初零点必须是 00:00:00Z，不能是前一日 16:00Z」。
 */

import { describe, it, expect } from 'vitest';
import {
  monthRangeOf,
  monthRangeOfDate,
  startOfDayWallClock,
  startOfMonthWallClock,
} from './month-range.js';

describe('monthRangeOf — 时区语义（FIX-14）', () => {
  it('月初边界必须是 00:00:00Z，不能被本地时区换算前移', () => {
    const { start } = monthRangeOf('2026-08');
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('8 月的结束边界是 9 月月初零点（半开区间）', () => {
    const { end } = monthRangeOf('2026-08');
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('12 月正确跨年到次年 1 月（不滚成 13 月）', () => {
    const { start, end } = monthRangeOf('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('任意月份窗口长度都是整月，不多不少', () => {
    for (const p of ['2026-01', '2026-02', '2026-08', '2026-12']) {
      const { start, end } = monthRangeOf(p);
      const days = (end.getTime() - start.getTime()) / 86400000;
      const expectDays = p === '2026-02' ? 28 : 30 + (['2026-01','2026-08','2026-12'].includes(p) ? 1 : 0);
      expect(days, `${p} 区间天数`).toBe(expectDays);
    }
  });

  it('非法输入不抛错，且月份非法时退化为该年 1 月', () => {
    const cases: [string, string][] = [
      ['garbage', '1970-01-01T00:00:00.000Z'],
      ['', '1970-01-01T00:00:00.000Z'],
      ['abc-def', '1970-01-01T00:00:00.000Z'],
      ['2026', '2026-01-01T00:00:00.000Z'],// 年份合法 →退化到 1 月
      ['2026-13', '2026-01-01T00:00:00.000Z'], // 月份 13非法 → 退化到 1 月
      ['2026-00', '2026-01-01T00:00:00.000Z'], // 月份 00 非法 → 退化到 1 月
    ];
    for (const [bad, expected] of cases) {
      const { start } = monthRangeOf(bad);
      expect(start.getTime(), `${bad} 不应产生 Invalid Date`).not.toBeNaN();
      expect(start.toISOString(), `${bad} 的回退目标`).toBe(expected);
    }
  });

  it('相邻月份的边界必须首尾相接、无缝隙无重叠', () => {
    const aug = monthRangeOf('2026-08');
    const sep = monthRangeOf('2026-09');
    expect(aug.end.getTime()).toBe(sep.start.getTime());
    expect(aug.start.getTime()).toBeLessThan(aug.end.getTime());
  });
});

describe('monthRangeOfDate — 本月区间', () => {
  it('按参考日的年/月构造，边界同样是 00:00:00Z', () => {
    const ref = new Date(2026, 7, 15, 13, 45, 30);
    const { start, end } = monthRangeOfDate(ref);
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('缺省参考日时取当前月，且 start < now < end', () => {
    const now = new Date();
    const { start, end } = monthRangeOfDate();
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('日/月零点helper', () => {
  it('startOfMonthWallClock 取本地日期所在月的 UTC 月初零点', () => {
    const d = new Date(2026, 9, 7, 8, 0, 0);
    expect(startOfMonthWallClock(d).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('startOfDayWallClock 抹掉时分秒且不发生时区偏移', () => {
    const d = new Date(2026, 9, 7, 23, 59, 59, 999);
    const s = startOfDayWallClock(d);
    expect(s.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(s.getUTCHours()).toBe(0);
  });
});