/**
 * VirtualList - 通用虚拟滚动列表组件
 * 
 * 基于 react-window 实现高性能大数据列表渲染
 * 支持固定高度和可变高度两种模式
 * 
 * @example
 * // 固定高度
 * <VirtualList
 *   items={users}
 *   height={600}
 *   itemSize={80}
 *   renderItem={(user, index) => <UserCard user={user} />}
 * />
 * 
 * // 可变高度
 * <VirtualList
 *   items={logs}
 *   height={600}
 *   variableHeight
 *   estimatedItemSize={60}
 *   getItemSize={(index) => items[index].expanded ? surveyed ? 150 : 100 : 60}
 *   renderItem={(log, index) => <LogItem log={log} />}
 * />
 */

import React, { useMemo } from 'react';
import { FixedSizeList, VariableSizeList } from 'react-window';

export interface VirtualListProps<T> {
  /** 数据数组 */
  items: T[];
  /** 容器高度（像素或 CSS 值） */
  height: number | string;
  /** 容器宽度（像素或 CSS 值），默认 100% */
  width?: number | string;
  /** 固定模式下的每一项高度 */
  itemSize?: number;
  /** 是否使用可变高度模式 */
  variableHeight?: boolean;
  /** 可变高度模式下的估计高度（用于初始计算） */
  estimatedItemSize?: number;
  /** 可变高度模式下的高度计算函数 */
  getItemSize?: (index: number) => number;
  /** 渲染单个项目的函数 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 滚动到指定索引 */
  scrollToIndex?: number;
  /** 滚动对齐方式 */
  scrollAlignment?: 'auto' | 'smart' | 'center' | 'end' | 'start';
  /** 额外渲染的行数（提高滚动流畅度） */
  overscanCount?: number;
  /** 自定义列表容器的类名 */
  className?: string;
  /** 自定义列表容器的样式 */
  style?: React.CSSProperties;
  /** 列表为空时显示的内容 */
  emptyState?: React.ReactNode;
  /** 是否显示滚动条（默认 auto） */
  overflow?: 'auto' | 'hidden' | 'scroll';
  /** 横向溢出处理 */
  horizontalOverflow?: 'auto' | 'hidden' | 'scroll';
}

export function VirtualList<T>({
  items,
  height,
  width = '100%',
  itemSize =169,
  variableHeight = false,
  estimatedItemSize = 60,
  getItemSize,
  renderItem,
  scrollToIndex,
  scrollAlignment = 'auto',
  overscanCount = 5,
  className = '',
  style = {},
  emptyState,
  overflow = 'auto',
  horizontalOverflow = 'auto',
}: VirtualListProps<T>) {
  // 处理高度值
  const containerHeight = typeof height === 'string' ? height : `${height}px`;
  const containerWidth = typeof width === 'string' ? width : `${width}px`;

  // 空状态处理
  if (items.length === 0) {
    return (
      <div 
        className={`flex items-center justify-center text-slate-400 ${className}`}
        style={{
          height: containerHeight,
          width: containerWidth,
          overflow: 'hidden',
          ...style
        }}
      >
        {emptyState || '暂无数据'}
      </div>
    );
  }

  // 固定高度列表
  if (!variableHeight) {
    const FixedListRow = ({ index, style: rowStyle }: { index: number; style: React.CSSProperties }) => (
      <div style={rowStyle}>
        {renderItem(items[index], index)}
      </div>
    );

    return (
      <div 
        className={className}
        style={{
          height: containerHeight,
          width: containerWidth,
          overflow,
          overflowX: horizontalOverflow,
          ...style
        }}
      >
        <FixedSizeList
          height={typeof height === 'string' ? 600 : height} // 如果是字符串，使用默认600
          width={typeof width === 'string' ? '100%' : width}
          itemCount={items.length}
          itemSize={itemSize}
          overscanCount={overscanCount}
          initialScrollOffset={scrollToIndex ? scrollToIndex * itemSize : undefined}
          {...(scrollToIndex !== undefined ? { scrollToIndex, scrollAlignment } : {})}
        >
          {FixedListRow}
        </FixedSizeList>
      </div>
    );
  }

  // 可变高度列表
  if (!getItemSize) {
    console.warn('VirtualList: variableHeight 模式需要提供 getItemSize 函数');
    return (
      <div 
        className={`flex items-center justify-center text-red-500 ${className}`}
        style={{
          height: containerHeight,
          width: containerWidth,
          ...style
        }}
      >
        配置错误：可变高度模式需要 getItemSize 函数
      </div>
    );
  }

  // 创建高度缓存
  const sizeCache = useMemo(() => {
    const cache = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      cache[i] = getItemSize(i);
    }
    return cache;
  }, [items, getItemSize]);

  const VariableListRow = ({ index, style: rowStyle }: { index: number; style: React.CSSProperties }) => (
    <div style={rowStyle}>
      {renderItem(items[index], index)}
    </div>
  );

  return (
    <div 
      className={className}
      style={{
        height: containerHeight,
        width: containerWidth,
        overflow,
        overflowX: horizontalOverflow,
        ...style
      }}
    >
      <VariableSizeList
        height={typeof height === 'string' ? 600 : height}
        width={typeof width === 'string' ? '100%' : width}
        itemCount={items.length}
        itemSize={(index) => sizeCache[index]}
        estimatedItemSize={estimatedItemSize}
        overscanCount={overscanCount}
        initialScrollOffset={scrollToIndex ? sizeCache.slice(0, scrollToIndex).reduce((a, b) => a + b, 0) : undefined}
        {...(scrollToIndex !== undefined ? { scrollToIndex, scrollAlignment } : {})}
      >
        {VariableListRow}
      </VariableSizeList>
    </div>
  );
}