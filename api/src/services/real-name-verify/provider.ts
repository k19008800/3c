// ============================================================
//  3cloud (3C) — 实名认证核验供应商接口
//  抽象接口 + 工厂模式，可扩展多个供应商
// ============================================================

import { AppError } from "../auth-service.js";
import type { AliyunIdVerifyProvider } from "./aliyun.js";
import type { NoOpProvider } from "./noop.js";

// ──────────────────────────────────────────────
//  接口定义
// ──────────────────────────────────────────────

export interface PersonalVerifyParams {
  realName: string;
  idNumber: string;
}

export interface EnterpriseVerifyParams extends PersonalVerifyParams {
  companyName: string;
  companyRegNumber: string;
}

export interface VerifyResult {
  /** 是否通过 */
  passed: boolean;
  /** 供应商原始响应 */
  rawResponse: Record<string, any>;
}

export interface IdVerifyProvider {
  /** 供应商名称标识 */
  readonly name: string;
  /** 个人二要素核验：姓名 + 身份证号 */
  verifyPersonal(params: PersonalVerifyParams): Promise<VerifyResult>;
  /** 企业四要素核验（含法人信息） */
  verifyEnterprise(params: EnterpriseVerifyParams): Promise<VerifyResult>;
}

// ──────────────────────────────────────────────
//  供应商注册表
// ──────────────────────────────────────────────

type ProviderConstructor = new (appCode: string) => IdVerifyProvider;

const providerRegistry: Record<string, ProviderConstructor> = {};

export function registerProvider(name: string, ctor: ProviderConstructor): void {
  providerRegistry[name] = ctor;
}

// ──────────────────────────────────────────────
//  工厂
// ──────────────────────────────────────────────

export class VerifyProviderFactory {
  static create(providerName: string, appCode: string): IdVerifyProvider {
    const Ctor = providerRegistry[providerName];
    if (!Ctor) {
      console.warn(`[VerifyProviderFactory] 未知供应商 "${providerName}"，使用空实现`);
      const { NoOpProvider } = require("./noop.js") as typeof import("./noop.js");
      return new NoOpProvider();
    }
    return new Ctor(appCode);
  }

  /** 获取所有已注册供应商名称 */
  static getAvailableProviders(): string[] {
    return Object.keys(providerRegistry);
  }
}
