/**
 * LogsPage「按模型编码筛选」组件级测试（jsdom）— T3。
 *
 * 覆盖：
 *  - 筛选下拉数据源来自 /me/models（option value=model_code、显示 display_name）；
 *  - 输入编码并搜索 → 请求参数 model=<model_code>；
 *  - 旧数据无编码（upstream_model 为空）→ 展示占位「—」不报错；
 *  - 页面级与按钮级 [?] 帮助存在。
 *
 * @module pages/LogsPage.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/renderWithProviders";
import LogsPage from "./LogsPage";
import type { ModelRow } from "../components/playground/types";

vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../test/sharedUiMock");
  return m;
});

vi.mock("../lib/api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "../lib/api";

const codeRow: ModelRow = {
  model_code: "va-deepseek-v4-flash",
  model_name: "deepseek-v4-flash",
  display_name: "DeepSeek V4 Flash（火山）",
  supplier_code: "va",
  supplier_name: "火山引擎",
  status: "available",
  pricing_group: "g1",
  recommended: false,
  maintenance: false,
  prices: { input_price: "0.001", output_price: "0.002" },
};

interface ApiMock { get: ReturnType<typeof vi.fn>; }
function mockApi(): ApiMock { return api as unknown as ApiMock; }

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LogsPage — 按模型编码筛选", () => {
  it("筛选下拉 option value=model_code，显示 display_name", async () => {
    const m = mockApi();
    m.get.mockImplementation((url: string) => {
      if (url.includes("/me/models")) return Promise.resolve({ data: [codeRow] });
      return Promise.resolve({ data: { list: [] } });
    });

    const { container } = renderWithProviders(<LogsPage />);
    await screen.findByPlaceholderText(/va-deepseek-v4-flash/);
    await waitFor(() => {
      const opt = container.querySelector('option[value="va-deepseek-v4-flash"]');
      expect(opt).toBeTruthy();
      expect(opt?.textContent).toContain("DeepSeek V4 Flash（火山）");
    });
  });

  it("输入编码并搜索 → 请求参数 model=<model_code>", async () => {
    const user = userEvent.setup();
    const m = mockApi();
    m.get.mockImplementation((url: string) => {
      if (url.includes("/me/models")) return Promise.resolve({ data: [codeRow] });
      return Promise.resolve({ data: { list: [] } });
    });

    renderWithProviders(<LogsPage />);
    const input = await screen.findByPlaceholderText(/va-deepseek-v4-flash/);
    await user.type(input, "va-deepseek-v4-flash");
    await user.click(screen.getByRole("button", { name: /^搜索$/ }));

    await waitFor(() => {
      const calls = m.get.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/me/logs"));
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toContain("model=va-deepseek-v4-flash");
    });
  });

  it("旧数据无编码（upstream_model 为空）→ 展示占位「—」不报错", async () => {
    const m = mockApi();
    m.get.mockImplementation((url: string) => {
      if (url.includes("/me/models")) return Promise.resolve({ data: [codeRow] });
      return Promise.resolve({
        data: {
          list: [
            { id: 1, provider: null, upstream_model: null, request_tokens: 10, response_tokens: 5, total_tokens: 15, cost: 1, status: "success", created_at: "2026-09-01T00:00:00Z" },
          ],
        },
      });
    });

    renderWithProviders(<LogsPage />);
    // 旧数据行模型列为占位（同时延迟列也可能为 —，至少一个占位）
    await screen.findByText("成功");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("页面级与按钮级 [?] 帮助存在", async () => {
    const m = mockApi();
    m.get.mockImplementation((url: string) => {
      if (url.includes("/me/models")) return Promise.resolve({ data: [codeRow] });
      return Promise.resolve({ data: { list: [] } });
    });

    renderWithProviders(<LogsPage />);
    // 页面级帮助文案
    await screen.findByText(/按「模型编码」筛选/);
    // 导出按钮旁帮助
    expect(screen.getByText(/按当前「按模型编码」筛选条件导出/)).toBeInTheDocument();
  });
});
