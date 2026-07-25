// ============================================================
//  3cloud (3C) — 富文本渲染组件
//  安全渲染 HTML 内容，XSS 防护
// ============================================================

import React, { useMemo } from "react";
import { clsx } from "clsx";

// ── Props ──

export interface RichTextViewerProps {
  /** HTML 内容 */
  content: string;
  /** 最大高度（超出显示滚动条） */
  maxHeight?: number;
  /** 是否显示边框 */
  bordered?: boolean;
  /** 是否显示背景 */
  background?: boolean;
  /** 类名 */
  className?: string;
  /** 是否允许图片 */
  allowImages?: boolean;
  /** 是否允许链接 */
  allowLinks?: boolean;
  /** 图片点击回调 */
  onImageClick?: (src: string) => void;
}

// ── XSS 防护：白名单标签和属性 ──

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "span",
  "div",
  "mark",
  "hr",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height", "class"]),
  span: new Set(["class", "style"]),
  div: new Set(["class", "style"]),
  p: new Set(["class", "style"]),
  h1: new Set(["class", "style"]),
  h2: new Set(["class", "style"]),
  h3: new Set(["class", "style"]),
  h4: new Set(["class", "style"]),
  h5: new Set(["class", "style"]),
  h6: new Set(["class", "style"]),
  mark: new Set(["class", "style"]),
};

const ALLOWED_STYLES = new Set([
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "text-align",
  "text-decoration",
  "margin",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
]);

// ── 安全属性检查 ──

function isSafeAttribute(tag: string, attr: string, value: string): boolean {
  // 检查是否为允许的属性
  const allowedAttrs = ALLOWED_ATTRIBUTES[tag];
  if (!allowedAttrs || !allowedAttrs.has(attr)) {
    return false;
  }

  // href/src 安全检查
  if (attr === "href" || attr === "src") {
    // 只允许 http/https/mailto 协议
    if (value.startsWith("javascript:")) return false;
    if (value.startsWith("data:") && attr === "href") return false; // 链接不允许 data:
    if (!value.startsWith("http://") && !value.startsWith("https://") && !value.startsWith("mailto:") && !value.startsWith("/") && !value.startsWith("data:image/")) {
      // 相对路径允许
      if (!value.startsWith("/") && !value.startsWith("./") && !value.startsWith("../")) {
        return false;
      }
    }
  }

  // style 安全检查
  if (attr === "style") {
    const styles = value.split(";").filter(Boolean);
    for (const style of styles) {
      const [prop] = style.split(":").map((s) => s.trim());
      if (!ALLOWED_STYLES.has(prop)) {
        return false;
      }
    }
  }

  return true;
}

// ── 简单的 XSS 过滤器（基于 DOMParser）──

function sanitizeHTML(html: string, options: { allowImages: boolean; allowLinks: boolean }): string {
  if (!html || typeof document === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function sanitizeNode(node: Node): Node | null {
    // 文本节点直接返回
    if (node.nodeType === Node.TEXT_NODE) {
      return node.cloneNode(true);
    }

    // 非元素节点跳过
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    // 检查标签是否允许
    if (!ALLOWED_TAGS.has(tagName)) {
      return null;
    }

    // 检查图片和链接权限
    if (tagName === "img" && !options.allowImages) {
      return null;
    }
    if (tagName === "a" && !options.allowLinks) {
      // 链接不允许时，保留文本内容
      const span = document.createElement("span");
      for (const child of Array.from(element.childNodes)) {
        const sanitized = sanitizeNode(child);
        if (sanitized) span.appendChild(sanitized);
      }
      return span;
    }

    // 创建新元素
    const newElement = document.createElement(tagName);

    // 复制允许的属性
    for (const attr of Array.from(element.attributes)) {
      if (isSafeAttribute(tagName, attr.name, attr.value)) {
        newElement.setAttribute(attr.name, attr.value);
      }
    }

    // 链接强制添加安全属性
    if (tagName === "a") {
      newElement.setAttribute("target", "_blank");
      newElement.setAttribute("rel", "noopener noreferrer");
    }

    // 递归处理子节点
    for (const child of Array.from(element.childNodes)) {
      const sanitized = sanitizeNode(child);
      if (sanitized) newElement.appendChild(sanitized);
    }

    return newElement;
  }

  const body = doc.body;
  const fragment = document.createDocumentFragment();

  for (const child of Array.from(body.childNodes)) {
    const sanitized = sanitizeNode(child);
    if (sanitized) fragment.appendChild(sanitized);
  }

  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

// ── 主组件 ──

export function RichTextViewer({
  content,
  maxHeight,
  bordered = false,
  background = false,
  className,
  allowImages = true,
  allowLinks = true,
  onImageClick,
}: RichTextViewerProps) {
  // ── XSS 过滤 ──

  const sanitizedContent = useMemo(() => {
    return sanitizeHTML(content, { allowImages, allowLinks });
  }, [content, allowImages, allowLinks]);

  // ── 图片点击处理 ──

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onImageClick) return;

    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      const src = target.getAttribute("src");
      if (src) {
        onImageClick(src);
      }
    }
  };

  return (
    <div
      className={clsx(
        "prose dark:prose-invert max-w-none",
        bordered && "border rounded-lg dark:border-gray-700",
        background && "bg-white dark:bg-gray-900",
        className
      )}
      style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined }}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      onClick={handleClick}
    />
  );
}

// ── 简化版本（用于列表/卡片等小场景）──

export function RichTextPreview({
  content,
  maxLength = 200,
  className,
}: {
  content: string;
  maxLength?: number;
  className?: string;
}) {
  // 移除 HTML 标签，只保留文本
  const plainText = useMemo(() => {
    if (!content) return "";
    const doc = new DOMParser().parseFromString(content, "text/html");
    return doc.body.textContent || "";
  }, [content]);

  // 截断
  const truncated = plainText.length > maxLength ? plainText.slice(0, maxLength) + "..." : plainText;

  return (
    <div className={clsx("text-sm text-gray-600 dark:text-gray-400 line-clamp-3", className)}>
      {truncated || "无内容"}
    </div>
  );
}

export default RichTextViewer;
