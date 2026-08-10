import React, { useState } from "react";
import "../../admin-system.css";

/**
 * 时间范围选项 — 对应原型「今日/昨日/本周/本月/自定义」
 */
export const TIME_RANGE_OPTIONS = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自定义" },
] as const;

export type TimeRangeKey = (typeof TIME_RANGE_OPTIONS)[number]["key"];

/**
 * TimeRangeFilter 属性
 */
export interface TimeRangeFilterProps {
  /** 当前选中项 */
  value?: TimeRangeKey;
  /** 变化回调（custom 时附带起止日期） */
  onChange?: (key: TimeRangeKey, range?: { start?: string; end?: string }) => void;
}

/**
 * TimeRangeFilter — 原型「时间范围」筛选组
 *
 * 对应原型 filter-group：今日/昨日/本周/本月 按钮 + 自定义（日期起止 + 确定）。
 * 选中「自定义」时展开两个 date 输入框，点「确定」提交。
 *
 * @example
 * ```tsx
 * <TimeRangeFilter value={range} onChange={(k, r) => setRange(k)} />
 * ```
 */
export const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({ value = "today", onChange }) => {
  const [showCustom, setShowCustom] = useState(value === "custom");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const handleBtn = (key: TimeRangeKey) => {
    if (key === "custom") {
      setShowCustom(true);
      onChange?.(key);
      return;
    }
    setShowCustom(false);
    onChange?.(key);
  };

  return (
    <div className="c3-filter-group">
      <span className="c3-filter-label">时间范围</span>
      {TIME_RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
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
