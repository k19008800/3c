// ============================================================
//  3cloud (3C) — 阿里云身份核验供应商
//  通过阿里云市场 API 完成二要素/四要素核验
//  文档: https://market.aliyun.com/products/57000002/cmapi00040238.html
// ============================================================

import type { IdVerifyProvider, PersonalVerifyParams, EnterpriseVerifyParams, VerifyResult } from "./provider.js";
import { registerProvider } from "./provider.js";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export class AliyunIdVerifyProvider implements IdVerifyProvider {
  readonly name = "aliyun";
  private appCode: string;

  /**
   * 阿里云身份核验 API 接口
   *
   * API 地址通过 system_configs 动态配置，无需硬编码或环境变量。
   * 配置 keys:
   *   aliyun_id_verify_api_url   → 身份证二要素接口地址
   *   aliyun_enterprise_api_url  → 企业四要素接口地址
   *   aliyun_id_verify_app_code  → 阿里云市场 AppCode
   *
   * 默认回退地址（阿里云市场通用格式）：
   */

  private readonly DEFAULT_IDENTITY_API = "https://yhk.market.alicloudapi.com/communicate/identity";
  private readonly DEFAULT_ENTERPRISE_API = "https://yhk.market.alicloudapi.com/ai_company/companyVerify";

  constructor(appCode: string) {
    this.appCode = appCode;
  }

  /**
   * 从 system_configs 表加载配置，支持动态更新
   */
  private async loadConfigs(): Promise<Record<string, string>> {
    const db = getDb();
    const keys = [
      "aliyun_id_verify_api_url",
      "aliyun_enterprise_api_url",
      "aliyun_id_verify_app_code",
    ];
    const { inArray } = await import("drizzle-orm");
    const rows = await db
      .select({ key: systemConfigs.key, value: systemConfigs.value })
      .from(systemConfigs)
      .where(inArray(systemConfigs.key, keys));

    const map: Record<string, string> = {
      aliyun_id_verify_api_url: this.DEFAULT_IDENTITY_API,
      aliyun_enterprise_api_url: this.DEFAULT_ENTERPRISE_API,
    };

    for (const row of rows) {
      map[row.key] = row.value;
    }

    return map;
  }

  async verifyPersonal({ realName, idNumber }: PersonalVerifyParams): Promise<VerifyResult> {
    const configs = await this.loadConfigs();
    const url = configs["aliyun_id_verify_api_url"] || this.DEFAULT_IDENTITY_API;
    const appCode = configs["aliyun_id_verify_app_code"] || this.appCode;

    if (!appCode) {
      return {
        passed: false,
        rawResponse: { error: "未配置 aliyun_id_verify_app_code", provider: "aliyun" },
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `APPCODE ${appCode}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({ name: realName, idCard: idNumber }),
      });

      const data = await response.json() as Record<string, any>;

      // 阿里云市场标准响应格式：
      // { respCode: "0000", respMsg: "成功", ... }
      // respCode 含义: 0000=一致, 0001=不一致, 0002=库无记录, 0003=参数异常
      const respCode = String(data.respCode || data.code || "");
      const passed = respCode === "0000";

      return {
        passed,
        rawResponse: data,
      };
    } catch (err) {
      return {
        passed: false,
        rawResponse: { error: String(err), provider: "aliyun" },
      };
    }
  }

  async verifyEnterprise({ realName, idNumber, companyName, companyRegNumber }: EnterpriseVerifyParams): Promise<VerifyResult> {
    const configs = await this.loadConfigs();
    const url = configs["aliyun_enterprise_api_url"] || this.DEFAULT_ENTERPRISE_API;
    const appCode = configs["aliyun_id_verify_app_code"] || this.appCode;

    if (!appCode) {
      return {
        passed: false,
        rawResponse: { error: "未配置 aliyun_id_verify_app_code", provider: "aliyun" },
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `APPCODE ${appCode}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({
          name: realName,
          idCard: idNumber,
          companyName,
          regNumber: companyRegNumber,
        }),
      });

      const data = await response.json() as Record<string, any>;

      // 企业核验响应格式类似
      const respCode = String(data.respCode || data.code || "");
      const passed = respCode === "0000";

      return {
        passed,
        rawResponse: data,
      };
    } catch (err) {
      return {
        passed: false,
        rawResponse: { error: String(err), provider: "aliyun" },
      };
    }
  }
}

// ── 注册到工厂 ──
registerProvider("aliyun", AliyunIdVerifyProvider);
