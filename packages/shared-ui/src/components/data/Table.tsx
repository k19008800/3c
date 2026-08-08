import React, { useState, useCallback, useMemo } from "react";
import { EmptyState } from "./EmptyState";
import "./Table.css";

/**
 * 表格列定义
 * @template TRecord — 数据行类型
 */
export interface ColumnDef<TRecord = any> {
  /** 列唯一标识，也用作排序 key */
  key: string;
  /** 表头标题 */
  title: string;
  /** 对应数据字段名（render 未提供时自动取此字段） */
  dataIndex?: string;
  /** 列宽（CSS 值） */
  width?: string;
  /** 是否可排序 */
  sortable?: boolean;
  /**
   * 自定义渲染函数
   * @param value - 当前单元格值（由 dataIndex 确定）
   * @param record - 当前行数据
   * @param index - 行索引
   */
  render?: (value: unknown, record: TRecord, index: number) => React.ReactNode;
}

/**
 * Table 组件属性
 * @template TRecord — 数据行类型
 */
export interface TableProps<TRecord = any> {
  /** 列定义 */
  columns: ColumnDef<TRecord>[];
  /** 数据源 */
  dataSource: TRecord[];
  /** 加载状态 */
  loading?: boolean;
  /**
   * 行唯一 Key 函数或字段名
   * 默认使用行索引。
   */
  rowKey?: string | ((record: TRecord, index: number) => string);
  /** 行点击回调 */
  onRowClick?: (record: TRecord, index: number) => void;
  /** 空数据提示文本 */
  emptyText?: string;
  /** 自定义类名 */
  className?: string;
}

/** 排序方向 */
type SortOrder = "asc" | "desc" | null;

/**
 * 根据排序状态比较两行数据
 */
function compareValues(a: unknown, b: unknown, order: "asc" | "desc"): number {
  const sa = a == null ? "" : String(a);
  const sb = b == null ? "" : String(b);

  if (sa < sb) return order === "asc" ? -1 : 1;
  if (sa > sb) return order === "asc" ? 1 : -1;
  return 0;
}

/**
 * Table — 通用数据表格
 *
 * 功能：列排序（点击表头 toggle 升序 → 降序 → 无）、行 hover 高亮、可选行点击。
 * 加载态：半透明遮罩 + "加载中..." 文字。
 * 空数据态：使用 EmptyState 组件。
 * 对应 ux-guidelines §9 表格交互。
 *
 * @example
 * <Table
 *   columns={[
 *     { key: "name", title: "姓名", dataIndex: "name", sortable: true },
 *     { key: "age", title: "年龄", dataIndex: "age" },
 *     { key: "action", title: "操作", render: (_, record) => <button>编辑</button> },
 *   ]}
 *   dataSource={users}
 *   rowKey="id"
 *   onRowClick={(record) => navigate(`/user/${record.id}`)}
 * />
 */
export function Table<TRecord = any>({
  columns,
  dataSource,
  loading = false,
  rowKey,
  onRowClick,
  emptyText,
  className,
}: TableProps<TRecord>): React.ReactElement {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);

  /** 表头点击：toggle 排序 */
  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        // 同列循环：null → asc → desc → null
        if (sortOrder === null) setSortOrder("asc");
        else if (sortOrder === "asc") setSortOrder("desc");
        else {
          setSortOrder(null);
          setSortKey(null);
        }
      } else {
        setSortKey(key);
        setSortOrder("asc");
      }
    },
    [sortKey, sortOrder],
  );

  /** 排序后的数据 */
  const sortedData = useMemo(() => {
    if (!sortKey || !sortOrder) return dataSource;
    const sorted = [...dataSource];
    sorted.sort((a, b) => compareValues((a as any)[sortKey], (b as any)[sortKey], sortOrder));
    return sorted;
  }, [dataSource, sortKey, sortOrder]);

  /** 获取行标识 */
  const getRowKey = useCallback(
    (record: TRecord, index: number): string => {
      if (typeof rowKey === "function") return rowKey(record, index);
      if (typeof rowKey === "string") return String((record as any)[rowKey] ?? index);
      return String(index);
    },
    [rowKey],
  );

  /** 排序箭头字符 */
  const sortArrow = useCallback(
    (key: string): string => {
      if (sortKey !== key) return " ↕";
      if (sortOrder === "asc") return " ↑";
      if (sortOrder === "desc") return " ↓";
      return " ↕";
    },
    [sortKey, sortOrder],
  );

  const isEmpty = !loading && sortedData.length === 0;

  const containerClass = ["shared-table-wrapper", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      <div className="shared-table-container">
        {loading && (
          <div className="shared-table__loading-overlay">
            <span className="shared-table__loading-text">加载中...</span>
          </div>
        )}

        <table className="shared-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`shared-table__th${col.sortable ? " shared-table__th--sortable" : ""}`}
                  style={{ width: col.width }}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  role={col.sortable ? "columnheader button" : "columnheader"}
                  aria-sort={
                    sortKey === col.key
                      ? sortOrder === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {col.title}
                  {col.sortable && (
                    <span className="shared-table__sort-arrow">
                      {sortArrow(col.key)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td colSpan={columns.length} className="shared-table__empty-cell">
                  <EmptyState title={emptyText} />
                </td>
              </tr>
            ) : (
              sortedData.map((record, rowIndex) => (
                <tr
                  key={getRowKey(record, rowIndex)}
                  className={`shared-table__tr${onRowClick ? " shared-table__tr--clickable" : ""}`}
                  onClick={
                    onRowClick
                      ? () => onRowClick(record, rowIndex)
                      : undefined
                  }
                >
                  {columns.map((col) => {
                    const value = col.dataIndex != null
                      ? (record as any)[col.dataIndex]
                      : undefined;
                    const cellContent = col.render
                      ? col.render(value as unknown, record, rowIndex)
                      : (value as React.ReactNode);
                    return (
                      <td
                        key={col.key}
                        className="shared-table__td"
                        style={{ width: col.width }}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Table.displayName = "Table";
