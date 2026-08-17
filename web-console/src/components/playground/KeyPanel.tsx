/**
 * Playground API Key 选择面板（各 Tab 共享，状态提升到 PlaygroundPage）
 *
 * 列表接口（/me/keys）只返回 keyPrefix，真实调用需要完整 Key：
 * 创建 Key 时后端仅展示一次，已由 ApiKeysPage 写入 localStorage 预填。
 *
 * @module components/playground
 */

import { HelpIcon } from "@3cloud/shared-ui";
import type { ApiKeyRow } from "./types";

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text)",
  display: "block",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fff",
  color: "var(--color-text)",
};

export function KeyPanel(props: {
  keys?: ApiKeyRow[];
  selectedKeyId: number | null;
  onSelectedKeyId: (id: number | null) => void;
  fullKey: string;
  onFullKey: (v: string) => void;
}) {
  const { keys, selectedKeyId, onSelectedKeyId, fullKey, onFullKey } = props;

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        marginBottom: 16,
        flexWrap: "wrap",
        padding: 16,
        background: "#fff",
        borderRadius: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <label style={labelStyle}>
          API Key
          <HelpIcon
            text="选择要测试的 API Key。列表仅展示前缀，需粘贴完整 Key（3c_...）才能真实调用；最近创建的一条已自动预填。"
            level="button"
          />
        </label>
        <select
          value={selectedKeyId ?? ""}
          onChange={(e) => onSelectedKeyId(e.target.value ? parseInt(e.target.value) : null)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">（未选择，使用下方完整 Key）</option>
          {keys?.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} ({k.keyPrefix}...)
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 2, minWidth: 300 }}>
        <label style={labelStyle}>
          完整 API Key
          <HelpIcon
            text="调试请求直接携带此 Key（Authorization: Bearer）。创建 Key 时后端仅展示一次，已自动从最近创建记录预填；可手动粘贴。"
            level="button"
          />
        </label>
        <input
          value={fullKey}
          onChange={(e) => onFullKey(e.target.value)}
          placeholder="粘贴完整 API Key（3c_...）"
          style={{ ...inputStyle, fontFamily: "monospace" }}
        />
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
          ⚠️ 调试请求会真实计费扣余额（无可用供应商时走 mock 回退，同样记账）。
        </div>
      </div>
    </div>
  );
}
