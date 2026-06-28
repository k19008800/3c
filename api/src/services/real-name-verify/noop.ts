// ============================================================
//  3cloud (3C) — 空核验供应商
//  当自动核验关闭时使用，始终返回未通过 = 走人工审核
// ============================================================

import type { IdVerifyProvider, PersonalVerifyParams, EnterpriseVerifyParams, VerifyResult } from "./provider.js";
import { registerProvider } from "./provider.js";

export class NoOpProvider implements IdVerifyProvider {
  readonly name = "none";

  constructor(_appCode?: string) {
    // 空实现，不需要 appCode
  }

  async verifyPersonal(_params: PersonalVerifyParams): Promise<VerifyResult> {
    return {
      passed: false,
      rawResponse: { provider: "none", message: "自动核验未启用" },
    };
  }

  async verifyEnterprise(_params: EnterpriseVerifyParams): Promise<VerifyResult> {
    return {
      passed: false,
      rawResponse: { provider: "none", message: "自动核验未启用" },
    };
  }
}

// ── 注册到工厂 ──
registerProvider("none", NoOpProvider as any);
