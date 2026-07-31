"use client";

import { useState } from "react";

/**
 * 价格计算器（客户端组件）
 * 选择模型 + 输入 tokens，实时计算费用
 */

interface ModelPrice {
  name: string;
  display_name: string | null;
  vendor: string;
  cost_input_price: string;
  cost_output_price: string;
}

export default function PriceCalculator({ models }: { models: ModelPrice[] }) {
  const [selected, setSelected] = useState("");
  const [inputTokens, setInputTokens] = useState(1000);
  const [outputTokens, setOutputTokens] = useState(500);

  const model = models.find((m) => m.name === selected);
  const inputPrice = model ? Number(model.cost_input_price) : 0;
  const outputPrice = model ? Number(model.cost_output_price) : 0;
  const cost = (inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice;

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, background: "#fff" }}>
      <h3 style={{ marginBottom: 16 }}>价格计算器</h3>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>模型</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }}>
            <option value="">请选择模型</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.display_name ?? m.name}（{m.vendor}）
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>输入 Tokens</label>
          <input
            type="number"
            value={inputTokens}
            min={0}
            onChange={(e) => setInputTokens(Number(e.target.value))}
            style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }}
          />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>输出 Tokens</label>
        <input
          type="number"
          value={outputTokens}
          min={0}
          onChange={(e) => setOutputTokens(Number(e.target.value))}
          style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }}
        />
      </div>
      <div style={{ marginTop: 20, padding: 16, background: "#f8fafc", borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {model ? `${model.display_name ?? model.name}：输入 ¥${inputPrice}/1K · 输出 ¥${outputPrice}/1K` : "选择模型后计算"}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>
          {model ? `≈ ¥${cost.toFixed(4)}` : "—"}
        </div>
      </div>
    </div>
  );
}
