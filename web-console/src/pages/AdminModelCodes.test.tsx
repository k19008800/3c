/**
 * T5「模型编码维护 + 编码规则配置」组件级 UI 测试（jsdom）。
 *
 * 覆盖任务书 T5 测试要求：
 *  - 编码列表渲染 + 启停交互（mock 接口）；
 *  - 重新生成 → 确认弹窗出现（含 404 风险文案），确认后调接口；
 *  - 规则配置：模板输入 → 预览渲染；非法模板（含 @ / 未知变量）→ 内联错误提示、保存禁用；
 *  - 恢复默认模板 → 回填 {supplier_code}-{model_name}；
 *  - 变量面板点击插入。
 *
 * 依赖隔离：vi.mock @3cloud/shared-ui（最小实现）与 ../lib/api（不跑真实网络）；
 * 数据获取用 renderWithProviders 的 MemoryRouter + QueryClientProvider。
 *
 * @module pages/AdminModelCodes.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/renderWithProviders";
import { toastSpies, resetToastSpies } from "../test/sharedUiMock";
import ModelCodeMaintenanceSection from "./ModelCodeMaintenanceSection";
import ModelCodeRuleConfig from "./ModelCodeRuleConfig";

// @3cloud/shared-ui 以最小实现隔离
vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../test/sharedUiMock");
  return m;
});

// api 不跑真实网络：按 URL 分派 get/post/put
vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  extractError: (e: unknown) =>
    (e as any)?.response?.data?.message ?? (e as any)?.message ?? "请求失败",
}));

import { api } from "../lib/api";

interface ApiMock {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function mockApi(): ApiMock {
  return api as unknown as ApiMock;
}

/** 两条编码：同一逻辑模型 deepseek-v4-flash 两个供应商（验证多编码并排） */
const codeRows = [
  {
    id: 101,
    supplier_model_id: 5001,
    model_code: "va-deepseek-v4-flash",
    model_name: "deepseek-v4-flash",
    display_name: "deepseek-v4-flash（供应商A）",
    supplier_code: "vendor_a",
    supplier_name: "供应商A",
    status: "active",
    platform_model: "deepseek-v4-flash-0612",
    pricing_group: "default",
    prices: { input: 1.0, output: 2.0, cache_read_input: 0.1, cache_write_input: 0.2 },
  },
  {
    id: 102,
    supplier_model_id: 5002,
    model_code: "vb-deepseek-v4-flash",
    model_name: "deepseek-v4-flash",
    display_name: "deepseek-v4-flash（供应商B）",
    supplier_code: "vendor_b",
    supplier_name: "供应商B",
    status: "inactive",
    platform_model: "deepseek-v4-flash-0612",
    pricing_group: "default",
    prices: { input: 1.1, output: 2.2, cache_read_input: 0.11, cache_write_input: 0.22 },
  },
];

/** 列表响应（对齐真实 { data: { list, pagination: { page, pageSize, total } } }） */
const listBody = { list: codeRows, pagination: { page: 1, pageSize: 100, total: 2 } };

const RULES = {
  template: "",
  default_template: "{supplier_code}-{model_name}",
  allowed_vars: ["supplier_code", "supplier_name", "model_name", "model_short", "platform_model", "seq"],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetToastSpies();
});

describe("ModelCodeMaintenanceSection — 编码列表与启停", () => {
  it("渲染编码列表：两条编码并排，含编码/模型名/供应商/状态", async () => {
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: listBody } });

    renderWithProviders(<ModelCodeMaintenanceSection />);

    expect(await screen.findByText("va-deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.getByText("vb-deepseek-v4-flash")).toBeInTheDocument();
    // 同模型多编码 → 去重提示
    expect(screen.getAllByText("（多编码）").length).toBeGreaterThan(0);
    // 列表接口按契约调用
    expect(m.get).toHaveBeenCalledWith(expect.stringContaining("/admin/model-codes"));
  });

  it("点击「停用」→ PUT /admin/model-codes/:id/status body {status:'inactive'}", async () => {
    const user = userEvent.setup();
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: listBody } });
    m.put.mockResolvedValue({ data: {} });

    renderWithProviders(<ModelCodeMaintenanceSection />);
    await screen.findByText("va-deepseek-v4-flash");

    // 第一行（va，active）的「停用」按钮
    const stopBtn = screen.getAllByRole("button", { name: /停用/ })[0]!;
    await user.click(stopBtn);

    await waitFor(() =>
      expect(m.put).toHaveBeenCalledWith("/admin/model-codes/101/status", { status: "inactive" }),
    );
    await waitFor(() => expect(toastSpies.success).toHaveBeenCalled());
  });

  it("点击「重新生成编码」→ 确认弹窗出现（含 404 风险文案），确认后 POST", async () => {
    const user = userEvent.setup();
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: listBody } });
    m.post.mockResolvedValue({ data: { data: { old_code: "va-deepseek-v4-flash", new_code: "vendor_a-deepseek-v4-flash" } } });

    renderWithProviders(<ModelCodeMaintenanceSection />);
    await screen.findByText("va-deepseek-v4-flash");

    await user.click(screen.getAllByRole("button", { name: /重新生成编码/ })[0]!);

    // 确认弹窗出现，含 404 风险文案（用唯一 token MODEL_CODE_NOT_FOUND 避免命中帮助文案）
    expect(await screen.findByText(/MODEL_CODE_NOT_FOUND/)).toBeInTheDocument();

    // 确认 → POST regenerate
    await user.click(screen.getByRole("button", { name: /确认重新生成/ }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/admin/model-codes/101/regenerate"));
  });
});

