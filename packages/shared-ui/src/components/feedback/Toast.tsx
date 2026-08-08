import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  useState,
  type ReactNode,
  type FC,
} from "react";
import "./Toast.css";

// ============================================================================
// Types
// ============================================================================

/** The severity level of a toast notification. */
export type ToastType = "success" | "error" | "warning" | "info";

/** A single toast notification. */
export interface ToastItem {
  /** Unique identifier */
  id: string;
  /** Severity type */
  type: ToastType;
  /** Display message */
  message: string;
  /** Whether the toast is currently visible (for exit animation) */
  visible: boolean;
  /** Auto-dismiss duration in ms */
  duration: number;
}

/** The public API returned by useToast(). */
export interface ToastAPI {
  toast: {
    /** Show a success toast (auto-dismiss 3s) */
    success: (msg: string) => void;
    /** Show an error toast (auto-dismiss 5s) */
    error: (msg: string) => void;
    /** Show a warning toast (auto-dismiss 5s) */
    warning: (msg: string) => void;
    /** Show an info toast (auto-dismiss 3s) */
    info: (msg: string) => void;
  };
}

// ============================================================================
// Reducer
// ============================================================================

type ToastAction =
  | { type: "ADD"; payload: ToastItem }
  | { type: "HIDE"; id: string }
  | { type: "REMOVE"; id: string }
  | { type: "RESET_TIMER"; id: string };

function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case "ADD": {
      // Deduplicate: same message + same type => reset existing timer
      const existing = state.find(
        (t) => t.message === action.payload.message && t.type === action.payload.type,
      );
      if (existing) {
        return state.map((t) =>
          t.id === existing.id ? { ...t, visible: true, duration: action.payload.duration } : t,
        );
      }
      return [action.payload, ...state];
    }
    case "HIDE":
      return state.map((t) => (t.id === action.id ? { ...t, visible: false } : t));
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
    case "RESET_TIMER":
      return state.map((t) => (t.id === action.id ? { ...t, visible: true } : t));
    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface ToastContextValue {
  addToast: (type: ToastType, message: string, duration: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================================================
// Constants
// ============================================================================

const SUCCESS_DURATION = 3000;
const INFO_DURATION = 3000;
const WARNING_DURATION = 5000;
const ERROR_DURATION = 5000;
const EXIT_ANIMATION_DELAY = 300; // matches CSS transition duration

// ============================================================================
// Provider
// ============================================================================

/**
 * Props for the ToastProvider component.
 */
export interface ToastProviderProps {
  /** The application content */
  children: ReactNode;
}

/**
 * Global toast notification provider.
 *
 * Wrap the application root with this to enable the `useToast()` hook everywhere
 * in the tree. Renders a `ToastContainer` internally.
 *
 * @example
 * ```tsx
 * // In your App root:
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 */
export const ToastProvider: FC<ToastProviderProps> = ({ children }) => {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const addToast = useCallback((type: ToastType, message: string, duration: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    dispatch({
      type: "ADD",
      payload: { id, type, message, visible: true, duration },
    });
  }, []);

  const contextValue: ToastContextValue = { addToast };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} dispatch={dispatch} />
    </ToastContext.Provider>
  );
};

// ============================================================================
// useToast Hook
// ============================================================================

/**
 * Hook to access the toast notification API.
 *
 * Must be called within a `ToastProvider`.
 *
 * @returns An object with `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()`.
 *
 * @example
 * ```tsx
 * const { toast } = useToast();
 * toast.success("API Key 创建成功");
 * toast.error("网络请求失败，请稍后重试");
 * ```
 */
export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used within a <ToastProvider>");
  }

  const { addToast } = ctx;

  return {
    toast: {
      success: useCallback(
        (msg: string) => addToast("success", msg, SUCCESS_DURATION),
        [addToast],
      ),
      error: useCallback(
        (msg: string) => addToast("error", msg, ERROR_DURATION),
        [addToast],
      ),
      warning: useCallback(
        (msg: string) => addToast("warning", msg, WARNING_DURATION),
        [addToast],
      ),
      info: useCallback(
        (msg: string) => addToast("info", msg, INFO_DURATION),
        [addToast],
      ),
    },
  };
}

// ============================================================================
// Toast Timer (per-item)
// ============================================================================

/**
 * Internal hook that manages auto-dismiss and exit animation for a single toast.
 */
function useToastTimer(
  id: string,
  duration: number,
  visible: boolean,
  dispatch: React.Dispatch<ToastAction>,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Clear any previous timer
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      dispatch({ type: "HIDE", id });
      exitRef.current = setTimeout(() => {
        dispatch({ type: "REMOVE", id });
      }, EXIT_ANIMATION_DELAY);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (exitRef.current) clearTimeout(exitRef.current);
    };
  }, [id, duration, visible, dispatch]);
}

// ============================================================================
// ToastItem Component
// ============================================================================

interface ToastItemViewProps {
  item: ToastItem;
  onClose: (id: string) => void;
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

function ToastItemView({ item, onClose }: ToastItemViewProps) {
  return (
    <div
      className={`toast-item toast-item--${item.type} ${item.visible ? "toast-item--enter" : "toast-item--exit"}`}
      role="alert"
    >
      <span className="toast-icon">{TOAST_ICONS[item.type]}</span>
      <span className="toast-message">{item.message}</span>
      <button className="toast-close" onClick={() => onClose(item.id)} aria-label="Close">
        ✕
      </button>
    </div>
  );
}

// ============================================================================
// ToastContainer
// ============================================================================

interface ToastContainerProps {
  toasts: ToastItem[];
  dispatch: React.Dispatch<ToastAction>;
}

/**
 * Renders the stack of toast notifications.
 *
 * Automatically included inside `ToastProvider`. You typically don't need to
 * use this directly.
 */
export const ToastContainer: FC<ToastContainerProps> = ({ toasts, dispatch }) => {
  const handleClose = useCallback(
    (id: string) => {
      dispatch({ type: "HIDE", id });
      setTimeout(() => {
        dispatch({ type: "REMOVE", id });
      }, EXIT_ANIMATION_DELAY);
    },
    [dispatch],
  );

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((item) => (
        <ToastTimerWrapper key={item.id} item={item} dispatch={dispatch} onClose={handleClose} />
      ))}
    </div>
  );
};

/**
 * Wrapper component that sets up the auto-dismiss timer for a single toast.
 */
function ToastTimerWrapper({
  item,
  dispatch,
  onClose,
}: {
  item: ToastItem;
  dispatch: React.Dispatch<ToastAction>;
  onClose: (id: string) => void;
}) {
  useToastTimer(item.id, item.duration, item.visible, dispatch);
  // Only show visible (not yet removed) toasts — the timer handles removal
  return <ToastItemView item={item} onClose={onClose} />;
}
