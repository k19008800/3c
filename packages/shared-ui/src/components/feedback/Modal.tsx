import { useEffect, useCallback, useRef, useState, type ReactNode, type FC } from "react";
import "./Modal.css";

/**
 * Props for the Modal component.
 */
export interface ModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Callback when the modal requests to close */
  onClose: () => void;
  /** The title displayed in the modal header */
  title?: string;
  /** Modal content */
  children: ReactNode;
  /** Modal width (default: 520px per UX spec) */
  width?: number | string;
  /** Whether the modal can be closed by clicking the overlay or pressing ESC (default: true) */
  closable?: boolean;
  /** Optional additional class name */
  className?: string;
}

/**
 * Generic modal dialog component.
 *
 * Renders a centered modal with overlay, header, and body. Supports:
 * - Click-outside / overlay-click to close
 * - ESC key to close
 * - CSS fade-in + slide-down animation
 * - Customizable width
 * - Closable toggle
 *
 * @param open - Controls modal visibility.
 * @param onClose - Called when the user requests to close.
 * @param title - Optional modal title.
 * @param children - Modal body content.
 * @param width - Modal width (default: 520px).
 * @param closable - Whether overlay click and ESC close the modal (default: true).
 *
 * @example
 * ```tsx
 * <Modal open={open} onClose={() => setOpen(false)} title="创建 API Key">
 *   <form>...</form>
 * </Modal>
 * ```
 */
export const Modal: FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  width = 520,
  closable = true,
  className,
}) => {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Mount/unmount with delay for enter/exit animations
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Trigger enter animation on next frame
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      // Unmount after exit animation completes
      const timer = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ESC key handler
  useEffect(() => {
    if (!open || !closable) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closable, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  // Click overlay to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (closable && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closable, onClose],
  );

  if (!mounted) return null;

  const modalWidth = typeof width === "number" ? `${width}px` : width;

  return (
    <div
      className={`modal-overlay ${visible ? "modal-overlay--enter" : ""}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Dialog"}
    >
      <div
        ref={modalRef}
        className={`modal-panel ${visible ? "modal-panel--enter" : ""} ${className ?? ""}`}
        style={{ width: modalWidth }}
      >
        {title && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
            {closable && (
              <button className="modal-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </div>
        )}
        {closable && !title && (
          <button className="modal-close modal-close--no-title" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};
