// ============================================================
//  3cloud (3C) — 供应商负载均衡器（负载感知分流）
//  基于实时性能指标（call_logs 统计）动态调整路由权重和并发上限
// ============================================================

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Redis } from "ioredis";

// ── 类型定义 ──

export interface VendorLoadState {
  vendorId: number;
  currentConcurrent: number;   // 当前并发数
  maxConcurrent: number;        // 动态上限
  latency5min: number;          // 最近5分钟平均延迟(ms)
  latency1h: number;            // 过去1小时平均延迟基线(ms)
  errorRate5min: number;        // 最近5分钟错误率(0~1)
  errorRate1h: number;          // 过去1小时错误率基线
  lastUpdated: number;          // 时间戳
  offloadRatio: number;         // 0~1, 分流比例
}

interface VendorStats {
  vendorName: string;
  avgLatency: number;
  totalCalls: number;
  errorCount: number;
}

// Redis 缓存 Key
const REDIS_KEY_PREFIX = "lb:vendor:";
const REDIS_STATS_TTL = 30; // 30 秒

// ── 配置常量 ──

const DEFAULT_MAX_CONCURRENT = 50;
const MAX_CONCURRENT_CEILING = 200;
const MIN_CONCURRENT_FLOOR = 10;
const ADJUST_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟评估间隔

// ── 单例 ──

let instance: VendorLoadBalancer | null = null;

/**
 * 获取负载均衡器单例
 */
export function getLoadBalancer(): VendorLoadBalancer {
  if (!instance) {
    instance = new VendorLoadBalancer();
  }
  return instance;
}

/**
 * 重置单例（仅用于测试）
 */
export function resetLoadBalancer(): void {
  instance = null;
}

// ── 类 ──

export class VendorLoadBalancer {
  private states = new Map<string, VendorLoadState>(); // key: vendorName
  private vendorNameToId = new Map<string, number>();  // vendorName → vendorId
  private lastAdjustTime = 0;
  private lastRefreshTime = 0;
  private initialized = false;

  /**
   * 初始化：从 system_configs 读取默认并发上限
   */
  private async ensureInitialized(db: NodePgDatabase): Promise<void> {
    if (this.initialized) return;

    try {
      const { systemConfigs } = await import("../../db/schema.js");
      const [config] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(sql`${systemConfigs.key} = 'vendor_concurrent_default'`)
        .limit(1);

      const defaultMax = config ? parseInt(config.value, 10) || DEFAULT_MAX_CONCURRENT : DEFAULT_MAX_CONCURRENT;
      this.initialized = true;

      // 注意：defaultMax 会在第一次创建状态时使用
      // 在 ensureVendorState 中通过 getInitialMaxConcurrent 获取
    } catch (err) {
      console.warn("[LoadBalancer] 初始化失败，使用默认值:", err);
      this.initialized = true;
    }
  }

  /**
   * 获取初始最大并发数（从 system_configs 或默认值）
   */
  private async getInitialMaxConcurrent(db: NodePgDatabase): Promise<number> {
    try {
      const { systemConfigs } = await import("../../db/schema.js");
      const [config] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(sql`${systemConfigs.key} = 'vendor_concurrent_default'`)
        .limit(1);
      return config ? parseInt(config.value, 10) || DEFAULT_MAX_CONCURRENT : DEFAULT_MAX_CONCURRENT;
    } catch {
      return DEFAULT_MAX_CONCURRENT;
    }
  }

  /**
   * 确保 vendor 在状态 map 中有条目
   */
  private async ensureVendorState(
    vendorName: string,
    vendorId: number,
    db: NodePgDatabase,
  ): Promise<void> {
    if (!this.states.has(vendorName)) {
      const initialMax = await this.getInitialMaxConcurrent(db);
      this.states.set(vendorName, {
        vendorId,
        currentConcurrent: 0,
        maxConcurrent: initialMax,
        latency5min: 0,
        latency1h: 0,
        errorRate5min: 0,
        errorRate1h: 0,
        lastUpdated: 0,
        offloadRatio: 0,
      });
      this.vendorNameToId.set(vendorName, vendorId);
    }
  }

