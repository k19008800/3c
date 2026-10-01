"use client";

import { useState } from "react";

/**
 * 价格计算器（客户端组件）
 * 选择模型 + 输入 tokens，实时计算费用
 *
 * labels 由服务端按当前语言传入（缺省中文）；标题旁带 [?] 帮助
 * （对齐 PRODUCT-DESIGN-PRINCIPLES.md P1 页面级帮助）。
 */

interface ModelPrice {
  name: string;
  display_name: string | null;
  vendor: string;
  input_price: number;
  output_price: number;
  cost_input_price?: string;
  cost_output_price?: string;
  // 编码口径：公开接口待后端补充（缺失为 null，不拼造）
  model_code?: string | null;
}

export interface CalculatorLabels {
  title: string;
  model: string;
  selectPlaceholder: string;
  inputTokens: string;
  outputTokens: string;
  selectPrompt: string;
  estimate: string;
}

const DEFAULT_LABELS: CalculatorLabels = {
  title: "价格计算器",
  model: "模型",
  selectPlaceholder: "请选择模型",
  inputTokens: "输入 Tokens",
  outputTokens: "输出 Tokens",
  selectPrompt: "选择模型后计算",
  estimate: "预估费用",
};

export default function PriceCalculator({
  models,
  labels,
}: {
  models: ModelPrice[];
  labels?: Partial<CalculatorLabels>;
}) {
  const L = { ...DEFAULT_LABELS, ...(labels ?? {}) } as CalculatorLabels;
  const [selected, setSelected] = useState("");
  const [inputTokens, setInputTokens] = useState(1000);
  const [outputTokens, setOutputTokens] = useState(500);

  // 同一模型多供应商时 m.name 可能重复，用 模型名__供应商 作为选择键（仅 UI 状态，非拼造编码）
  const keyOf = (m: ModelPrice) => `${m.name}__${m.vendor}`;
  const model = models.find((m) => keyOf(m) === selected);
  const inputPrice = model ? (model.input_price ?? Number(model.cost_input_price ?? 0)) : 0;
  const outputPrice = model ? (model.output_price ?? Number(model.cost_output_price ?? 0)) : 0;
  const cost = (inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice;

  return (
    <div className="calc-card">
      <h3>{L.title}</h3>
      <div className="calc-grid">
        <div className="calc-field">
          <label>{L.model}</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{L.selectPlaceholder}</option>
            {models.map((m) => (
              <option key={keyOf(m)} value={keyOf(m)}>
                {(m.display_name ?? m.name)}（{m.vendor}）{m.model_code ? ` [${m.model_code}]` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="calc-field">
          <label>{L.inputTokens}</label>
          <input
            type="number"
            value={inputTokens}
            min={0}
            onChange={(e) => setInputTokens(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="calc-field" style={{ marginTop: "var(--space-lg)" }}>
        <label>{L.outputTokens}</label>
        <input
          type="number"
          value={outputTokens}
          min={0}
          onChange={(e) => setOutputTokens(Number(e.target.value))}
        />
      </div>
      <div className="calc-result">
        <div className="cr-detail">
          {model ? `${model.display_name ?? model.name}：输入 ¥${inputPrice.toFixed(4)}/1K · 输出 ¥${outputPrice.toFixed(4)}/1K` : L.selectPrompt}
        </div>
        <div className="cr-value">
          {model ? `≈ ¥${cost.toFixed(4)}` : "—"}
        </div>
      </div>
    </div>
  );
}
