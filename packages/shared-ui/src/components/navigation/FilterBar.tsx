import React, { useCallback, useState } from "react";
import "./FilterBar.css";

/**
 * 筛选条件定义
 */
export interface FilterDef {
  /** 筛选字段 key */
  key: string;
  /** 筛选字段标签 */
  label: string;
  /** 控件类型 */
  type: "select" | "dateRange" | "input";
  /** select 类型时的选项 */
  options?: { label: string; value: string }[];
  /** 占位符文字 */
  placeholder?: string;
}

/**
 * 筛选栏组件属性
 */
export interface FilterBarProps {
  /** 筛选条件定义列表 */
  filters: FilterDef[];
  /** 筛选值变化回调 */
  onChange: (values: Record<string, any>) => void;
  /** 重置回调（可选，默认调用 onChange({})） */
  onReset?: () => void;
}

/**
 * FilterBar — 筛选栏
 *
 * 水平排列的筛选控件（下拉选择 / 日期范围 / 输入框）+ 筛选按钮 + 重置按钮。
 * 重置按钮清除所有筛选条件。
 *
 * 参考：ux-guidelines §8 搜索与筛选
 *
 * @example
 * ```tsx
 * <FilterBar
 *   filters={[
 *     { key: "status", label: "状态", type: "select", options: [{ label: "启用", value: "active" }] },
 *     { key: "date", label: "日期", type: "dateRange" },
 *     { key: "keyword", label: "关键词", type: "input", placeholder: "请输入" },
 *   ]}
 *   onChange={(values) => console.log(values)}
 * />
 * ```
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  onReset,
}) => {
  const [values, setValues] = useState<Record<string, any>>({});

  const handleFieldChange = useCallback(
    (key: string, value: any) => {
      const next = { ...values, [key]: value };
      // 空值从对象中移除
      if (value === "" || value === null || value === undefined) {
        delete next[key];
      }
      setValues(next);
    },
    [values],
  );

  const handleSubmit = useCallback(() => {
    // 过滤掉空值
    const filtered: Record<string, any> = {};
    for (const k of Object.keys(values)) {
      const v = values[k];
      if (v !== "" && v !== null && v !== undefined) {
        filtered[k] = v;
      }
    }
    onChange(filtered);
  }, [values, onChange]);

  const handleReset = useCallback(() => {
    setValues({});
    if (onReset) {
      onReset();
    } else {
      onChange({});
    }
  }, [onReset, onChange]);

  const renderControl = (f: FilterDef) => {
    const val = values[f.key] ?? "";

    switch (f.type) {
      case "select":
        return (
          <select
            className="sfc-filter-bar__select"
            value={val}
            onChange={(e) => handleFieldChange(f.key, e.target.value)}
            aria-label={f.label}
          >
            <option value="">{f.placeholder || `请选择${f.label}`}</option>
            {f.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "dateRange":
        return (
          <div className="sfc-filter-bar__date-range">
            <input
              className="sfc-filter-bar__date-input"
              type="date"
              value={val[0] || ""}
              onChange={(e) => {
                const end = val[1] || "";
                handleFieldChange(f.key, [e.target.value, end]);
              }}
              aria-label={`${f.label} 起始日期`}
            />
            <span className="sfc-filter-bar__date-separator">~</span>
            <input
              className="sfc-filter-bar__date-input"
              type="date"
              value={val[1] || ""}
              onChange={(e) => {
                const start = val[0] || "";
                handleFieldChange(f.key, [start, e.target.value]);
              }}
              aria-label={`${f.label} 结束日期`}
            />
          </div>
        );

      case "input":
      default:
        return (
          <input
            className="sfc-filter-bar__input"
            type="text"
            value={val}
            onChange={(e) => handleFieldChange(f.key, e.target.value)}
            placeholder={f.placeholder || `请输入${f.label}`}
            aria-label={f.label}
          />
        );
    }
  };

  return (
    <div className="sfc-filter-bar">
      <div className="sfc-filter-bar__fields">
        {filters.map((f) => (
          <div key={f.key} className="sfc-filter-bar__field">
            <label className="sfc-filter-bar__label">{f.label}</label>
            {renderControl(f)}
          </div>
        ))}
      </div>
      <div className="sfc-filter-bar__actions">
        <button
          type="button"
          className="sfc-filter-bar__btn sfc-filter-bar__btn--primary"
          onClick={handleSubmit}
        >
          筛选
        </button>
        <button
          type="button"
          className="sfc-filter-bar__btn sfc-filter-bar__btn--reset"
          onClick={handleReset}
        >
          重置
        </button>
      </div>
    </div>
  );
};
