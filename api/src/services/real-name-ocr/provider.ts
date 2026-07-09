// ============================================================
//  3cloud (3C) — OCR 证件识别供应商接口
//  抽象接口 + 工厂模式，可扩展多个 OCR 供应商
// ============================================================

// ──────────────────────────────────────────────
//  类型定义
// ──────────────────────────────────────────────

export interface IdCardOcrResult {
  type: 'id_card';
  name?: string;
  idNumber?: string;
  gender?: string;
  nationality?: string;
  birthDate?: string;
  address?: string;
  issuedBy?: string;
  validDate?: string;
  confidence: number;
  rawResult?: Record<string, any>;
}

export interface BusinessLicenseOcrResult {
  type: 'business_license';
  companyName?: string;
  regNumber?: string;
  legalPerson?: string;
  registeredCapital?: string;
  establishedDate?: string;
  validPeriod?: string;
  address?: string;
  businessScope?: string;
  confidence: number;
  rawResult?: Record<string, any>;
}

export type OcrResult = IdCardOcrResult | BusinessLicenseOcrResult;

export interface OcrProvider {
  readonly name: string;
  /**
   * 识别证件图片
   * @param imageBase64 图片 base64 数据（不含 data: URI 前缀）
   * @param fileType    证件类型 id_front | id_back | business_license
   */
  recognize(imageBase64: string, fileType: string): Promise<OcrResult>;
}

// ──────────────────────────────────────────────
//  注册表
// ──────────────────────────────────────────────

type ProviderConstructor = new () => OcrProvider;

const registry: Record<string, ProviderConstructor> = {};

export function registerOcrProvider(name: string, ctor: ProviderConstructor): void {
  registry[name] = ctor;
}

// ──────────────────────────────────────────────
//  工厂
// ──────────────────────────────────────────────

export class OcrProviderFactory {
  static create(providerName: string): OcrProvider {
    const Ctor = registry[providerName];
    if (!Ctor) {
      throw new Error(`[OcrFactory] 未知 OCR 供应商: "${providerName}"`);
    }
    return new Ctor();
  }

  static getAvailableProviders(): string[] {
    return Object.keys(registry);
  }
}
