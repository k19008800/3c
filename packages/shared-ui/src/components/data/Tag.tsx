import React from "react";
import "../../admin-system.css";

/**
 * Tag 类型 — 对应原型 .tag-green/red/orange/blue/gray/purple
 */
export type TagType = "green" | "red" | "orange" | "blue" | "gray" | "purple";

/**
 * Tag 组件属性
 */
export interface TagProps {
  /** 标签颜色类型 */
  type?: TagType;
  /** 文本内容 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

/**
 * Tag — 原型「标签」徽章
 *
 * 对应原型 .tag/.tag-green…：浅底 + 边框 + 圆角的小徽章，
 * 用于状态/分类等短文本标记（正常/余额不足/已禁用…）。
 *
 * @example
 * ```tsx
 * <Tag type="green">正常</Tag>
 * <Tag type="orange">余额不足</Tag>
 * <Tag type="red">已禁用</Tag>
 * ```
 */
export const Tag: React.FC<TagProps> = ({ type = "gray", children, className }) => {
  const cls = ["c3-tag", `c3-tag--${type}`, className].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
};
