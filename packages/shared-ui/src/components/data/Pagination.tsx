import React, { useCallback, useMemo, useState } from "react";
import "./Pagination.css";

/**
 * Pagination 组件属性
 */
export interface PaginationProps {
  /** 当前页码（1-based） */
  current: number;
  /** 总条数 */
  total: number;
  /** 每页条数，默认 20 */
  pageSize?: number;
  /** 页码 / 页大小变更回调 */
  onChange: (page: number, pageSize: number) => void;
  /** 可选每页条数选项，默认 [20, 50, 100] */
  pageSizeOptions?: number[];
  /** 自定义类名 */
  className?: string;
}

/**
 * 生成页码数组（含省略号标记）
 * @param current 当前页
 * @param totalPages 总页数
 * @returns (number | "...")[]
 */
function generatePageNumbers(
  current: number,
  totalPages: number,
): (number | "...")[] {
  const raw: number[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) raw.push(i);
    return raw;
  }

  // 始终包含首页、尾页
  raw.push(1);

  if (current <= 3) {
    raw.push(2, 3, 4);
    raw.push(0); // placeholder 会被替换为 "..."
    raw.push(totalPages);
  } else if (current >= totalPages - 2) {
    raw.push(0);
    raw.push(totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    raw.push(0);
    raw.push(current - 1, current, current + 1);
    raw.push(0);
    raw.push(totalPages);
  }

  // 替换 0 为 "..."，并去重（连续 0 合并为一个 "..."）
  const result: (number | "...")[] = [];
  let prevIsEllipsis = false;
  for (const n of raw) {
    if (n === 0) {
      if (!prevIsEllipsis) {
        result.push("...");
        prevIsEllipsis = true;
      }
    } else {
      result.push(n);
      prevIsEllipsis = false;
    }
  }
  return result;
}

/**
 * Pagination — 分页组件
 *
 * 传统分页：页码 + 上下页 + 总数 + 每页条数选择 + 页码跳转。
 * 超过 7 页时显示省略号。
 * 对应 ux-guidelines §7 分页。
 *
 * @example
 * <Pagination
 *   current={1}
 *   total={85}
 *   pageSize={20}
 *   onChange={(page, size) => fetchData(page, size)}
 * />
 */
export const Pagination: React.FC<PaginationProps> = ({
  current,
  total,
  pageSize = 20,
  onChange,
  pageSizeOptions = [20, 50, 100],
  className,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [jumpValue, setJumpValue] = useState("");
  const safeCurrent = Math.min(Math.max(1, current), totalPages);

  const pages = useMemo(
    () => generatePageNumbers(safeCurrent, totalPages),
    [safeCurrent, totalPages],
  );

  const canPrev = safeCurrent > 1;
  const canNext = safeCurrent < totalPages;

  /** 切换页码（确保不越界） */
  const goTo = useCallback(
    (page: number) => {
      const clamped = Math.min(Math.max(1, page), totalPages);
      if (clamped !== safeCurrent) {
        onChange(clamped, pageSize);
      }
    },
    [safeCurrent, totalPages, pageSize, onChange],
  );

  /** 跳转输入框 */
  const handleJumpKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const num = parseInt(jumpValue, 10);
        if (!isNaN(num) && num >= 1) {
          goTo(num);
        }
        setJumpValue("");
      }
    },
    [jumpValue, goTo],
  );

  const handlePageSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSize = parseInt(e.target.value, 10);
      // 重新计算当前页：保持数据起始位置尽量不变
      const newPage = Math.min(
        Math.ceil(((safeCurrent - 1) * pageSize + 1) / newSize),
        Math.ceil(total / newSize),
      );
      onChange(newPage || 1, newSize);
    },
    [safeCurrent, pageSize, total, onChange],
  );

  const containerClass = ["shared-pagination", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      <span className="shared-pagination__total">共 {total} 条</span>

      <div className="shared-pagination__controls">
        {/* 上一页 */}
        <button
          className="shared-pagination__btn"
          disabled={!canPrev}
          onClick={() => goTo(safeCurrent - 1)}
          type="button"
          aria-label="上一页"
        >
          ‹
        </button>

        {/* 页码 */}
        {pages.map((page, idx) => {
          if (page === "...") {
            return (
              <span
                key={`ellipsis-${idx}`}
                className="shared-pagination__ellipsis"
              >
                ...
              </span>
            );
          }
          const isActive = page === safeCurrent;
          return (
            <button
              key={page}
              className={`shared-pagination__btn${isActive ? " shared-pagination__btn--active" : ""}`}
              onClick={() => goTo(page)}
              type="button"
              aria-current={isActive ? "page" : undefined}
            >
              {page}
            </button>
          );
        })}

        {/* 下一页 */}
        <button
          className="shared-pagination__btn"
          disabled={!canNext}
          onClick={() => goTo(safeCurrent + 1)}
          type="button"
          aria-label="下一页"
        >
          ›
        </button>
      </div>

      {/* 每页条数 */}
      <select
        className="shared-pagination__size-select"
        value={pageSize}
        onChange={handlePageSizeChange}
      >
        {pageSizeOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt} 条/页
          </option>
        ))}
        {/* 确保当前 pageSize 始终可选（即便不在预设列表中） */}
        {!pageSizeOptions.includes(pageSize) && (
          <option value={pageSize}>{pageSize} 条/页</option>
        )}
      </select>

      {/* 跳转 */}
      <span className="shared-pagination__jump">
        跳至
        <input
          className="shared-pagination__jump-input"
          type="text"
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={handleJumpKeyDown}
          aria-label="跳转页码"
        />
        页
      </span>
    </div>
  );
};

Pagination.displayName = "Pagination";
