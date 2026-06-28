// ============================================================
//  3cloud (3C) — 阿里云身份核验供应商
//  通过阿里云市场 API 完成二要素/四要素核验
//  文档: https://market.aliyun.com/products/57000002/cmapi00040238.html
// ============================================================

import type { IdVerifyProvider, PersonalVerifyParams, EnterpriseVerifyParams, VerifyResult } from "./provider.js";
import { registerProvider } from "./provider.js";

export class AliyunIdVerifyProvider implements IdVerifyProvider {
  readonly name = "aliyun";
  private appCode: string;

  /**
   * 阿里云身份核验 API 接口
   *
   * 阿里云市场有多个供应商提供实名 API，常见接口地址：
   * - 官方身份证二要素: https://yhk.market.alicloudapi.com/communicate/identity
   * - 企业四要素: https://yhk.market.alicloudapi.com/ai_company/companyVerify
   *
   * 实际部署时请在阿里云市场购买后替换为真实 URL 和参数格式。
   * 配置方式:
   *   system_configs:
   *     aliyun_identity_api_url   → 身份证二要素接口地址
   *     aliyun_enterprise_api_url → 企业四要素接口地址
   *     aliyun_id_verify_app_code → 阿里云市场 AppCode
   */

  private readonly IDENTITY_API = "https://yhk.market.alicloudapi.com/communicate/identity";
  private readonly ENTERPRISE_API = "https://yhk.market.alicloudapi.com/ai_company/companyVerify";

  constructor(appCode: string) {
    this.appCode = appCode;
  }

  async verifyPersonal({ realName, idNumber }: PersonalVerifyParams): Promise<VerifyResult> {
    const url = process.env.ALIYUN_IDENTITY_API_URL || this.IDENTITY_API;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `APPCODE ${this.appCode}`,
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
    const url = process.env.ALIYUN_ENTERPRISE_API_URL || this.ENTERPRISE_API;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `APPCODE ${this.appCode}`,
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