  /**
   * 从 call_logs 拉取统计数据，更新内存状态
   * 使用 Redis 缓存避免频繁查库
   *
   * 应每 30 秒调用一次
   */
  async refreshStats(db: NodePgDatabase, redis: Redis): Promise<void> {
    await this.ensureInitialized(db);

    // 尝试从 Redis 获取缓存
    const cacheKey = `${REDIS_KEY_PREFIX}stats`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as VendorStats[];
        if (Array.isArray(parsed)) {
          await this.applyStats(parsed, db);
          this.lastRefreshTime = Date.now();
          return;
        }
      }
    } catch {
      // Redis 不可用时直接查库
    }

    // 并行查询最近 5 分钟和 1 小时
    const [fiveMinStats, oneHourStats] = await Promise.all([
      this.queryStats(db, 5 * 60),
      this.queryStats(db, 60 * 60),
    ]);

    // 写入 Redis 缓存
    try {
      await redis.setex(cacheKey, REDIS_STATS_TTL, JSON.stringify(fiveMinStats));
    } catch {
      // 缓存非关键，忽略
    }

    // 合并统计
    await this.mergeStats(fiveMinStats, oneHourStats, db);

    this.lastRefreshTime = Date.now();
  }

  /**
   * 查询指定时间范围的统计
   */
  private async queryStats(
    db: NodePgDatabase,
    intervalSeconds: number,
  ): Promise<{ name: string; avgLatency: number; totalCalls: number; errorCount: number }[]> {
    try {
      const rows = await db.execute(sql`
        SELECT
          vendor_name,
          AVG(duration_ms)::float8 as avg_latency,
          COUNT(*)::int as total_calls,
          COUNT(*) FILTER (WHERE status = 'failed' OR status = 'timeout')::int as error_count
        FROM call_logs
        WHERE created_at > NOW() - (${sql.raw(`${intervalSeconds}`)} || ' seconds')::interval
        GROUP BY vendor_name
      `);

      if (!rows || !Array.isArray(rows.rows)) {
        return [];
      }

      return rows.rows.map((r: any) => ({
        name: String(r.vendor_name ?? ""),
        avgLatency: r.avg_latency != null ? Number(r.avg_latency) : 0,
        totalCalls: r.total_calls != null ? Number(r.total_calls) : 0,
        errorCount: r.error_count != null ? Number(r.error_count) : 0,
      }));
    } catch (err) {
      console.warn("[LoadBalancer] 查询统计数据异常:", err);
      return [];
    }
  }

  /**
   * 合并 5 分钟和 1 小时统计到内存状态
   */
  private async mergeStats(
    fiveMinStats: { name: string; avgLatency: number; totalCalls: number; errorCount: number }[],
    oneHourStats: { name: string; avgLatency: number; totalCalls: number; errorCount: number }[],
    db: NodePgDatabase,
  ): Promise<void> {
    // 构建 1 小时数据索引
    const oneHourMap = new Map<string, { avgLatency: number; totalCalls: number; errorCount: number }>();
    for (const s of oneHourStats) {
      oneHourMap.set(s.name, s);
    }

    for (const stat of fiveMinStats) {
      if (!stat.name) continue;

      // 确保状态存在（vendorId 从现有状态或查询 vendors 表获取）
      let state = this.states.get(stat.name);
      if (!state) {
        // 尝试从 vendors 表获取 vendorId
        try {
          const { vendors } = await import("../../db/schema.js");
          const [vendor] = await db
            .select({ id: vendors.id })
            .from(vendors)
            .where(sql`${vendors.name} = ${stat.name}`)
            .limit(1);
          if (vendor) {
            const initialMax = await this.getInitialMaxConcurrent(db);
            state = {
              vendorId: vendor.id,
              currentConcurrent: 0,
              maxConcurrent: initialMax,
              latency5min: 0,
              latency1h: 0,
              errorRate5min: 0,
              errorRate1h: 0,
              lastUpdated: 0,
              offloadRatio: 0,
            };
            this.states.set(stat.name, state);
            this.vendorNameToId.set(stat.name, vendor.id);
          }
        } catch {
          continue;
        }
      }

      if (!state) continue;

      const oneHour = oneHourMap.get(stat.name);

      state.latency5min = stat.avgLatency;
      state.errorRate5min = stat.totalCalls > 0 ? stat.errorCount / stat.totalCalls : 0;
      state.latency1h = oneHour?.avgLatency ?? stat.avgLatency;
      state.errorRate1h = oneHour && oneHour.totalCalls > 0
        ? oneHour.errorCount / oneHour.totalCalls
        : state.errorRate5min;
      state.lastUpdated = Date.now();

      // 重新计算分流比例
      state.offloadRatio = this.computeOffloadRatio(state);

      // 动态调整 maxConcurrent
      this.adjustMaxConcurrentForState(state);
    }

    // 对于 1 小时才有数据但 5 分钟无数据的供应商，保留旧数据
    for (const stat of oneHourStats) {
      if (!stat.name) continue;
      const state = this.states.get(stat.name);
      if (state && !fiveMinStats.some((s) => s.name === stat.name)) {
        // 5 分钟无数据 → 延迟降为 0，错误率降为 0（表示该供应商无流量）
        state.latency5min = 0;
        state.errorRate5min = 0;
        state.latency1h = stat.avgLatency;
        state.errorRate1h = stat.totalCalls > 0 ? stat.errorCount / stat.totalCalls : 0;
        state.offloadRatio = 0;
        state.lastUpdated = Date.now();
      }
    }
  }

  /**
   * 直接将统计结果应用到状态（从 Redis 缓存恢复时使用）
   */
  private async applyStats(
    stats: { name: string; avgLatency: number; totalCalls: number; errorCount: number }[],
    db: NodePgDatabase,
  ): Promise<void> {
    for (const stat of stats) {
      if (!stat.name) continue;
      let state = this.states.get(stat.name);
      if (!state) {
        try {
          const { vendors } = await import("../../db/schema.js");
          const [vendor] = await db
            .select({ id: vendors.id })
            .from(vendors)
            .where(sql`${vendors.name} = ${stat.name}`)
            .limit(1);
          if (vendor) {
            const initialMax = await this.getInitialMaxConcurrent(db);
            state = {
              vendorId: vendor.id,
              currentConcurrent: 0,
              maxConcurrent: initialMax,
              latency5min: 0,
              latency1h: 0,
              errorRate5min: 0,
              errorRate1h: 0,
              lastUpdated: 0,
              offloadRatio: 0,
            };
            this.states.set(stat.name, state);
            this.vendorNameToId.set(stat.name, vendor.id);
          } else {
            continue;
          }
        } catch {
          continue;
        }
      }

      state.latency5min = stat.avgLatency;
      state.errorRate5min = stat.totalCalls > 0 ? stat.errorCount / stat.totalCalls : 0;
      state.lastUpdated = Date.now();
      state.offloadRatio = this.computeOffloadRatio(state);
    }
  }

  // ── 计算综合分 ──

  /**
   * 计算供应商综合分（0~1）
   */
  getVendorScore(vendorName: string): number {
    const state = this.states.get(vendorName);
    if (!state) return 0;

    // 并发饱和度
    const saturation = state.maxConcurrent > 0
      ? Math.min(state.currentConcurrent / state.maxConcurrent, 1)
      : 0;

    // 延迟比
    let latencyScore = 0;
    if (state.latency1h > 0 && state.latency5min > 0) {
      const ratio = state.latency5min / state.latency1h;
      latencyScore = Math.max(0, Math.min((ratio - 1) / 1, 1));
    }

    // 错误率
    const errorScore = Math.min(state.errorRate5min * 10, 1);

    // 综合分
    return saturation * 0.4 + latencyScore * 0.35 + errorScore * 0.25;
  }

  /**
   * 计算分流比例
   */
  private computeOffloadRatio(state: VendorLoadState): number {
    const score = this.getVendorScoreForState(state);

    if (score <= 0.3) return 0;
    if (score <= 0.5) return ((score - 0.3) / 0.2) * 0.1;
    if (score <= 0.7) return 0.1 + ((score - 0.5) / 0.2) * 0.2;
    if (score <= 0.9) return 0.3 + ((score - 0.7) / 0.2) * 0.3;
    return 0.6;
  }

  /**
   * 对 vendor 计算综合分（对外接口，通过 vendorId 查找）
   */
  getVendorScoreById(vendorId: number): number {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        return this.getVendorScoreForState(state);
      }
    }
    return 0;
  }

  /**
   * 获取分流比例（对外接口，通过 vendorId 查找）
   */
  getOffloadRatio(vendorId: number): number {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        return state.offloadRatio;
      }
    }
    return 0;
  }

  /**
   * 判断是否需要分流（综合分 > 0.5）
   */
  shouldOffload(vendorId: number): boolean {
    return this.getVendorScoreById(vendorId) > 0.5;
  }

  /**
   * 判断是否需要分流（通过 vendorName）
   */
  shouldOffloadByName(vendorName: string): boolean {
    const state = this.states.get(vendorName);
    if (!state) return false;
    return this.getVendorScoreForState(state) > 0.5;
  }

  /**
   * 获取分流比例（通过 vendorName）
   */
  getOffloadRatioByName(vendorName: string): number {
    const state = this.states.get(vendorName);
    if (!state) return 0;
    return state.offloadRatio;
  }

  /**
   * 获取 vendor 综合分（内部方法，接收状态对象）
   */
  private getVendorScoreForState(state: VendorLoadState): number {
    const saturation = state.maxConcurrent > 0
      ? Math.min(state.currentConcurrent / state.maxConcurrent, 1)
      : 0;

    let latencyScore = 0;
    if (state.latency1h > 0 && state.latency5min > 0) {
      const ratio = state.latency5min / state.latency1h;
      latencyScore = Math.max(0, Math.min((ratio - 1) / 1, 1));
    }

    const errorScore = Math.min(state.errorRate5min * 10, 1);

    return saturation * 0.4 + latencyScore * 0.35 + errorScore * 0.25;
  }

  /**
   * 获取供应商状态对象（完整状态）
   */
  getState(vendorId: number): VendorLoadState | undefined {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        return state;
      }
    }
    return undefined;
  }

  /**
   * 获取供应商名称对应的状态
   */
  getStateByName(vendorName: string): VendorLoadState | undefined {
    return this.states.get(vendorName);
  }

  // ── 动态 maxConcurrent 调整 ──

  /**
   * 动态调整 maxConcurrent（每 5 分钟评估一次）
   */
  adjustMaxConcurrent(vendorId: number): void {
    if (Date.now() - this.lastAdjustTime < ADJUST_INTERVAL_MS) return;

    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        this.adjustMaxConcurrentForState(state);
      }
    }
  }

  /**
   * 对单个状态进行 maxConcurrent 调整
   */
  private adjustMaxConcurrentForState(state: VendorLoadState): void {
    if (Date.now() - this.lastAdjustTime < ADJUST_INTERVAL_MS) return;

    // 计算延迟比
    const latencyRatio = state.latency1h > 0 && state.latency5min > 0
      ? state.latency5min / state.latency1h
      : 1;

    // 错误率 > 10% → 触发熔断
    if (state.errorRate5min > 0.1) {
      console.warn(`[LoadBalancer] 供应商 ${state.vendorId} 错误率 ${(state.errorRate5min * 100).toFixed(1)}% > 10%，触发熔断`);
      // 非阻塞触发熔断
      this.triggerCircuitBreaker(state).catch((err) => {
        console.warn("[LoadBalancer] 熔断触发异常（非阻塞）:", err);
      });
    }

    if (latencyRatio < 1.2 && state.errorRate5min < 0.01) {
      // 状态良好 → 增加上限
      state.maxConcurrent = Math.min(
        Math.round(state.maxConcurrent * 1.1),
        MAX_CONCURRENT_CEILING,
      );
    } else if (latencyRatio > 1.5 || state.errorRate5min > 0.05) {
      // 负载高 → 降低上限
      state.maxConcurrent = Math.max(
        Math.round(state.maxConcurrent * 0.8),
        MIN_CONCURRENT_FLOOR,
      );
    }
    // 中间状态 → 保持

    this.lastAdjustTime = Date.now();
  }

  /**
   * 触发电路熔断器
   * 错误率 > 10% 时调用 circuit-breaker 的 recordVendorModelFailure
   */
  private async triggerCircuitBreaker(state: VendorLoadState): Promise<void> {
    try {
      const { getDb } = await import("../../db/index.js");
      const db = getDb();

      // 查询该供应商下所有活跃的 vendorModel 记录
      const { vendorModels } = await import("../../db/schema.js");
      const { eq } = await import("drizzle-orm");

      const models = await db
        .select({ id: vendorModels.id })
        .from(vendorModels)
        .where(eq(vendorModels.vendorId, state.vendorId))
        .limit(20);

      // 非阻塞触发各 vendorModel 的熔断
      const { recordVendorModelFailure } = await import("../circuit-breaker.js");
      for (const m of models) {
        recordVendorModelFailure(m.id).catch(() => {
          // 单个熔断失败不影响其他
        });
      }
    } catch (err) {
      console.warn("[LoadBalancer] 查询 vendorModel 或触发熔断异常:", err);
    }
  }

  /**
   * 对所有供应商进行批量调整
   */
  adjustAllMaxConcurrent(): void {
    if (Date.now() - this.lastAdjustTime < ADJUST_INTERVAL_MS) return;

    for (const state of this.states.values()) {
      this.adjustMaxConcurrentForState(state);
    }
  }

  // ── 并发控制集成 ──

  /**
   * 获取供应商当前并发数
   */
  getCurrentConcurrent(vendorId: number): number {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        return state.currentConcurrent;
      }
    }
    return 0;
  }

  /**
   * 获取供应商动态最大并发数
   */
  getMaxConcurrent(vendorId: number): number {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        return state.maxConcurrent;
      }
    }
    return DEFAULT_MAX_CONCURRENT;
  }

  /**
   * 增加供应商并发计数
   */
  incrementConcurrent(vendorId: number): void {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        state.currentConcurrent++;
        return;
      }
    }
  }

  /**
   * 减少供应商并发计数
   */
  decrementConcurrent(vendorId: number): void {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId && state.currentConcurrent > 0) {
        state.currentConcurrent--;
        return;
      }
    }
  }

  /**
   * 设置供应商并发计数
   */
  setCurrentConcurrent(vendorId: number, value: number): void {
    for (const state of this.states.values()) {
      if (state.vendorId === vendorId) {
        state.currentConcurrent = Math.max(0, value);
        return;
      }
    }
  }

  /**
   * 确保 vendorName 对应的状态存在（当状态未知时由 forward.ts 调用）
   */
  async ensureVendorStateByName(
    vendorName: string,
    vendorId: number,
    db: NodePgDatabase,
  ): Promise<void> {
    await this.ensureVendorState(vendorName, vendorId, db);
  }

  /**
   * 通过 vendorName 获取 vendorId
   */
  getVendorIdByName(vendorName: string): number | undefined {
    return this.vendorNameToId.get(vendorName);
  }

  // ── 状态查询 ──

  /**
   * 获取所有供应商状态（用于监控 API）
   */
  getAllStatus(): Record<string, VendorLoadState> {
    const result: Record<string, VendorLoadState> = {};
    for (const [name, state] of this.states) {
      // 重算 offloadRatio
      const score = this.getVendorScoreForState(state);
      const offloadRatio = this.computeOffloadRatio(state);
      result[name] = {
        ...state,
        offloadRatio,
        // 附加评分信息
      };
    }
    return result;
  }

  /**
   * 获取单个供应商状态
   */
  getStatus(vendorName: string): VendorLoadState | undefined {
    return this.states.get(vendorName);
  }

  /**
   * 获取最后刷新时间
   */
  getLastRefreshTime(): number {
    return this.lastRefreshTime;
  }
}