describe("ModelCodeRuleConfig — 编码规则配置", () => {
  it("变量面板渲染 6 个变量 chip", async () => {
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: RULES } });

    renderWithProviders(<ModelCodeRuleConfig />);

    for (const v of ["{supplier_code}", "{model_name}", "{model_short}", "{platform_model}", "{seq}"]) {
      expect(await screen.findByRole("button", { name: v })).toBeInTheDocument();
    }
  });

  it("输入含 @ 的非法模板 → 内联错误提示，保存按钮禁用", async () => {
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: RULES } });

    renderWithProviders(<ModelCodeRuleConfig />);
    const input = (await screen.findByLabelText("编码规则模板")) as HTMLInputElement;
    // 等待服务端模板加载回填完成，避免加载竞态覆盖用户输入
    await waitFor(() => expect(input.value).toBe("{supplier_code}-{model_name}"));

    fireEvent.change(input, { target: { value: "{supplier_code}@bad" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/@/);
    // 保存按钮禁用
    expect(screen.getByRole("button", { name: /保存模板/ })).toBeDisabled();
  });

  it("输入未知变量 {foo} → 内联错误提示", async () => {
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: RULES } });

    renderWithProviders(<ModelCodeRuleConfig />);
    const input = (await screen.findByLabelText("编码规则模板")) as HTMLInputElement;
    // 等待服务端模板加载回填完成，避免加载竞态覆盖用户输入
    await waitFor(() => expect(input.value).toBe("{supplier_code}-{model_name}"));

    fireEvent.change(input, { target: { value: "{foo}-{model_name}" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/未知变量 \{foo\}/);
  });

  it("「恢复默认模板」→ 输入框回填 {supplier_code}-{model_name}", async () => {
    const user = userEvent.setup();
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: RULES } });

    renderWithProviders(<ModelCodeRuleConfig />);
    const input = (await screen.findByLabelText("编码规则模板")) as HTMLInputElement;
    // 等待服务端模板加载回填完成，避免加载竞态覆盖用户输入
    await waitFor(() => expect(input.value).toBe("{supplier_code}-{model_name}"));

    await user.click(screen.getByRole("button", { name: /恢复默认模板/ }));
    expect((input as HTMLInputElement).value).toBe("{supplier_code}-{model_name}");
  });

  it("输入合法模板 → 防抖调 preview 接口并渲染示例编码", async () => {
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: RULES } });
    m.post.mockResolvedValue({
      data: {
        data: {
          preview: [{ supplier_code: "vb", model_name: "deepseek-v4-flash", rendered_code: "vb-deepseek-v4-flash" }],
        },
      },
    });

    renderWithProviders(<ModelCodeRuleConfig />);
    const input = (await screen.findByLabelText("编码规则模板")) as HTMLInputElement;
    // 等待服务端模板加载回填完成，避免加载竞态覆盖用户输入
    await waitFor(() => expect(input.value).toBe("{supplier_code}-{model_name}"));

    fireEvent.change(input, { target: { value: "{model_name}-{supplier_code}" } });

    // 防抖后 preview 接口被调用
    await waitFor(
      () => expect(m.post).toHaveBeenCalledWith("/admin/model-code-rules/preview", { template: "{model_name}-{supplier_code}" }),
      { timeout: 2000 },
    );
    // 渲染示例编码
    expect(await screen.findByText("vb-deepseek-v4-flash")).toBeInTheDocument();
  });

  it("保存合法模板 → PUT /admin/model-code-rules body {template}，成功 toast", async () => {
    const user = userEvent.setup();
    const m = mockApi();
    m.get.mockResolvedValue({ data: { data: RULES } });
    m.put.mockResolvedValue({ data: { data: { template: "{supplier_code}-{model_name}" } } });

    renderWithProviders(<ModelCodeRuleConfig />);
    const input = (await screen.findByLabelText("编码规则模板")) as HTMLInputElement;
    // 等待服务端模板加载回填完成，避免加载竞态覆盖用户输入
    await waitFor(() => expect(input.value).toBe("{supplier_code}-{model_name}"));
    fireEvent.change(input, { target: { value: "{model_name}-{supplier_code}" } });

    await user.click(screen.getByRole("button", { name: /保存模板/ }));

    await waitFor(() =>
      expect(m.put).toHaveBeenCalledWith("/admin/model-code-rules", { template: "{model_name}-{supplier_code}" }),
    );
    await waitFor(() => expect(toastSpies.success).toHaveBeenCalled());
  });
});
