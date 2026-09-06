/**
 * Playground 各 Tab 请求体 model = 所选模型编码 — 组件级测试（jsdom）。
 *
 * 抽样 Chat / Completions / Messages 三个 Tab（任务书 T2 验收）：
 * 以 props.model（model_code）渲染，点击发送后断言 fetch 请求体 body.model === 该编码，
 * 且不发生任何名称→编码映射。
 *
 * @module components/playground/playgroundRequestCode.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderWithProviders";
import { ChatTab } from "./ChatTab";
import { CompletionsTab } from "./CompletionsTab";
import { MessagesTab } from "./MessagesTab";
import type { PlaygroundTabProps } from "./types";

vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../../test/sharedUiMock");
  return m;
});

const MODEL_CODE = "va-deepseek-v4-flash";

function baseProps(): PlaygroundTabProps {
  return {
    keys: [{ id: 1, name: "k", keyPrefix: "sk-***", status: "active" }],
    selectedKeyId: 1,
    fullKey: "sk-test-full-key",
    onSelectedKeyId: vi.fn(),
    onFullKey: vi.fn(),
    models: [],
    model: MODEL_CODE,
    onModelChange: vi.fn(),
  };
}

/** 从 fetch mock 调用中解析请求体 */
function lastFetchBody(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, opts] = mock.mock.calls[mock.mock.calls.length - 1]!;
  return JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
}

describe("Playground Tab 请求体 model = model_code", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Chat：请求体 model = 所选编码", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatTab {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: /发送.*请求/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastFetchBody(fetchMock).model).toBe(MODEL_CODE);
  });

  it("Completions：请求体 model = 所选编码", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompletionsTab {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: /发送.*请求/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastFetchBody(fetchMock).model).toBe(MODEL_CODE);
  });

  it("Messages：请求体 model = 所选编码", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesTab {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: /发送.*请求/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastFetchBody(fetchMock).model).toBe(MODEL_CODE);
  });
});
