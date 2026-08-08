import React from "react";
import "./Skeleton.css";

/**
 * Skeleton 组件属性
 */
export interface SkeletonProps {
  /** 宽度（支持 px / % / 等 CSS 单位），默认 100% */
  width?: string;
  /** 高度（支持 px / % / 等 CSS 单位），默认 16px */
  height?: string;
  /** 形状变体 */
  variant?: "text" | "rect" | "circle";
  /** 并列渲染数量，默认 1 */
  count?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * Skeleton — 单条骨架屏组件
 *
 * 支持三种变体：text（含圆角，模拟单行文字）、rect（直角矩形）、circle（正圆）。
 * 动画：浅灰底 + shimmer 从左到右扫光。
 *
 * @example
 * <Skeleton variant="text" width="80%" />
 * <Skeleton variant="rect" width="200px" height="120px" />
 * <Skeleton variant="circle" width="48px" height="48px" />
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "16px",
  variant = "text",
  count = 1,
  className,
}) => {
  const items = Array.from({ length: count }, (_, i) => i);

  const classNames = [
    "shared-skeleton",
    `shared-skeleton--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {items.map((key) => (
        <div
          key={key}
          className={classNames}
          style={{ width, height }}
          aria-hidden="true"
        />
      ))}
    </>
  );
};

Skeleton.displayName = "Skeleton";

/**
 * SkeletonGroup 组件属性
 */
export interface SkeletonGroupProps {
  /** 骨架行数，默认 3 */
  lines?: number;
  /** 自定义行内样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

/**
 * SkeletonGroup — 骨架屏段落组件
 *
 * 快速生成多条骨架行，模拟段落或表格行加载态。
 * 最后一行宽度自动收窄（约 60%），更接近真实文本排版。
 *
 * @example
 * <SkeletonGroup lines={4} />
 */
export const SkeletonGroup: React.FC<SkeletonGroupProps> = ({
  lines = 3,
  style,
  className,
}) => {
  const items = Array.from({ length: lines }, (_, i) => i);

  const containerClass = ["shared-skeleton-group", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass} style={style} aria-hidden="true">
      {items.map((key) => {
        const isLast = key === lines - 1;
        return (
          <Skeleton
            key={key}
            variant="text"
            height="16px"
            width={isLast ? "60%" : "100%"}
          />
        );
      })}
    </div>
  );
};

SkeletonGroup.displayName = "SkeletonGroup";
