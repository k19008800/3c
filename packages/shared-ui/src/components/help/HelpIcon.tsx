import { useState, useCallback } from "react";
import "./HelpIcon.css";

/**
 * Props for the HelpIcon component.
 */
export interface HelpIconProps {
  /** The help text to display in the tooltip or modal */
  text: string;
  /** Interaction level: "page" shows a modal on click, "button" shows a tooltip on hover */
  level?: "page" | "button";
  /** Optional additional class name for the wrapper */
  className?: string;
}

/**
 * `[?]` help icon component.
 *
 * Renders a small circular question-mark icon that provides contextual help.
 * - **Page-level**: clicking the icon opens a modal dialog with the help text.
 * - **Button-level**: hovering over the icon shows a pure-CSS tooltip.
 *
 * @param text - The help content string.
 * @param level - "page" or "button" (default: "button").
 *
 * @example
 * ```tsx
 * // Page-level help (opens a modal on click)
 * <HelpIcon text="This is the dashboard page. You can view all your metrics here." level="page" />
 *
 * // Button-level help (shows a tooltip on hover)
 * <HelpIcon text="Click to create a new API key" />
 * ```
 *
 * @see PageHelp — the modal popup component exported separately for standalone use.
 */
export function HelpIcon({ text, level = "button", className }: HelpIconProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = useCallback(() => {
    if (level === "page") {
      setModalOpen(true);
    }
  }, [level]);

  const handleClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <>
      <span
        className={`help-icon-wrapper ${level === "page" ? "help-icon-wrapper--page" : ""} ${className ?? ""}`}
      >
        <span className="help-icon" onClick={handleClick} role="button" tabIndex={0} aria-label="Help">
          ?
        </span>
        {level === "button" && (
          <span className="help-tooltip" role="tooltip">
            {text}
            <span className="help-tooltip-arrow" />
          </span>
        )}
      </span>
      {level === "page" && (
        <PageHelp open={modalOpen} onClose={handleClose} text={text} />
      )}
    </>
  );
}

/**
 * Props for the PageHelp modal component.
 */
export interface PageHelpProps {
  /** Whether the help modal is visible */
  open: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** The help text to display */
  text: string;
  /** Optional title for the modal (default: "页面帮助") */
  title?: string;
}

/**
 * Page-level help modal component.
 *
 * Displays help text in a centered modal dialog. Can be used standalone
 * or is automatically triggered by `HelpIcon` with `level="page"`.
 *
 * @param open - Controls visibility of the modal.
 * @param onClose - Called when the user requests to close the modal.
 * @param text - The help content to display.
 * @param title - Optional custom title (default: "页面帮助").
 *
 * @example
 * ```tsx
 * // Standalone usage
 * <PageHelp
 *   open={showHelp}
 *   onClose={() => setShowHelp(false)}
 *   text="This panel shows your API usage statistics for the current month."
 * />
 * ```
 */
export function PageHelp({ open, onClose, text, title = "页面帮助" }: PageHelpProps) {
  if (!open) return null;

  // Close on ESC
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      className="page-help-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`page-help-modal ${open ? "page-help-modal--enter" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="page-help-header">
          <h3 className="page-help-title">{title}</h3>
          <button className="page-help-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="page-help-body">
          <p className="page-help-text">{text}</p>
        </div>
      </div>
    </div>
  );
}
