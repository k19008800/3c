import { useRef } from "react";

/**
 * 6 位验证码输入组件（OtpInput）
 *
 * 交互：
 * - 每格只接受 1 位数字，输入后自动跳下一格
 * - Backspace 清空当前格后自动回退上一格
 * - 支持整段粘贴（自动过滤非数字）
 *
 * 复用场景：安全中心 2FA 启用/禁用、登录页 2FA 第二步。
 * 样式与 ChangeEmailPanel 内联版保持一致（P2 一致性优先）。
 */

interface OtpInputProps {
  /** 6 位验证码数组（每格一个字符，空串表示未输入） */
  value: string[];
  /** 任一格变化时回调完整数组 */
  onChange: (next: string[]) => void;
  /** 挂载后自动聚焦第一格，默认 true */
  autoFocus?: boolean;
  /** 提交期间禁用输入 */
  disabled?: boolean;
}

const CELL: React.CSSProperties = {
  width: 48,
  height: 56,
  textAlign: "center",
  fontSize: 22,
  fontWeight: 600,
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-panel)",
  color: "var(--color-text)",
  outline: "none",
  fontFamily: "inherit",
};

export default function OtpInput({ value, onChange, autoFocus = true, disabled = false }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "");
    const next = [...value];
    next[idx] = digit ? digit.charAt(digit.length - 1) : "";
    onChange(next);
    // 输入非空 → 聚焦下一格（最后一格不跳）
    if (digit && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    // 当前格为空时按 Backspace → 回退上一格
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    const next = [...value];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
    onChange(next);
  };

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 4 }} onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          style={{
            ...CELL,
            border: `1px solid ${digit ? "rgba(79,110,247,0.4)" : "var(--color-border)"}`,
          }}
        />
      ))}
    </div>
  );
}
