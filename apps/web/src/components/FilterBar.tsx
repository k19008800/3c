import { useState, useCallback } from "react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  key: string;
  label: string;
  type: "select" | "search";
  options?: FilterOption[];
  placeholder?: string;
}

export interface FilterBarProps {
  filters: FilterDef[];
  onChange: (values: Record<string, string>) => void;
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleChange = useCallback(
    (key: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  return (
    <div className="filter-bar">
      {filters.map((f) => {
        if (f.type === "select") {
          return (
            <label key={f.key} className="filter-item">
              <span className="filter-label">{f.label}</span>
              <select
                className="filter-select"
                value={values[f.key] ?? ""}
                onChange={(e) => handleChange(f.key, e.target.value)}
              >
                <option value="">全部</option>
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={f.key} className="filter-item">
            <span className="filter-label">{f.label}</span>
            <input
              type="text"
              className="filter-input"
              placeholder={f.placeholder ?? `搜索${f.label}…`}
              value={values[f.key] ?? ""}
              onChange={(e) => handleChange(f.key, e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
