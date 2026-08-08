import React, { useCallback, useEffect, useRef, useState } from "react";
import "./ConfirmPopover.css";

/**
 * 气泡确认组件属性
 */
export interface ConfirmPopoverProps {
  /** 确认提示文案 */
  title: string;
  /** 补充描述文案（可选） */
  description?: string;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 触发气泡的 UI 元素 */
  children: React.ReactNode;
}

/**
 * ConfirmPopover — 气泡确认（危险操作二次确认）
 *
 * 点击 children 触发元素后，在其旁边弹出确认气泡，
 * 包含确认文案、取消和确认按钮。
 * 点击外部区域、按 ESC、点击取消或确认后自动关闭。
 * 确认按钮使用危险色（红色）。
 *
 * 参考：ux-guidelines §6.3 气泡确认规范
 *
 * @example
 * ```tsx
 * <ConfirmPopover
 *   title="确定要删除此用户吗？"
 *   description="此操作不可撤销"
 *   onConfirm={() => handleDelete()}
 * >
 *   <button className="btn-danger">删除</button>
 * </ConfirmPopover>
 * ```
 */
export const ConfirmPopover: React.FC<ConfirmPopoverProps> = ({
  title,
  description,
  onConfirm,
  onCancel,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm();
    close();
  }, [onConfirm, close]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    close();
  }, [onCancel, close]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  return (
    <div className="sfc-confirm-popover">
      <div ref={triggerRef} onClick={handleToggle} className="sfc-confirm-popover__trigger">
        {children}
      </div>
      {open && (
        <div ref={popoverRef} className="sfc-confirm-popover__popover">
          <div className="sfc-confirm-popover__content">
            <p className="sfc-confirm-popover__title">{title}</p>
            {description && (
              <p className="sfc-confirm-popover__description">{description}</p>
            )}
          </div>
          <div className="sfc-confirm-popover__actions">
            <button
              type="button"
              className="sfc-confirm-popover__btn sfc-confirm-popover__btn--cancel"
              onClick={handleCancel}
            >
              取消
            </button>
            <button
              type="button"
              className="sfc-confirm-popover__btn sfc-confirm-popover__btn--confirm"
              onClick={handleConfirm}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
