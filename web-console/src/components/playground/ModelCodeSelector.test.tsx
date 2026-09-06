/**
 * ModelCodeSelector 组件级 UI 测试（jsdom）— T2 默认编码偏好 UI。
 *
 * 覆盖：
 *  - 编码列表渲染：datalist option value=model_code、显示 display_name；
 *  - 设为默认：PUT /me/preferences/default-code 请求体 {model_name, model_code} + 成功提示；
 *  - 读取回填：进入页面（value 空）且存在可用默认编码 → 自动回填；
 *  - 清除默认：DELETE ?model_name=；
 *  - 默认编码下线：保存的 model_code 不在列表 → 提示 + 可选编码清单；
 *  - 无 /me/models 编码数据 → 空态不崩溃。
 *
 * @module components/playground/ModelCodeSelector.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderWithProviders";
import { toastSpies, resetToastSpies } from "../../test/sharedUiMock";
import { ModelCodeSelector } from "./ModelCodeSelector";
import type { ModelRow } from "./types";

vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../../test/sharedUiMock");
  return m;
});

vi.mock("../../lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../lib/api";

/** 构造一条模型编码行 */
function row(partial: Partial<ModelRow> & { model_code: string; model_name: string }): ModelRow {
  return {
    model_code: partial.model_code,
    model_name: partial.model_name,
    display_name: partial.display_name ?? `${partial.model_name}（供应商）`,
    supplier_code: partial.supplier_code ?? "va",
    supplier_name: partial.supplier_name ?? "火山引擎",
    context: 128000,
    status: partial.status ?? "available",
    pricing_group: partial.pricing_group ?? "g1",
    health: partial.health ?? "good",
    latency_ms: partial.latency_ms ?? 42,
    recommended: partial.recommended ?? false,
    maintenance: partial.maintenance ?? false,
    prices: {
      input_price: "0.001",
      output_price: "0.002",
      ...(partial.prices ?? {}),
    },
  };
}

const vaRow = row({
  model_code: "va-deepseek-v4-flash",
  model_name: "deepseek-v4-flash",
  display_name: "DeepSeek V4 Flash（火山）",
  supplier_code: "va",
  supplier_name: "火山引擎",
});
const vbRow = row({
  model_code: "vb-deepseek-v4-flash",
  model_name: "deepseek-v4-flash",
  display_name: "DeepSeek V4 Flash（阿里云）",
  supplier_code: "vb",
  supplier_name: "阿里云",
});

interface ApiMock {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
function mockApi(): ApiMock {
  return api as unknown as ApiMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetToastSpies();
});

describe("ModelCodeSelector — 编码列表渲染", () => {
  it("datalist option value=model_code，显示 display_name", () => {
    const { container } = renderWithProviders(
      <ModelCodeSelector models={[vaRow, vbRow]} value="" onChange={() => {}} />,
    );
    // datalist option：value=model_code，文本=display_name
    const optA = container.querySelector('option[value="va-deepseek-v4-flash"]');
    expect(optA).toBeTruthy();
    expect(optA?.textContent).toContain("DeepSeek V4 Flash（火山）");
    const optB = container.querySelector('option[value="vb-deepseek-v4-flash"]');
    expect(optB).toBeTruthy();
    expect(optB?.textContent).toContain("DeepSeek V4 Flash（阿里云）");
  });

  it("无编码行（DB 空回退旧结构）→ 空态不崩溃", () => {
    renderWithProviders(
      // 旧结构无 model_code，应被过滤
      <ModelCodeSelector models={[{ id: 1, name: "x", provider: "p", inputPrice: 1 } as unknown as ModelRow]} value="" onChange={() => {}} />,
    );
    // 输入框仍在，不抛错
    expect(screen.getByPlaceholderText(/va-deepseek-v4-flash/)).toBeInTheDocument();
  });
});

describe("ModelCodeSelector — 默认编码偏好", () => {
  it("选中文本编码后「设为默认」→ PUT 请求体 {model_name, model_code} + 成功提示", async () => {
    const user = userEvent.setup();
    const m = mockApi();
    m.get.mockResolvedValue({ data: { model_name: "deepseek-v4-flash", model_code: null } });
    m.put.mockResolvedValue({ data: { model_name: "deepseek-v4-flash", model_code: "va-deepseek-v4-flash" } });

    renderWithProviders(
      <ModelCodeSelector models={[vaRow, vbRow]} value="va-deepseek-v4-flash" onChange={() => {}} />,
    );

    await user.click(screen.getByRole("button", { name: /设为默认/ }));
    await waitFor(() =>
      expect(m.put).toHaveBeenCalledWith("/me/preferences/default-code", {
        model_name: "deepseek-v4-flash",
        model_code: "va-deepseek-v4-flash",
      }),
    );
    await waitFor(() => expect(toastSpies.success).toHaveBeenCalled());
  });

  it("进入页面（value 空）存在可用默认编码 → 自动回填 saved code", async () => {
    const onChange = vi.fn();
    const m = mockApi();
    m.get.mockResolvedValue({ data: { model_name: "deepseek-v4-flash", model_code: "vb-deepseek-v4-flash" } });

    renderWithProviders(
      <ModelCodeSelector models={[vaRow, vbRow]} value="" onChange={onChange} />,
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("vb-deepseek-v4-flash"));
  });

  it("「清除默认」→ DELETE ?model_name=", async () => {
    const user = userEvent.setup();
    const m = mockApi();
    // 已保存默认编码（可用），使清除按钮可用
    m.get.mockResolvedValue({ data: { model_name: "deepseek-v4-flash", model_code: "va-deepseek-v4-flash" } });
    m.delete.mockResolvedValue({ data: {} });

    renderWithProviders(
      <ModelCodeSelector models={[vaRow, vbRow]} value="va-deepseek-v4-flash" onChange={() => {}} />,
    );

    await waitFor(() => expect(m.get).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /清除默认/ }));
    await waitFor(() =>
      expect(m.delete).toHaveBeenCalledWith(expect.stringContaining("/me/preferences/default-code?model_name=")),
    );
  });

  it("默认编码已下线（saved 不在列表）→ 提示并展示可选编码清单，不自动回退", async () => {
    const onChange = vi.fn();
    const m = mockApi();
    // saved code 已下线，不在 models 中
    m.get.mockResolvedValue({ data: { model_name: "deepseek-v4-flash", model_code: "offline-code" } });

    renderWithProviders(
      <ModelCodeSelector models={[vaRow, vbRow]} value="" onChange={onChange} />,
    );

    await screen.findByText(/已不可用/);
    // 展示同模型可用编码清单（datalist option 与警告按钮均含该文本）
    expect(screen.getAllByText(/DeepSeek V4 Flash（火山）/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DeepSeek V4 Flash（阿里云）/).length).toBeGreaterThan(0);
    // 不自动回退到任一编码
    expect(onChange).not.toHaveBeenCalled();
  });
});
