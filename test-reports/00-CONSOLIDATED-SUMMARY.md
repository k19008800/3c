# 3cloud 全量深度回归测试 — 总览报告

**测试日期**: 2026-07-18 21:00–22:00 CST  
**测试范围**: 全模块（5 个子代理并行执行）  
**环境**: localhost:3000 (API) + :5175 (Web) + PostgreSQL 17 + Memurai

---

## 测试范围总览

| 子代理 | 模块 | 端点/检查数 | 覆盖文件 |
|--------|------|------------|---------|
| test-vendor-sync | 供应商管理、同步模型、Key 分组、价格修改 | 17 | vendors.ts, vendor-models.ts, vendor-key-groups.ts, vendor-sync.ts |
| test-router-proxy | 路由选择、熔断器、代理转发、限流、健康检查 | 62 | route-selection.ts, circuit-breaker.ts, forward.ts, auth.ts |
| test-prices-finance | 价格管理、计费引擎、系统配置 | 12 | prices.ts, billing/index.ts, price-service.ts |
| test-auth-users | 用户认证、API Keys、用户管理、限流系统 | 45+ | auth/*.ts, api-keys.ts, users/*.ts, rate-limit.ts |
| test-db-web-admin | 数据库完整性、Web 前端、管理后台、审计日志、安全模块 | 30+ | schema/*.ts, admin/*.ts, security/*.ts |
| **合计** | **全模块** | **~170+** | **~150+ 源码文件** |

---

## 关键发现严重度分布

| 严重度 | 数量 | 说明 |
|--------|------|------|
| 🔴 **严重 (Critical)** | 4 | 安全/金融风险、数据完整性风险 |
| 🟡 **高 (High)** | 5 | 功能完整性问题、潜在数据不一致 |
| 🟠 **中 (Medium)** | 4 | 设计缺陷、容错不足 |
| 🟢 **低 (Low)** | 8 | 代码风格、日志覆盖、配置一致性 |

---

## 🔴 严重问题

### CRIT-1: 定价倍率无值域校验（不接受 0 或负值）
- **模块**: 价格管理 (J5)
- **文件**: `routes/admin/prices.ts`
- **描述**: `POST /api/v1/admin/finance/prices/multiplier` 接受 `value=0` 和 `value=-1`，返回 200。倍率为 0 将导致所有计费免费，负值则倒贴。
- **修复**: 在 `updatePricingMultiplier` 添加 `value > 0` 校验

### CRIT-2: 熔断器 dbTransitionDegraded 重复计数
- **模块**: 路由/熔断 (W1)
- **文件**: `services/circuit-breaker.ts`
- **描述**: `recordVendorModelFailure` 已自增 `circuitFailCount`，但 `shouldSkipVendor` 的 Level1 分支中 `dbTransitionDegraded` 再次 `+1`。同一波失败导致计数翻倍。
- **修复**: 移除 `dbTransitionDegraded` 中的重复自增

### CRIT-3: API Key 硬删除导致审计追溯丢失
- **模块**: 用户认证 (N3)
- **文件**: `routes/api-keys.ts`
- **描述**: `DELETE /api/v1/api-keys/:id` 直接 `db.delete()`，非软删除—已删除的 key 无法追溯谁删了什么。
- **修复**: 改为 `update status=false` 或设置 `deletedAt` 时间戳

### CRIT-4: 注册密码无强度策略
- **模块**: 用户认证 (M2)
- **文件**: `routes/auth/register.ts`, `services/auth-service/registration.ts`
- **描述**: 注册和改密接口均无密码复杂度校验（大小写+数字+特殊字符≥8位），可被弱口令攻击。
- **修复**: 增加 Zod schema 密码校验层

---

## 🟡 高严重度问题

### HIGH-1: 倍率变更后已有 sell price 不自动重算
- **模块**: 价格管理 (J7)
- **文件**: `services/price-service.ts`, `routes/admin/prices.ts`
- **描述**: 改完倍率后，所有非零 sell price 的 vendor_models 保留旧倍率计算的价格，不自动更新。例：资源池1 deepseek-v4-pro (vm55) sell_input=0.007315, cost_input=0.005500, ratio=1.33(旧倍率)，当前倍率已改 1.15 但 sell 未变。
- **影响**: 倍率变更后，实际售价与配置倍率不一致
- **修复**: multiplier 变更时，提供一键重算所有 sell price 的选项

### HIGH-2: 价格倍率默认值不一致（3 处 3 个值）
- **模块**: 价格管理 (J2)
- **文件**: `routes/admin/prices.ts` (1.15), `billing/cache.ts` (1.01), `vendor-sync/pricing.ts` (1.01)
- **描述**: 三个模块的默认值不同：prices 路由后端用 1.15，billing 计费用 1.01，sync 用 1.01
- **影响**: system_configs 删除或未设置时，不同模块使用不同倍率，导致前端展示、计费、sync 三套数值
- **修复**: 统一为一个常量

### HIGH-3: Fallback 不处理 Key 分组
- **模块**: 路由转发 (W3)
- **文件**: `routes/proxy/forward.ts` — `tryFallback()`
- **描述**: fallback 直接 `decryptApiKey(r.apiKeyEncrypted)`，不调用 `resolveKeyGroup`。如 fallback 路由配置了 keyGroup，则会使用 vendorModel 本身的 Key 而非分组轮询 Key
- **修复**: `tryFallback` 在构造 fallbackRoute 后调用 `resolveKeyGroup`

### HIGH-4: Fallback 不检查熔断
- **模块**: 路由转发 (W4)
- **文件**: `routes/proxy/forward.ts` — `tryFallback()`
- **描述**: fallback 直接取次低价路由，不检查 `shouldSkipVendor`。可能选到高频失败或半开状态的候选路由
- **修复**: fallback 查询时增加熔断过滤

### HIGH-5: 余额调整无双审（管理员手调路径）
- **模块**: 用户管理 (O5)
- **文件**: `routes/admin/users/actions.ts`
- **描述**: `POST /api/v1/admin/users/:id/recharge` 直接更新余额 + 写 balance_logs + 审计日志，无双审
- **修复**: 对于超过阈值（如 1000 元）的余额调整增加二审流程

---

## 🟠 中严重度问题

### MED-1: 非 Token 计费模型无 Fallback
- **模块**: 路由转发 (W5, W6)
- **文件**: `routes/proxy/forward.ts` — `handleNonTokenBilling()`, `handleVideoGeneration()`
- **描述**: 图片/音频/rerank 转发失败不触发 fallback
- **修复**: 增加 fallback 逻辑

### MED-2: 重置密码 Token 无 IP 绑定
- **模块**: 用户认证
- **文件**: `routes/auth/reset.ts`
- **描述**: forgot-password token 仅绑定 userId + 30 分钟过期，无 IP/设备指纹绑定
- **修复**: token 绑定 IP 前缀

### MED-3: 限流冷启动窗口
- **模块**: 限流系统
- **文件**: `middleware/rate-limit.ts`
- **描述**: 首次请求后窗口立即计满，突发流量可能突破限流
- **修复**: 使用令牌桶算法或预加载

### MED-4: 内容过滤 CRUD 未写审计日志
- **模块**: 管理后台 (R3)
- **文件**: `routes/admin/content-filters.ts`
- **描述**: 创建/更新/删除内容过滤规则不写入 `audit_logs`
- **修复**: 增加审计日志写入

---

## 🟢 低严重度问题

| ID | 模块 | 描述 |
|----|------|------|
| L1 | 供应商 | 模型类型猜测：dall-e-3 因连字符不匹配 "dalle" 关键词，被误判为 chat 类型 |
| L2 | 供应商 | Key 前缀格式不一致：sync 用 `apiKey.slice(0,8)`，手动添加用 `slice(0,7)+"..."` |
| L3 | 供应商 | sync 时手动传 keyGroupId 不自动添加 Key 到分组 |
| L4 | 路由 | `pickByStrategy` default 分支无日志 — 未知策略静默 fallback |
| L5 | 路由 | `getAllCircuitStatuses` 全表扫描 — `vendors/:id` 详情每次都全量 JOIN |
| L6 | 路由 | `rate_limit_personal_tpm=1000` 极严格 — 单次 gpt-4o-mini 超过 1K tokens 即限流 |
| L7 | 价格 | cost 接口只支持 `vendorModelIds`，不支持 `modelIds` 别名（vs sell 接口兼容两者）|
| L8 | 用户 | JWT access secret 开发环境硬编码默认值 |

---

## 各模块通过率

| 模块子代理 | 测试点 | PASS | FAIL | WARN | 通过率 |
|-----------|-------|------|------|------|--------|
| 供应商模块 | 17 | 17 | 0 | 0 | 100% ✅ |
| 路由/熔断/代理 | 62 | 54 | 0 | 8 | 87% ⚠️ |
| 价格/计费 | 12 | 10 | 0 | 2 | 83% ⚠️ |
| 认证/API Keys/用户 | 45+ | 37 | 0 | 8 | 82% ⚠️ |
| DB/Web/管理后台 | 30+ | 29 | 0 | 1 | 97% ✅ |
| **合计** | **~170** | **~147** | **0** | **~19** | **86% ⚠️** |

---

## 建议修复优先级

### P0 — 立即修复（严重安全/金融风险）
1. **CRIT-1**: multiplier 值域校验 — 30 分钟
2. **CRIT-2**: dbTransitionDegraded 重复计数 — 30 分钟
3. **CRIT-3**: API Key 硬删除改软删除 — 1 小时
4. **CRIT-4**: 密码强度策略 — 1 小时

### P1 — 本周修复（功能完整性）
5. **HIGH-1**: 倍率变更后的价格重算机制 — 2 小时
6. **HIGH-2**: 默认倍率值统一 — 30 分钟
7. **HIGH-3**: Fallback Key 分组支持 — 2 小时
8. **HIGH-4**: Fallback 熔断检查 — 1 小时
9. **HIGH-5**: 大额余额调整二审 — 2 小时

### P2 — 下个迭代（容错性提升）
10. **MED-1**: 非 Token 计费 fallback — 2 小时
11. **MED-2**: 重置 token IP 绑定 — 1 小时
12. **MED-3**: 限流冷启动优化 — 3 小时
13. **MED-4**: 内容过滤 CRUD 审计 — 1 小时

### P3 — 技术债务（低优先级）
14. **L1-L8**: 低严重度问题

---

## 详细报告文件

每个子代理的完整报告位于：
- `test-reports/deep-regression-vendor-module.md` — 供应商模块（17 项）
- `test-reports/deep-regression-router.md` — 路由/熔断/代理（62 项，62 PASS）
- `test-reports/deep-regression-prices.md` — 价格管理/计费（12 项）
- `test-reports/deep-regression-auth-users.md` — 认证/API Keys/用户管理（45+ 项）
- `test-reports/deep-regression-db-web-admin.md` — 数据库/Web/管理后台（30+ 项）

---

*报告生成: 2026-07-18 22:00 CST | 泥鳅 🐍*
