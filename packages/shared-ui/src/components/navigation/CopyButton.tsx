import React, { useCallback, useRef, useState } from "react";
import "./CopyButton.css";

/**
 * 复制按钮组件属性
 */
export interface CopyButtonProps {
  /** 要复制到剪贴板的文本 */
  text: string;
  /** 按钮文字（默认 "复制"） */
  label?: string;
}

/**
 * CopyButton — 复制按钮
 *
 * 点击后将指定文本复制到剪贴板，按钮文字变为"已复制"，
 * 2 秒后自动恢复。
 *
 * 参考：ux-guidelines §15 复制操作
 *
 * @example
 * ```tsx
 * <CopyButton text="sk-abc123def456" label="复制 Key" />
 * ```
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label = "复制",
}) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      // 清除之前的 timer
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // 降级：使用 execCommand
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        // 复制失败，静默处理
      }
      document.body.removeChild(textarea);
    }
  }, [text]);

  return (
    <button
      type="button"
      className={`sfc-copy-btn ${copied ? "sfc-copy-btn--copied" : ""}`}
      onClick={handleCopy}
    >
      <span className="sfc-copy-btn__icon">
        {copied ? "✓" : "⧉"}
      </span>
      <span className="sfc-copy-btn__label">
        {copied ? "已复制" : label}
      </span>
    </button>
  );
};
