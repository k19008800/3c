// ============================================================
//  3cloud (3C) — Service 层单元测试
//  加密 / 权限位运算 / 计费公式 / 不变性断言
//  不依赖 DB 或 Redis — 纯逻辑测试
// ============================================================

import { describe, it, expect } from "vitest";
import { encryptApiKey, decryptApiKey } from "../services/encryption.js";

// ====================================================================
//  1. AES-256-GCM 加密/解密
// ====================================================================

describe("encryptApiKey / decryptApiKey", () => {
  it("加密后解密应还原明文", () => {
    const plaintext = "sk-test-api-key-abcdef123456";
    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("每次加密结果不同（随机 IV）", () => {
    const plaintext = "sk-same-key";
    const a = encryptApiKey(plaintext);
    const b = encryptApiKey(plaintext);
    expect(a).not.toBe(b);
    // 但都能解密回去
    expect(decryptApiKey(a)).toBe(plaintext);
    expect(decryptApiKey(b)).toBe(plaintext);
  });

  it("加密格式: base64(iv):base64(authTag):base64(ciphertext)", () => {
    const encrypted = encryptApiKey("test-key");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // 每段都应是有效 base64
    for (const p of parts) {
      expect(() => Buffer.from(p, "base64").toString("binary")).not.toThrow();
    }
  });

  it("篡改密文 → 解密失败 (authTag 验证)", () => {
    const encrypted = encryptApiKey("sensitive-key");
    const parts = encrypted.split(":");
    // 篡改密文中段而非末位（base64 尾字符变动可能不触发解码失败）
    const tamperedBytes = Buffer.from(parts[2], "base64");
    if (tamperedBytes.length > 0) {
      tamperedBytes[Math.floor(tamperedBytes.length / 2)] ^= 0xFF;
    }
    const tampered = tamperedBytes.toString("base64");
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tampered}`;
    expect(() => decryptApiKey(tamperedPayload)).toThrow();
  });

  it("非 3 段格式 → 抛错", () => {
    expect(() => decryptApiKey("badformat")).toThrow("加密数据格式错误");
    expect(() => decryptApiKey("a:b")).toThrow("加密数据格式错误");
    expect(() => decryptApiKey("a:b:c:d")).toThrow("加密数据格式错误");
  });

  it("空字符串加密解密", () => {
    const encrypted = encryptApiKey("");
    expect(encrypted).toBeTruthy();
    expect(decryptApiKey(encrypted)).toBe("");
  });

  it("长密钥 (512 字符) 加密解密", () => {
    const longKey = "sk-" + "x".repeat(508);
    const encrypted = encryptApiKey(longKey);
    expect(decryptApiKey(encrypted)).toBe(longKey);
  });

  it("Unicode 密钥加密解密", () => {
    const unicodeKey = "sk-测试密钥-日本語-한국어";
    const encrypted = encryptApiKey(unicodeKey);
    expect(decryptApiKey(encrypted)).toBe(unicodeKey);
  });
});

// ====================================================================
//  2. 权限位运算（权限引擎核心逻辑）
//     模拟 permission-engine.ts 中的 bitset 运算
// ====================================================================

// 模拟 RBAC 权限位定义（与 middleware/auth.ts 中 ROLE_PERMISSIONS 对齐）
const Perm = {
  USER_MANAGE: 1n << 0n,
  AGENT_MANAGE: 1n << 1n,
  VENDOR_MANAGE: 1n << 2n,
  MODEL_MANAGE: 1n << 12n,
  FINANCE_VIEW: 1n << 3n,
  FINANCE_MANAGE: 1n << 4n,
  SECURITY_VIEW: 1n << 5n,
  SECURITY_MANAGE: 1n << 6n,
  CONFIG_VIEW: 1n << 17n,
  CONFIG_MANAGE: 1n << 7n,
  AUDIT_VIEW: 1n << 8n,
  RATE_LIMIT_MANAGE: 1n << 9n,
  CAMPAIGN_MANAGE: 1n << 10n,
  QUOTA_MANAGE: 1n << 11n,
} as const;

// 默认角色权限
const ROLE_PERMISSIONS: Record<string, bigint> = {
  super_admin:
    Perm.USER_MANAGE | Perm.AGENT_MANAGE | Perm.VENDOR_MANAGE | Perm.MODEL_MANAGE |
    Perm.FINANCE_VIEW | Perm.FINANCE_MANAGE | Perm.SECURITY_VIEW | Perm.SECURITY_MANAGE |
    Perm.CONFIG_VIEW | Perm.CONFIG_MANAGE | Perm.AUDIT_VIEW | Perm.RATE_LIMIT_MANAGE |
    Perm.CAMPAIGN_MANAGE | Perm.QUOTA_MANAGE,
  admin:
    Perm.USER_MANAGE | Perm.AGENT_MANAGE | Perm.VENDOR_MANAGE | Perm.MODEL_MANAGE |
    Perm.FINANCE_VIEW | Perm.FINANCE_MANAGE | Perm.SECURITY_VIEW |
    Perm.CONFIG_VIEW | Perm.AUDIT_VIEW | Perm.RATE_LIMIT_MANAGE |
    Perm.CAMPAIGN_MANAGE | Perm.QUOTA_MANAGE,
  operator:
    Perm.VENDOR_MANAGE | Perm.MODEL_MANAGE | Perm.FINANCE_VIEW |
    Perm.SECURITY_VIEW | Perm.CONFIG_VIEW | Perm.AUDIT_VIEW,
  finance:
    Perm.FINANCE_VIEW | Perm.FINANCE_MANAGE | Perm.AUDIT_VIEW | Perm.CONFIG_VIEW,
  security:
    Perm.SECURITY_VIEW | Perm.SECURITY_MANAGE | Perm.AUDIT_VIEW | Perm.CONFIG_VIEW,
  user: 0n,
};

describe("Permission Engine — bitset operations", () => {
  it("super_admin 拥有所有权限", () => {
    const perms = ROLE_PERMISSIONS.super_admin;
    for (const [name, bit] of Object.entries(Perm)) {
      expect(perms & bit).toBe(bit);
    }
  });

  it("user 没有任何权限", () => {
    expect(ROLE_PERMISSIONS.user).toBe(0n);
  });

  it("admin 有 USER_MANAGE 但没有 SECURITY_MANAGE", () => {
    const perms = ROLE_PERMISSIONS.admin;
    expect(perms & Perm.USER_MANAGE).toBe(Perm.USER_MANAGE);
    expect(perms & Perm.SECURITY_MANAGE).toBe(0n);
  });

  it("operator 有 MODEL_MANAGE 但没有 FINANCE_MANAGE", () => {
    const perms = ROLE_PERMISSIONS.operator;
    expect(perms & Perm.MODEL_MANAGE).toBe(Perm.MODEL_MANAGE);
    expect(perms & Perm.FINANCE_MANAGE).toBe(0n);
  });

  it("finance 有 FINANCE_VIEW + FINANCE_MANAGE 但没有 USER_MANAGE", () => {
    const perms = ROLE_PERMISSIONS.finance;
    expect(perms & Perm.FINANCE_VIEW).toBe(Perm.FINANCE_VIEW);
    expect(perms & Perm.FINANCE_MANAGE).toBe(Perm.FINANCE_MANAGE);
    expect(perms & Perm.USER_MANAGE).toBe(0n);
  });

  it("hasPermission 检查多权限必须同时满足", () => {
    const perms = ROLE_PERMISSIONS.admin;
    const required = Perm.USER_MANAGE | Perm.FINANCE_VIEW;
    expect((perms & required) === required).toBe(true);

    const requireSecurityManage = Perm.USER_MANAGE | Perm.SECURITY_MANAGE;
    expect((perms & requireSecurityManage) === requireSecurityManage).toBe(false);
  });

  it("覆盖 grant/deny 逻辑: grant 新增, deny 移除", () => {
    const base = ROLE_PERMISSIONS.operator; // 有 MODEL_MANAGE
    const grantExtra = Perm.FINANCE_MANAGE;
    const denyExtra = Perm.MODEL_MANAGE;

    const final = (base | grantExtra) & ~denyExtra;
    expect(final & Perm.MODEL_MANAGE).toBe(0n);
    expect(final & Perm.FINANCE_MANAGE).toBe(Perm.FINANCE_MANAGE);
    expect(final & Perm.VENDOR_MANAGE).toBe(Perm.VENDOR_MANAGE); // 不变的还在
  });

  it("权限反转: deny 全部 grant=none → 所有权限归零", () => {
    const base = ROLE_PERMISSIONS.super_admin;
    const grant = 0n;
    const deny = base;
    expect((base | grant) & ~deny).toBe(0n);
  });
});

// ====================================================================
//  3. 计费公式精度测试
//     公式: (prompt_tokens × sellPriceInput + completion_tokens × sellPriceOutput)
//           × pricingMultiplier × discountRate
//     精度: DECIMAL(18,6)，截断不四舍五入
// ====================================================================

function calculateCost(
  promptTokens: number,
  completionTokens: number,
  sellPriceInput: string | number,
  sellPriceOutput: string | number,
  pricingMultiplier = 1,
  discountRate = 1,
): string {
  const pi = typeof sellPriceInput === "string" ? Number(sellPriceInput) : sellPriceInput;
  const po = typeof sellPriceOutput === "string" ? Number(sellPriceOutput) : sellPriceOutput;

  const raw = (promptTokens * pi + completionTokens * po) * pricingMultiplier * discountRate;

  // DECIMAL(18,6) — truncate, don't round
  return (Math.floor(raw * 1_000_000) / 1_000_000).toFixed(6);
}

describe("Billing — cost calculation", () => {
  it("基础计算: 100 prompt + 50 completion", () => {
    const cost = calculateCost(100, 50, 0.01, 0.05);
    // (100*0.01 + 50*0.05) * 1 * 1 = 1.0 + 2.5 = 3.5
    expect(cost).toBe("3.500000");
  });

  it("零 token = 零费用", () => {
    expect(calculateCost(0, 0, 0.01, 0.05)).toBe("0.000000");
    expect(calculateCost(10, 0, 0.01, 0.05)).toBe("0.100000");
    expect(calculateCost(0, 10, 0.01, 0.05)).toBe("0.500000");
  });

  it("倍率 1.5: 价格上浮 50%", () => {
    const base = calculateCost(100, 0, 0.01, 0, 1);
    const scaled = calculateCost(100, 0, 0.01, 0, 1.5);
    expect(Number(scaled)).toBeCloseTo(Number(base) * 1.5, 6);
  });

  it("折扣 0.8: 价格打 8 折", () => {
    const base = calculateCost(100, 100, 0.01, 0.05, 1);
    const discounted = calculateCost(100, 100, 0.01, 0.05, 1, 0.8);
    expect(Number(discounted)).toBeCloseTo(Number(base) * 0.8, 6);
  });

  it("精度验证: 6 位小数截断（非四舍五入）", () => {
    // 0.000001234567 * 1 = 0.000001 (truncated, not rounded to 0.000002)
    const cost = calculateCost(1, 0, 0.000001234567, 0);
    expect(cost).toBe("0.000001");
  });

  it("大数: 100 万 token 计价不溢出", () => {
    const cost = calculateCost(1_000_000, 1_000_000, 0.1, 0.5);
    // (1M*0.1 + 1M*0.5) = 600,000
    expect(cost).toBe("600000.000000");
  });

  it("价格为零时不收费", () => {
    expect(calculateCost(1000, 1000, 0, 0)).toBe("0.000000");
  });

  it("对称性: A 模型高输入价 + B 模型高输出价", () => {
    const cheapInput = calculateCost(100, 50, 0.001, 0.050);
    const cheapOutput = calculateCost(100, 50, 0.050, 0.001);
    expect(Number(cheapInput)).toBeLessThan(Number(cheapOutput));
  });

  it("组合倍率+折扣: ×1.2 multiplier ×0.9 discount", () => {
    const cost = calculateCost(100, 50, 0.01, 0.05, 1.2, 0.9);
    // (1.0 + 2.5) * 1.2 * 0.9 = 3.5 * 1.08 = 3.78
    expect(cost).toBe("3.780000");
  });
});

// ====================================================================
//  4. 资金不变性断言
//     定义系统在任何状态下必须成立的规则
// ====================================================================

interface BalanceSnapshot {
  userId: number;
  balance: number;
  frozen: number;
}

interface Transaction {
  userId: number;
  type: "recharge" | "consumption" | "refund" | "withdraw" | "adjustment";
  amount: number; // 正=入账，负=出账
}

/**
 * 不变性 1 — 资金守恒:
 *   所有用户余额之和 + 冻结之和 = 初始总余额 + 充值总额 - 提现总额
 *   即: 总流入 - 总流出 = 当前余额总和
 */
function verifyFundConservation(
  snapshots: BalanceSnapshot[],
  transactions: Transaction[],
  initialTotalBalance: number,
): { valid: boolean; discrepancy: number; message: string } {
  const currentTotal = snapshots.reduce(
    (sum, s) => sum + s.balance + s.frozen, 0,
  );

  const totalRecharge = transactions
    .filter((t) => t.type === "recharge" || t.type === "refund")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalDeduct = transactions
    .filter((t) => t.type === "consumption" || t.type === "withdraw")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const expected = initialTotalBalance + totalRecharge - totalDeduct;
  const discrepancy = Math.abs(currentTotal - expected);

  return {
    valid: discrepancy < 0.001, // 容忍浮点误差 < 0.001 元
    discrepancy,
    message: discrepancy < 0.001
      ? `资金守恒: ✅ (当前总额=${currentTotal}, 预期=${expected})`
      : `资金守恒: ❌ 偏离 ${discrepancy.toFixed(6)} (当前=${currentTotal}, 预期=${expected})`,
  };
}

/**
 * 不变性 2 — 账单一致性:
 *   每条 call_log 的 cost 必须等于 balance_logs 中对应消费记录金额的绝对值
 */
function verifyBillingConsistency(
  callCosts: { callId: number; cost: number }[],
  balanceDeductions: { refId: number; amount: number }[],
): { valid: boolean; mismatches: number; message: string } {
  const deductionMap = new Map<number, number>();
  for (const d of balanceDeductions) {
    const current = deductionMap.get(d.refId) || 0;
    deductionMap.set(d.refId, current + Math.abs(d.amount));
  }

  let mismatches = 0;
  for (const call of callCosts) {
    const deducted = deductionMap.get(call.callId) || 0;
    if (Math.abs(call.cost - deducted) > 0.0001) {
      mismatches++;
    }
  }

  return {
    valid: mismatches === 0,
    mismatches,
    message: mismatches === 0
      ? `账单一致性: ✅ (${callCosts.length} 条记录全部匹配)`
      : `账单一致性: ❌ ${mismatches} 条不匹配`,
  };
}

/**
 * 不变性 3 — 单用户余额连续:
 *   同一用户的余额按时间排序，相邻两条记录的
 *   balanceAfter[n] - balanceAfter[n-1] == amount[n] (对 adjacent 操作)
 */
function verifyUserBalanceContinuity(
  logs: { userId: number; amount: number; balanceAfter: number; createdAt: number }[],
): { valid: boolean; breaks: number; message: string } {
  // 按用户分组
  const byUser = new Map<number, typeof logs>();
  for (const log of logs) {
    const arr = byUser.get(log.userId) || [];
    arr.push(log);
    byUser.set(log.userId, arr);
  }

  let breaks = 0;
  for (const [, userLogs] of byUser) {
    userLogs.sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 1; i < userLogs.length; i++) {
      const expectedAfter =
        Number(userLogs[i - 1].balanceAfter) + Number(userLogs[i].amount);
      if (Math.abs(expectedAfter - Number(userLogs[i].balanceAfter)) > 0.001) {
        breaks++;
      }
    }
  }

  return {
    valid: breaks === 0,
    breaks,
    message: breaks === 0
      ? `余额连续性: ✅ (${logs.length} 条记录全部连续)`
      : `余额连续性: ❌ ${breaks} 处断裂`,
  };
}

describe("Invariants — 不变性断言", () => {
  // ── 不变性 1: 资金守恒 ──
  describe("资金守恒 (Fund Conservation)", () => {
    it("充值 100 → 消费 30 → 余额 70", () => {
      const snapshots: BalanceSnapshot[] = [
        { userId: 1, balance: 70, frozen: 0 },
      ];
      const transactions: Transaction[] = [
        { userId: 1, type: "recharge", amount: 100 },
        { userId: 1, type: "consumption", amount: -30 },
      ];
      const result = verifyFundConservation(snapshots, transactions, 0);
      expect(result.valid).toBe(true);
    });

    it("多用户: 资金守恒跨用户成立", () => {
      const snapshots: BalanceSnapshot[] = [
        { userId: 1, balance: 50, frozen: 0 },
        { userId: 2, balance: 30, frozen: 10 },
      ];
      const transactions: Transaction[] = [
        { userId: 1, type: "recharge", amount: 100 },
        { userId: 2, type: "recharge", amount: 50 },
        { userId: 1, type: "consumption", amount: -50 },
        { userId: 2, type: "consumption", amount: -10 },
      ];
      const result = verifyFundConservation(snapshots, transactions, 0);
      expect(result.valid).toBe(true);
    });

    it("漏记一笔消费 → 捕获不守恒", () => {
      const snapshots: BalanceSnapshot[] = [
        { userId: 1, balance: 100, frozen: 0 }, // 应有余额
      ];
      const transactions: Transaction[] = [
        { userId: 1, type: "recharge", amount: 100 },
        // 消费 20 被漏记！交易记录缺失
      ];
      // 实际余额 100，但按交易算应该是 100，实际少了一次消费...
      // 换个场景：充值 100，余额 100，但少报了消费
      const snapshots2: BalanceSnapshot[] = [
        { userId: 1, balance: 80, frozen: 0 }, // 被扣了 20
      ];
      const t2: Transaction[] = [
        { userId: 1, type: "recharge", amount: 100 },
        // 消费记录缺失
      ];
      const result = verifyFundConservation(snapshots2, t2, 0);
      // 预期=100, 实际=80, 偏离=20
      expect(result.valid).toBe(false);
      expect(result.discrepancy).toBeCloseTo(20, 2);
    });

    it("冻结金额包含在总和中", () => {
      const snapshots: BalanceSnapshot[] = [
        { userId: 1, balance: 80, frozen: 20 },
      ];
      const transactions: Transaction[] = [
        { userId: 1, type: "recharge", amount: 100 },
      ];
      const result = verifyFundConservation(snapshots, transactions, 0);
      // 80 + 20 = 100 = expected
      expect(result.valid).toBe(true);
    });
  });

  // ── 不变性 2: 账单一致性 ──
  describe("账单一致性 (Billing Consistency)", () => {
    it("每个 call_log 的 cost 匹配 balance_logs 扣款", () => {
      const calls = [
        { callId: 1, cost: 0.5 },
        { callId: 2, cost: 1.25 },
        { callId: 3, cost: 0.001 },
      ];
      const deductions = [
        { refId: 1, amount: -0.5 },
        { refId: 2, amount: -1.25 },
        { refId: 3, amount: -0.001 },
      ];
      const result = verifyBillingConsistency(calls, deductions);
      expect(result.valid).toBe(true);
    });

    it("cost 和 deduction 不匹配 → 捕获不一致", () => {
      const calls = [
        { callId: 1, cost: 0.5 },
      ];
      const deductions = [
        { refId: 1, amount: -0.499 }, // 差了 0.001
      ];
      const result = verifyBillingConsistency(calls, deductions);
      expect(result.valid).toBe(false);
    });
  });

  // ── 不变性 3: 余额连续 ──
  describe("余额连续性 (Balance Continuity)", () => {
    it("连续操作的余额递推正确", () => {
      const logs = [
        { userId: 1, amount: 100, balanceAfter: 100, createdAt: 1 },
        { userId: 1, amount: -30, balanceAfter: 70, createdAt: 2 },
        { userId: 1, amount: -20, balanceAfter: 50, createdAt: 3 },
      ];
      const result = verifyUserBalanceContinuity(logs);
      expect(result.valid).toBe(true);
    });

    it("余额跳变 → 捕获断裂", () => {
      const logs = [
        { userId: 1, amount: 100, balanceAfter: 100, createdAt: 1 },
        { userId: 1, amount: -30, balanceAfter: 70, createdAt: 2 },
        { userId: 1, amount: -20, balanceAfter: 999, createdAt: 3 }, // 不合理跳变
      ];
      const result = verifyUserBalanceContinuity(logs);
      expect(result.breaks).toBeGreaterThan(0);
    });
  });
});
