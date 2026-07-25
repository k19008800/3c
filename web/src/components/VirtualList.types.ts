import { ReactNode } from 'react';

/**
 * 列配置接口
 */
export interface Column<T = any> {
  key: string
  label: string | React.ReactNode
  width: number
  align?: 'left' | 'center' | 'right'
  render?: (item: T, index: number) => React.ReactNode
}

/**
 * 虚拟滚动列表的配置接口
 */
export interface VirtualListConfig {
  /**
   * 行高（像素）
   */
  rowHeight: number;
  
  /**
   * 容器高度（像素），如果未设置则自动撑满
   */
  containerHeight?: number;
  
  /**
   * 容器宽度（像素），如果未设置则自动撑满
   */
  containerWidth?: number;
  
  /**
   * 是否显示滚动条
   */
  showScrollbar?: boolean;
  
  /**
   * 滚动条大小（像素）
   */
  scrollbarSize?: number;
  
  /**
   * 预加载的行数（视窗上下）
   */
  overscanCount?: number;
}

/**
 * 虚拟滚动列表的状态接口
 */
export interface VirtualListState<T = any> {
  /**
   * 当前可见的数据项
   */
  visibleItems: T[];
  
  /**
   * 当前滚动位置（像素）
   */
  scrollOffset: number;
  
  /**
   * 当前可见区域的起始索引
   */
  startIndex: number;
  
  /**
   * 当前可见区域的结束索引
   */
  endIndex: number;
}

/**
 * 虚拟滚动行的渲染函数类型
 */
export type RowRenderer<T> = (item: T, index: number, style: React.CSSProperties) => ReactNode;

/**
 * 行点击回调
 */
export type OnRowClick<T> = (item: T, index: number) => void;