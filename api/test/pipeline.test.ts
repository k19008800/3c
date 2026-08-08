/**
 * Pipeline 执行器测试（§1.1）
 * 覆盖：正常全成功 / 失败回滚 / noRollbackOn / 回滚抛异常 / 空 steps
 */
import { describe, it, expect } from "vitest";
import { runPipeline } from "../src/services/pipeline/executor";
import type { PipelineContext, PipelineStep } from "../src/services/pipeline/types";

interface TestCtx extends PipelineContext {
  log: string[];
}

describe("Pipeline 执行器（§1.1）", () => {
  it("3 个 step 顺序执行，全部成功", async () => {
    const ctx: TestCtx = { log: [] };
    const steps: PipelineStep<TestCtx>[] = [
      { name: "auth", execute: async (c) => { c.log.push("auth:ok"); } },
      { name: "route", execute: async (c) => { c.log.push("route:ok"); } },
      { name: "proxy", execute: async (c) => { c.log.push("proxy:ok"); } },
    ];

    const result = await runPipeline(ctx, steps);
    expect(result.ok).toBe(true);
    expect(ctx.log).toEqual(["auth:ok", "route:ok", "proxy:ok"]);
  });

  it("第 2 个 step 失败 → 第 1 个 step 的 rollback 被调用", async () => {
    const ctx: TestCtx = { log: [] };
    const steps: PipelineStep<TestCtx>[] = [
      {
        name: "reserve",
        execute: async (c) => { c.log.push("reserve:ok"); },
        rollback: async (c) => { c.log.push("reserve:rollback"); },
      },
      {
        name: "forward",
        execute: async () => { throw new Error("上游超时"); },
      },
      {
        name: "settle",
        execute: async (c) => { c.log.push("settle:ok"); },
      },
    ];

    const result = await runPipeline(ctx, steps);
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("forward");
    expect(result.error?.message).toBe("上游超时");
    expect(ctx.log).toEqual(["reserve:ok", "reserve:rollback"]);
    // settle 不应执行
    expect(ctx.log).not.toContain("settle:ok");
  });

  it("noRollbackOn 标记的 step 失败 → 不触发回滚", async () => {
    const ctx: TestCtx = { log: [] };
    const steps: PipelineStep<TestCtx>[] = [
      {
        name: "reserve",
        execute: async (c) => { c.log.push("reserve:ok"); },
        rollback: async (c) => { c.log.push("reserve:rollback"); },
      },
      {
        name: "validate",
        execute: async () => { throw new Error("参数非法"); },
        noRollbackOn: true,
      },
    ];

    const result = await runPipeline(ctx, steps);
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("validate");
    // 不回滚 reserve
    expect(ctx.log).toEqual(["reserve:ok"]);
    expect(ctx.log).not.toContain("reserve:rollback");
  });

  it("回滚中某个 step 的 rollback 抛异常 → 不吞原始错误", async () => {
    const ctx: TestCtx = { log: [] };
    const steps: PipelineStep<TestCtx>[] = [
      {
        name: "step1",
        execute: async (c) => { c.log.push("step1:ok"); },
        rollback: async () => { throw new Error("回滚失败"); },
      },
      {
        name: "step2",
        execute: async (c) => { c.log.push("step2:ok"); },
        rollback: async (c) => { c.log.push("step2:rollback"); },
      },
      {
        name: "step3",
        execute: async () => { throw new Error("原始错误"); },
      },
    ];

    const result = await runPipeline(ctx, steps);
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("step3");
    // 原始错误保留
    expect(result.error?.message).toBe("原始错误");
    // 回滚异常被捕获到 rollbackErrors
    expect(result.rollbackErrors).toBeDefined();
    expect(result.rollbackErrors!.length).toBe(1);
    expect(result.rollbackErrors![0]!.message).toBe("回滚失败");
    // step2 rollback 正常执行
    expect(ctx.log).toContain("step2:rollback");
  });

  it("空 steps 数组 → 直接返回 ok", async () => {
    const ctx: TestCtx = { log: [] };
    const result = await runPipeline(ctx, []);
    expect(result.ok).toBe(true);
  });
});
