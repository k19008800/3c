import React, { useCallback, useEffect, useRef, useState } from "react";
import "./SearchBar.css";

/**
 * 搜索栏组件属性
 */
export interface SearchBarProps {
  /** 占位符文字 */
  placeholder?: string;
  /** 当前输入值 */
  value: string;
  /** 值变化回调（debounce 后触发） */
  onChange: (value: string) => void;
  /** 主动搜索回调（回车 / 点击搜索图标触发） */
  onSearch?: (value: string) => void;
  /** debounce 毫秒数（默认 300ms） */
  debounceMs?: number;
}

/**
 * SearchBar — 搜索栏
 *
 * 输入框 + 搜索图标按钮。
 * - 输入内容时内置 debounce（默认 300ms），debounce 后才触发 onChange
 * - 回车键或点击搜索按钮触发 onSearch
 * - 有内容时显示清除按钮（X），点击清空并触发 onChange / onSearch
 *
 * 参考：ux-guidelines §8 搜索与筛选
 *
 * @example
 * ```tsx
 * <SearchBar
 *   placeholder="搜索API名称"
 *   value={keyword}
 *   onChange={setKeyword}
 *   onSearch={handleSearch}
 * />
 * ```
 */
export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "请输入搜索关键词",
  value,
  onChange,
  onSearch,
  debounceMs = 300,
}) => {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部 value 变化时同步到本地
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // 清理 timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocalValue(v);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(v);
      }, debounceMs);
    },
    [onChange, debounceMs],
  );

  const handleSearch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(localValue);
    onSearch?.(localValue);
  }, [localValue, onChange, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleClear = useCallback(() => {
    setLocalValue("");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange("");
    onSearch?.("");
    inputRef.current?.focus();
  }, [onChange, onSearch]);

  return (
    <div className="sfc-search-bar">
      <span className="sfc-search-bar__icon sfc-search-bar__icon--search">&#x1F50D;</span>
      <input
        ref={inputRef}
        className="sfc-search-bar__input"
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {localValue && (
        <span
          className="sfc-search-bar__icon sfc-search-bar__icon--clear"
          onClick={handleClear}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleClear();
          }}
        >
          &#x2715;
        </span>
      )}
      <button
        type="button"
        className="sfc-search-bar__btn"
        onClick={handleSearch}
        aria-label="搜索"
      >
        &#x1F50D;
      </button>
    </div>
  );
};
