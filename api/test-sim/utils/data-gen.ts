// ============================================================
//  3cloud 仿真测试 — 数据生成工具
// ============================================================

import { CONFIG } from "../config.js";

// ── 随机工具 ──

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randFloat(min: number, max: number, decimals: number = 6): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function weightedPick<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

// ── 身份证号（虚拟算法，仅供测试用） ──

const WEIGHT_FACTORS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CHARS = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

export function generateTestIdNumber(): string {
  // 地区码（虚拟）
  const area = pick(["110101", "310101", "440101", "330101", "510101"]);
  // 出生日期
  const year = randInt(1970, 2000);
  const month = String(randInt(1, 12)).padStart(2, "0");
  const day = String(randInt(1, 28)).padStart(2, "0");
  // 顺序码
  const seq = String(randInt(1, 999)).padStart(3, "0");
  const base = `${area}${year}${month}${day}${seq}`;

  // 校验码
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(base[i]) * WEIGHT_FACTORS[i];
  }
  return base + CHECK_CHARS[sum % 11];
}

export function generateTestCompanyRegNumber(): string {
  const chars = "0123456789ABCDEFGHJKLMNPQRTUWXY";
  let code = "91" + String(randInt(100000, 999999));
  for (let i = 0; i < 6; i++) code += pick(chars);
  return code;
}

// ── 实名数据生成 ──

export function generatePersonalRealName(idx: number) {
  const surnames = ["张", "李", "王", "赵", "刘", "陈", "杨", "黄", "周", "吴"];
  const givenNames = ["伟", "芳", "娜", "秀英", "敏", "静", "丽", "强", "磊", "洋"];
  return {
    realName: `${pick(surnames)}${pick(givenNames)}`,
    idNumber: generateTestIdNumber(),
    idFrontImage: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==",
    idBackImage: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==",
  };
}

export function generateEnterpriseRealName(idx: number) {
  const industries = ["科技", "信息", "数据", "智能", "网络", "数字", "软件"];
  const suffixes = ["有限公司", "有限责任公司", "集团有限公司"];
  const banks = ["中国工商银行", "中国建设银行", "招商银行", "中国银行"];

  return {
    companyName: `${pick(industries)}${pick(industries)}${pick(suffixes)}`,
    companyRegNumber: generateTestCompanyRegNumber(),
    businessLicense: "data:image/jpeg;base64,sim_business_license_" + idx,
    realName: "法人代表" + idx,
    idNumber: generateTestIdNumber(),
    bankName: pick(banks),
    bankAccount: String(randInt(1000000000, 9999999999)),
  };
}

// ── 充值数据 ──

export function pickRechargeAmount(userType: "personal" | "enterprise"): number {
  if (userType === "enterprise") {
    return pick([500, 1000, 2000, 5000, 10000, 50000]);
  }
  return pick([50, 100, 200, 500, 1000]);
}

// ── Token 调用数据 ──

export interface CallLogInput {
  userId: number;
  apiKey: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  status: "success" | "failed" | "timeout" | "cancelled";
}

const MODEL_NAMES = Object.keys(CONFIG.modelPricing);

export function generateSingleCall(userId: number, apiKey: string): CallLogInput {
  const modelName = pick(MODEL_NAMES);
  const promptTokens = randInt(100, 8000);
  const completionTokens = randInt(50, 4000);
  const totalTokens = promptTokens + completionTokens;
  const status = weightedPick<"success" | "failed" | "timeout" | "cancelled">([
    { value: "success", weight: 88 },
    { value: "failed", weight: 6 },
    { value: "timeout", weight: 4 },
    { value: "cancelled", weight: 2 },
  ]);

  return { userId, apiKey, modelName, promptTokens, completionTokens, totalTokens, status };
}

export function generateCallBatch(
  count: number,
  userKeys: Array<{ userId: number; apiKey: string }>,
): CallLogInput[] {
  const batch: CallLogInput[] = [];
  for (let i = 0; i < count; i++) {
    const uk = pick(userKeys);
    batch.push(generateSingleCall(uk.userId, uk.apiKey));
  }
  return batch;
}

// ── 报告计时器 ──

export class Timer {
  private start = Date.now();

  reset() { this.start = Date.now(); }

  elapsed(): string {
    const ms = Date.now() - this.start;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
