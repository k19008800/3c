import React, { useState } from "react";
import "../../admin-system.css";

/**
 * 时间范围选项 — 对应原型「今日/昨日/本周/本月/自定义」
 *
 * 语义（均按客户注册时间 / 记录创建时间过滤）：
 * - 今日   ：今天 00:00:00 ~ 今天 23:59:59
 * - 昨日   ：昨天 00:00:00 ~ 昨天 23:59:59
 * - 本周   ：本周一 00:00:00 ~ 今天 23:59:59
 * - 本月   ：本月 1 日 00:00:00 ~ 今天 23:59:59
 * - 自定义 ：所选起始日 00:00:00 ~ 所选结束日 23:59:59
 */
export const TIME_RANGE_OPTIONS = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自定义" },
] as const;

/** 每个选项的悬停帮助文案 */
export const TIME_RANGE_HELP: Record<TimeRangeKey, string> = {
  today: "今天 00:00:00 ~ 今天 23:59:59 内创建（注册）的记录",
  yesterday: "昨天 00:00:00 ~ 昨天 23:59:59 内创建（注册）的记录",
  week: "本周一 00:00:00 ~ 今天 23:59:59 内创建（注册）的记录",
  month: "本月 1 日 00:00:00 ~ 今天 23:59:59 内创建（注册）的记录",
  custom: "自行选择起止日期，按所选范围过滤",
};

export type TimeRangeKey = (typeof TIME_RANGE_OPTIONS)[number]["key"];

/** 解析后的起止时间（本地时区，YYYY-MM-DD HH:mm:ss） */
export interface ResolvedRange {
  start: string;
  end: string;
}

/** 补齐到 YYYY-MM-DD 23:59:59 */
function endOfDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day} 23:59:59`;
}

/** 补齐到 YYYY-MM-DD 00:00:00 */
function startOfDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day} 00:00:00`;
}

/**
 * 把时间范围 key（+自定义日期）解析为具体起止时间。
 * 用于：前端展示解析区间、向后端传 date_from / date_to。
 *
 * @example
 * resolveTimeRange("week")
 * // => { start: "2026-07-27 00:00:00", end: "2026-08-02 23:59:59" }
 */
export function resolveTimeRange(key: TimeRangeKey, custom?: { start?: string; end?: string }): ResolvedRange {
  const now = new Date();
  if (key === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (key === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { start: startOfDay(d), end: endOfDay(d) };
  }
  if (key === "week") {
    const monday = new Date(now);
    const day = now.getDay() === 0 ? 7 : now.getDay(); // 周日=7
    monday.setDate(now.getDate() - (day - 1));
    return { start: startOfDay(monday), end: endOfDay(now) };
  }
  if (key === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: startOfDay(first), end: endOfDay(now) };
  }
  // custom
  const cStart = custom?.start;
  const cEnd = custom?.end;
  if (cStart && cEnd) {
    return { start: `${cStart} 00:00:00`, end: `${cEnd} 23:59:59` };
  }
  return { start: startOfDay(now), end: endOfDay(now) };
}

/**
 * TimeRangeFilter 属性
 */
export interface TimeRangeFilterProps {
  /** 当前选中项 */
  value?: TimeRangeKey;
  /** 变化回调（custom 时附带起止日期） */
  onChange?: (key: TimeRangeKey, range?: { start?: string; end?: string }) => void;
  /** 置灰禁用（该页面数据源暂不支持时间筛选时使用） */
  disabled?: boolean;
  /** 禁用时的提示文案 */
  disabledHint?: string;
}

/**
 * TimeRangeFilter — 原型「时间范围」筛选组
 *
 * 对应原型 filter-group：今日/昨日/本周/本月 按钮 + 自定义（日期起止 + 确定）。
 * 选中「自定义」时展开两个 date 输入框，点「确定」提交。
 * 每个按钮带 tooltip 说明该时间范围的具体定义。
 *
 * @example
 * ```tsx
 * const [range, setRange] = useState<TimeRangeKey>("today");
 * const [customRange, setCustomRange] = useState<{ start?: string; end?: string }>();
 * <TimeRangeFilter
 *   value={range}
 *   onChange={(k, r) => { setRange(k); if (r) setCustomRange(r); }}
 * />
 * ```
 */
export const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({
  value = "today",
  onChange,
  disabled = false,
  disabledHint = "该页面当前不支持按时间范围筛选",
}) => {
  const [showCustom, setShowCustom] = useState(value === "custom");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const handleBtn = (key: TimeRangeKey) => {
    if (disabled) return;
    if (key === "custom") {
      setShowCustom(true);
      onChange?.(key);
      return;
    }
    setShowCustom(false);
    onChange?.(key);
  };

  return (
    <div className="c3-filter-group" title={disabled ? disabledHint : undefined}>
      <span className="c3-filter-label">时间范围</span>
      {TIME_RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          title={TIME_RANGE_HELP[opt.key]}
          disabled={disabled}
          className={`c3-time-btn${value === opt.key ? " c3-time-btn--active" : ""}`}
          onClick={() => handleBtn(opt.key)}
        >
          {opt.label}
        </button>
      ))}
      <div className={`c3-custom-date${showCustom ? " c3-custom-date--show" : ""}`}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="起始日期" />
        <span>至</span>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="结束日期" />
        <button
          type="button"
          className="c3-apply-btn"
          onClick={() => onChange?.("custom", { start, end })}
        >
          确定
        </button>
      </div>
    </div>
  );
};
