/**
 * 限流生效值计算（纯函数）— 四级限流的 effective 算法
 *
 * 算法（见 docs/iteration-plan-v2.md P0-2）：
 *   effective = min(例外 ?? 组默认 ?? 平台默认, 模型硬顶)
 *
 * 设计说明：
 * - 客户例外（quota_exception_rules.rpm/tpm）按「客户 × 模型」维度命中；
 * - 组默认：user_groups.rate_limit_qps 视为 RPM 维度默认、rate_limit_tpm 视为 TPM 维度默认
 *   （schema 注释「企业/个人默认值存 system_config」，平台默认按客户类型取 enterprise_* / personal_*）；
 * - 模型硬顶（model_rate_limits.cap_rpm/cap_tpm）为最高约束，任何来源的默认值都被它截断；
 * - 任一层缺省（null）时回退到下一层；全部缺省 → null（不限制）。
 *
 * 本文件为纯函数，无 DB / Redis / 网络依赖，便于单元测试。
 *
 * @module services/rate-limit/effective
 * @see coding-standards-control-logic.md §九（配置驱动的限流参数）
 */

/** 单个维度的生效值计算入参（RPM 或 TPM 各调一次） */
export interface EffectiveLimitInput {
  /** 模型硬顶（model_rate_limits.cap_rpm / cap_tpm），null = 无硬顶 */
  hardCap: number | null | undefined;
  /** 用户组默认（rate_limit_qps 用于 RPM 维度 / rate_limit_tpm 用于 TPM 维度），null = 无组默认 */
  groupDefault: number | null | undefined;
  /** 客户例外（quota_exception_rules.rpm / .tpm，且须通过 isExceptionActive 有效性校验），null = 无例外 */
  exception: number | null | undefined;
  /** 平台默认（system_config enterprise_* / personal_*，按客户类型），null = 无平台默认 */
  platformDefault: number | null | undefined;
}

/**
 * 计算单个维度的生效限流值。
 *
 * 规则：effective = min(例外 ?? 组默认 ?? 平台默认, 模型硬顶)；
 * 全部为空 → null（该维度不限制）。
 *
 * @param input - 单维度入参
 * @returns 生效限流值；null = 不限制
 *
 * @example
 * ```ts
 * computeEffectiveLimit({ exception: 10, groupDefault: 1, platformDefault: 60, hardCap: 100 }); // 10
 * computeEffectiveLimit({ exception: null, groupDefault: null, platformDefault: 60, hardCap: 30 }); // 30（硬顶截断）
 * computeEffectiveLimit({ exception: null, groupDefault: null, platformDefault: null, hardCap: null }); // null
 * ```
 */
export function computeEffectiveLimit(input: EffectiveLimitInput): number | null {
  const { hardCap, groupDefault, exception, platformDefault } = input;

  // 基础值：例外优先，其次组默认，再次平台默认；全空 → null
  const base = exception ?? groupDefault ?? platformDefault ?? null;

  if (base == null && hardCap == null) return null; // 全空 → 不限
  if (base == null) return hardCap ?? null;         // 仅有硬顶 → 以硬顶为准
  if (hardCap == null) return base;                 // 仅有基础值 → 以基础值为准
  return Math.min(base, hardCap);                   // 两者都有 → 取小（硬顶截断）
}

/** RPM / TPM 双维度生效值计算的完整入参 */
export interface EffectiveLimitsInput {
  /** 模型硬顶 RPM（cap_rpm），null = 无 */
  capRpm: number | null | undefined;
  /** 模型硬顶 TPM（cap_tpm），null = 无 */
  capTpm: number | null | undefined;
  /** 用户组 QPS（RPM 维度组默认），null = 无 */
  groupQps: number | null | undefined;
  /** 用户组 TPM（TPM 维度组默认），null = 无 */
  groupTpm: number | null | undefined;
  /** 客户例外 RPM（已通过有效性校验），null = 无 */
  exceptionRpm: number | null | undefined;
  /** 客户例外 TPM（已通过有效性校验），null = 无 */
  exceptionTpm: number | null | undefined;
  /** 平台默认 RPM（按客户类型），null = 无 */
  platformRpm: number | null | undefined;
  /** 平台默认 TPM（按客户类型），null = 无 */
  platformTpm: number | null | undefined;
}

/** 双维度生效值结果：任一维 null = 该维度不限制 */
export interface EffectiveLimits {
  rpm: number | null;
  tpm: number | null;
}

/**
 * 计算 RPM / TPM 双维度生效限流值（enforcer 入口，内部逐维度调用 computeEffectiveLimit）。
 *
 * @param input - 双维度入参
 * @returns { rpm, tpm } 生效限流值
 */
export function computeEffectiveLimits(input: EffectiveLimitsInput): EffectiveLimits {
  return {
    rpm: computeEffectiveLimit({
      hardCap: input.capRpm,
      groupDefault: input.groupQps,
      exception: input.exceptionRpm,
      platformDefault: input.platformRpm,
    }),
    tpm: computeEffectiveLimit({
      hardCap: input.capTpm,
      groupDefault: input.groupTpm,
      exception: input.exceptionTpm,
      platformDefault: input.platformTpm,
    }),
  };
}
