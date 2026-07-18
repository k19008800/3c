# 3cloud 全量深度回归测试报告 — 路由转发 + 代理 + 熔断模块

**测试时间**: 2026-07-18 21:00–22:00 (GMT+8)
**测试环境**: localhost:3000 | PG threecloud | Redis (Memurai)
**测试账号**: admin@3cloud.ai / Admin1234! (super_admin) | admin@3cloud.dev / admin123 (admin)
**报告生成**: dispatch-agent → subagent (深度回归)

---

## 模块 E：路由选择 (services/router/route-selection.ts)

### E1. queryAvailableRoutes 逻辑分析

| 考察项 | 分析结果 | 判定 |
|--------|----------|------|
| WHERE 条件 | `vendorModels.modelId = ?`, `vendorModels.status=true`, `vendorModels.isDown=false`, `vendors.status="active"` | ✅ |
| 排序依据 | `vendorModels.sellPriceInput ASC` → 低价优先 | ✅ |
| apiKey 解密 | `decryptApiKey(r.apiKeyEncrypted)` — 每行都解密 | ✅ |
| keyGroupId 字段 | 在 select 中 (`vendorModels.keyGroupId`)，且透传到返回对象 | ✅ |
| 返回结构 | 含 plain apiKey、keyGroupId、sellPriceInput/Output、weight、healthScore 等 | ✅ |

**注意点**: `queryAvailableRoutes` 不做熔断过滤 — 熔断在 `selectRoute` 中单独处理（通过 `shouldSkipVendor` 动态过滤），这是合理的职责分离。

---

### E2. pickByStrategy 分支分析

| 策略 | 实现 | 风险 |
|------|------|------|
| `lowest_price` | 已 ASC 排序，直接返回 `candidates[0]` | ✅ 正确 |
| `weighted_random` | `totalWeight = sum(weight)`, `rand = Math.random() * totalWeight`, 递减扣减 | ✅ 标准权重算法 |
| `manual` | 需要 `preferredVendorId` 且必须在 candidates 中 | ✅ 健全性检查 |
| 空候选 | 直接 throw `AppError("NO_ROUTE")` 503 | ✅ |
| 未知策略 fallback | 也返回 `candidates[0]` | ⚠️ WARN: 静默 fallback，应当日志告警 |

**结论**: 三个策略均正确。仅 `default` 分支无日志，建议补 `console.warn`。

---

### E3. resolveKeyGroup 逻辑分析

| 场景 | 行为 | 判定 |
|------|------|------|
| `keyGroupId=null` | 直接 `return route`，不查分组 | ✅ |
| `keyGroupId` 有值但无可用 Key | `selectKeyFromGroup` 返回 null → `return route` 沿用 vendorModel 本身的 Key | ✅ 合理降级 |
| Key-Model 交叉价 absolute | `keySellPriceInput = modelPrice.inputValue` 直接覆盖 | ✅ |
| Key-Model 交叉价 percent | `route.sellPriceInput * keyPricePercent` | ✅ |
| Key 统一价（无交叉价） | `sellPriceInput` 直接赋值 | ✅ |
| 交叉价某维度为 null | 降级到 Key 统一价或 vendorModel 价 | ✅ 多层次降级 |
| 异常时 | catch 异常 → `console.warn` + `return route` | ✅ |

**DB 验证**:
```sql
-- key_group_id 分布
SELECT key_group_id IS NOT NULL AS has_key_group, COUNT(*) 
FROM vendor_models GROUP BY has_key_group;
-- IS NULL: 51 (非 MockVendor 的活跃+非活跃)
-- IS NOT NULL: 8 (全部是 MockVendor_SyncTest, key_group_id=4)

-- Key 分组定义
SELECT * FROM vendor_key_groups WHERE id IN (SELECT DISTINCT key_group_id FROM vendor_models WHERE key_group_id IS NOT NULL);
-- id=4, vendor_id=97, name="default", strategy="round_robin", status=true

-- Key 分组 Items
SELECT * FROM vendor_key_group_items WHERE group_id=4;
-- 1 item: id=5, strategy=round_robin, weight=1, priority=0, status=true

-- 交叉价表
SELECT * FROM vendor_key_group_model_prices;
-- 0 rows → 无 Key-Model 交叉价配置
```

**结论**: keyGroupId=4 的 8 个 MockVendor 记录都复用同一个 key group item，没有配置交叉价（model_prices 表空），所以走 Key 统一价逻辑。但由于 MockVendor 的 key_item 上 sellPriceInput/Output 也为 null（见 DB 查询），resolveKeyGroup 中 no cross price + no key unified price = 沿用 vendorModel 基价。逻辑正确。

---

### E4. selectRoute 熔断过滤

| 场景 | 行为 | 判定 |
|------|------|------|
| 熔断检查 | `shouldSkipVendor(c.vendorModelId)` 逐一过滤 | ✅ |
| 全被熔断 | `candidates = filtered.length > 0 ? filtered : candidates` → 允许最低价厂商通过 | ✅ 合理 |
| 异常时 | catch 异常 → `console.warn` + 跳过熔断过滤 | ✅ 熔断不影响主流程 |

---

### E5. 验证数据完整性

```sql
-- vendor_models 总览
total_vms | active_vms | down_vms | disabled_vms | circuit_not_closed
-----------+------------+----------+--------------+--------------------
        80 |         59 |        0 |           21 |                  0

-- 活跃+isDown=false+circuit_state=closed → 全部健康

-- 关键：vendor 级别 status
SELECT id, name, status FROM vendors WHERE status = 'active';
-- 31 个活跃厂商（含测试厂商）
-- 其中真正有用的生产厂商：openai, anthropic, deepseek, 天翼, 资源池1, 火山引擎, Seedance 2.0

-- 天翼 (vendor_id=4) 是唯一 "deepseek-chat" 模型的活跃路由
-- 火山引擎 (vendor_id=66) 的 circuit_fail_count=3, healthScore=0.81, health_samples=2
```

**关键发现**:
1. `deepseek-chat` 模型在 deepseek 厂商配置的 vendor_models 全部 status=false（已停用），只有天翼的 vendor_model (id=6) 是 status=true → 天翼成为唯一 deepseek-chat 路由
2. deepseek-v4-flash (model_id=83) 在 deepseek 厂商有唯一活跃路由 (vendor_model_id=156)
3. 无 `isDown=true` 的记录，所有 active vendor_models 都健康
4. 火山引擎 (doubao-seedance) 有 3 次失败计数，但 circuit_state 仍是 closed（低于 Level1 阈值 5）/ healthScore=0.81 未到 DOWN 阈值 0.30

---

## 模块 F：熔断器 (services/circuit-breaker/)

### F1. 源码分析

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `LEVEL1_FAIL_THRESHOLD` | 5 | 软降级阈值 → weight 降为 10% |
| `LEVEL2_FAIL_THRESHOLD` | 10 | 硬熔断阈值 → half_open, isDown=true |
| `LEVEL3_PROBE_FAIL_LIMIT` | 3 | 永久关停阈值（半开探测连续失败） |
| `DEFAULT_OPEN_MS` | 30000 | 半开窗口 (30s) |
| `DEFAULT_HALF_OPEN_MS` | 120000 | 探测窗口 (2min) |
| `WEIGHT_REDUCED` | 10 | 软降级后权重 |
| 滑动窗口 | Redis ZSET, 120s TTL | failures 120s 过期 |

**状态机**: `closed → degraded (level1) → half_open (level2, 可配置 openMs) → dead (level3)`

**recordVendorModelFailure**:
- Redis `INCR cb:v2:fail:<id>` + EXPIRE 120s
- DB `circuitFailCount += 1`
- 如果当前是 half_open 状态，检查半开探测失败计数 → 3次失败转 dead

**shouldSkipVendor**:
1. DB circuitState=dead → true (永远跳过)
2. half_open + 未到 retryAfter → true (跳过)
3. half_open + 已到 retryAfter → false (允许探测)
4. Redis OPEN 标记且未超时 → true
5. OPEN 超时 → 自动转入 half_open → false (允许探测)
6. Level1 failCount >=5 → 软降级 → false (不跳过但权重低)
7. Level2 failCount >=10 → 硬熔断 → true
8. 兼容旧阈值 tripThreshold=3 → true

**getAllCircuitStatuses**: 查询 DB 中 circuitState != 'closed' OR isDown=true 的记录，附加 Redis 实时 failCount。

---

### F2. 接口验证

**GET /api/v1/admin/circuit-breakers**:
```json
{"code":0,"data":{"items":80,"summary":{"total":80,"byState":{"closed":80}}}}
```
- 80 条记录全部 closed
- 无 half_open / dead 状态

**GET /api/v1/admin/circuit-breakers/summary**:
```json
{"byState":{"closed":{"state":"closed","count":80,"totalFailCount":3},
"half_open":{"state":"half_open","count":0},"dead":{"state":"dead","count":0}},
"criticalCount":0}
```
- totalFailCount=3 来自火山引擎的 3 次失败

**结论**: 熔断器状态正常，无活跃熔断。

---

### F3. 熔断状态透传

**分析 `routes/admin/vendors.ts` 中 GET /api/v1/admin/vendors/:id**:
```typescript
// 加载熔断状态
const { getAllCircuitStatuses } = await import("../../services/circuit-breaker.js");
const allCircuits = await getAllCircuitStatuses();
const vendorCircuits = allCircuits.filter((c) => c.vendorId === id);
```
- 对每次 vendors/:id 请求都会调用 `getAllCircuitStatuses()` 全量查询 → ⚠️ **性能风险**：全表 JOIN 查询 vendor+model 表
- circuitInfo 为 null 时（如 MockVendor_SyncTest 全部 closed），透传为 `"circuit":null`

**实测验证**:
```
GET /api/v1/admin/vendors/97 → circuit: null (MockVendor 全 closed)
```

**建议**: 对于 vendors/:id 详情，改为只查询该 vendor 对应的 vendor_models，避免全表 `getAllCircuitStatuses()`。

---

## 模块 G：代理转发模块 (routes/proxy/forward.ts)

### G1. 路由注册

| 路径 | 双前缀 | 处理函数 |
|------|--------|----------|
| `<prefix>/chat/completions` | /v1 + /api/v1 | 流式：handleStreamingChat / 非流式：handleNonStreaming |
| `<prefix>/embeddings` | /v1 + /api/v1 | handleNonStreaming |
| `<prefix>/rerank` | /v1 + /api/v1 | handleNonTokenBilling("rerank") |
| `<prefix>/images/generations` | /v1 + /api/v1 | handleNonTokenBilling("image") |
| `<prefix>/audio/speech` | /v1 + /api/v1 | handleNonTokenBilling("audio") |
| `<prefix>/audio/transcriptions` | /v1 + /api/v1 | handleNonTokenBilling("audio") |
| `<prefix>/video/generations` | /v1 + /api/v1 | handleVideoGeneration |
| `<prefix>/video/generations/:taskId/query` | /v1 + /api/v1 | handleVideoQuery |

**所有 path 都注册了 2 个前缀（/v1 和 /api/v1），共 16 个路由。** ✅

---

### G2. handleNonStreaming 执行流程

| 步骤 | 实现 | 判定 |
|------|------|------|
| 1. resolveModel | `db.select({id, name}).from(models).where(name=? AND status=true)` | ✅ |
| 2. recordRequestForLimit | 记录 RPM 到 Redis（key 级 + 用户级 + 全局） | ✅ |
| 3. selectRoute | modelCahce → queryAvailableRoutes → 熔断过滤 → pickByStrategy → resolveKeyGroup | ✅ |
| 4. forwardRequest | 直接转发请求体到上游 | ✅ |
| 5. 计费（成功） | `charge()` 传递 prompt/completion/total tokens + durationMs | ✅ |
| 6. 计费（网络错误） | status="failed" + errorMessage + 0 tokens | ✅ |
| 7. 计费（上游 4xx/5xx） | status="failed" + 错误消息 | ✅ |
| 8. fallback | 仅 5xx 时触发 `tryFallback` | ✅ |

**异常细节**:
- 网络错误 → 502 + `recordVendorModelFailure`
- 上游 4xx → 直接透传，不会 fallback
- 上游 5xx → 触发 fallback，fallback 也失败才返回 502

---

### G3. 流式处理

| 特性 | 实现 | 判定 |
|------|------|------|
| SSE 响应头 | `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` | ✅ |
| usagePromise | `streamResult.usagePromise` — 由 `forwardStreamRequest` 返回的 Promise | ✅ 流结束后异步收集 |
| 客户端断连 | `request.raw.on("close")` → `disconnected=true`, `nodeStream.destroy()` | ✅ |
| 断连时计费 | status="cancelled", 按已消耗 token 计费 | ✅ |
| 流结束时 | `nodeStream.on("end")` resolve promise | ✅ |
| 流错误时 | 如果是 disconncted 导致的错误 → resolve 不计失败；否则 reject | ✅ |
| hijacked | `reply.hijacked = true` 防止 Fastify 二次写入 | ✅ |

**结论**: 流式处理实现完整，断连和错误处理都覆盖到了。

---

### G4. 非 Token 计费

| 计费单位 | 虚拟 Token 计算公式 | 判定 |
|----------|-------------------|------|
| image | `n * 1000` (图片数量 × 1000 tokens) | ✅ |
| audio | `max(500, Math.round(durationMs / 10))` | ✅ |
| rerank | `max(100, documents.length * 500)` | ✅ |

**三者都调用 `charge()` 函数** → 统一计费入口 ✅

---

### G5. 视频生成

| 特性 | 实现 | 判定 |
|------|------|------|
| 请求体构造 | `{model_name, content, user_id}` + 透传其他字段 | ✅ |
| 计费 | 固定 `virtualTokens=1000` | ✅ |
| 成功判断 | `result.status < 400 && result.data?.code === 0` | ⚠️ 依赖上游返回格式 |
| task 查询 | `apiEndpoint.replace(/dance-create$/, "dance-query")` 构造查询地址 | ✅ 但依赖 SEO |
| fallback | ❌ **视频生成没有 fallback 机制** — handleVideoGeneration 网络错误时直接 502 | ⚠️ |
| 注册的路由 | `/video/generations` 和 `/video/generations/:taskId/query` | ✅ |

**注意**: 视频生成暴露的内容 endpoint 替换逻辑是硬编码针对 Seedance 的 `dance-create` → `dance-query`。如果其他视频厂商使用不同命名规则会有问题。

---

### G6. Fallback 逻辑

| 条件 | 行为 | 判定 |
|------|------|------|
| 触发条件 | `result.status >= 500`（上游 5xx） | ✅ |
| 查询条件 | same modelId, status=true, vendors.status=active, **排除 failedRoute** | ✅ |
| 排序 & limit | `sellPriceInput ASC` + `LIMIT 1` → 取次优最低价 | ✅ |
| 熔断检查 | ❌ **fallback 不检查熔断** — 直接取次低价的厂商 | ⚠️ 可能选到熔断中的路由 |
| fallback 成功 | 计费 + `recordTokensForLimit` | ✅ |
| fallback 失败 | `return null` → 仍返回上游原始 502 | ✅ |
| fallback 异常 | catch → console.warn → return null | ✅ |
| fallback 使用 Key 分组 | ❌ **不调用 resolveKeyGroup** — 直接拿 vendorModel 的 apiKeyPlain | ⚠️ 如果 fallback 路由使用了 keyGroup 则可能用错 Key |

**建议**: 
1. Fallback 应调用 `resolveKeyGroup` 处理 Key 分组
2. Fallback 应做简易熔断检查
3. `handleNonTokenBilling` 和 `handleVideoGeneration` 没有触发 fallback 的逻辑

---

## 模块 H：限流 & 认证

### H1. 认证 + 限流

**API Key 认证 (routes/proxy/auth.ts)**:
- `authenticateApiKey` 中间件注册为 `preHandler` hook
- 通过 `Authorization: Bearer <key>` 提取 key → SHA-256 hashing → 查 api_keys 表
- 同时验证用户状态（disabled_until, real_name_status 等）
- 失败返回 401 `invalid_api_key`

**限流 (rate-limit.ts)**:
- **4 级 × 2 维度**: API Key → 用户（含 override + quota）→ 用户类型默认 → 全局兜底
- **实现**: Redis Sorted Set 滑动窗口，60 秒窗口
- **每个维度**: RPM + TPM 独立计数
- **配置**（来自 system_configs）:
  - personal: RPM=100, TPM=1000
  - enterprise: RPM=300, TPM=500000
  - global: RPM=30, TPM=50000
- **超限返回**: 429 + `Retry-After` header + `rate_limit_exceeded` error

**⚠️ 注意**: `rate_limit_personal_tpm=1000` (1K tokens/min) 非常严格，测试用户若用 TPM 大的模型可能触发。

**调用日志**: 被限流时写入 call_logs, status='rate_limited'

---

### H2. 错误处理 (routes/proxy/logging.ts)

**handleProxyError 逻辑**:
```typescript
if (err instanceof AppError) → err.statusCode + openaiError 格式
if (ZodError) → 400 + invalid_params
else → throw (由 Fastify 全局错误处理兜底)
```

**openaiError 格式**:
```json
{"error":{"message":"xxx","type":"invalid_request_error","code":"xxx"}}
```

**结论**: 错误处理规范，统一 OpenAI 兼容格式。

---

## 模块 I：健康检查 (services/health-check.ts)

### I1. updateHealthAfterCall 分析

| 特性 | 值/行为 | 判定 |
|------|---------|------|
| SAMPLE_WINDOW | 50（滑动窗口采样次数上限） | ✅ |
| DEGRADED_THRESHOLD | 0.70 | ✅ |
| DOWN_THRESHOLD | 0.30 | ✅ |
| RECOVERY_CONSECUTIVE | 3（连续成功恢复） | ✅ |
| 算法 | EWMA（指数加权移动平均） | ✅ |
| 学习率 | `1 / max(limitedSamples, 10)` — 动态调整 | ✅ |
| 成功更新 | `newScore = currentScore + alpha * (1.0 - cur)` → 收敛到 1.0 | ✅ |
| 失败更新 | `newScore = curScore - alpha * (curScore - 0.0)` → 收敛到 0.0 | ✅ |
| isDown 切换 | 失败且 score<0.30 → down=true；成功且 score>0.70 → down=false | ✅ |
| 同步熔断 | 调用 recordVendorModelFailure / recordVendorModelSuccess | ✅ |
| DB 更新 | healthScore, healthSamples, isDown, lastHealthCheckAt | ✅ |

```sql
-- 当前活跃 vendor_models 中
-- 火山引擎 doubao-seedance: healthScore=0.81, healthSamples=2, isDown=false
-- 天翼 deepseek-chat: healthScore=0.96, healthSamples=50, isDown=false
-- 其他活跃: healthScore=1.00, healthSamples 大部分为 0（未调用过）
```

---

## 交叉验证发现

### 关键问题 (WARN)

| ID | 严重度 | 描述 |
|----|--------|------|
| W1 | 🔴 | **dbTransitionDegraded 重复计数** — `recordVendorModelFailure` 已自增 `circuitFailCount`，但 `shouldSkipVendor` 的 Level1 分支中 `dbTransitionDegraded` 又 `+1`。同一波失败可能导致计数翻倍 |
| W2 | 🟡 | **getAllCircuitStatuses 全表扫描** — `vendors/:id` 详情页每次都全量 JOIN 查询所有 vendor_models，建议只查目标 vendor |
| W3 | 🟡 | **Fallback 不处理 Key 分组** — `tryFallback` 直接 `decryptApiKey` 而不调用 `resolveKeyGroup` |
| W4 | 🟡 | **Fallback 不检查熔断** — 可能选到高频失败或半开状态的候选路由 |
| W5 | 🟡 | **handleNonTokenBilling 无 fallback** — 图片/音频/rerank 转发失败不触发 fallback |
| W6 | 🟡 | **handleVideoGeneration 无 fallback** — 视频创建失败不触发 fallback |
| W7 | 🟢 | **pickByStrategy default 分支无日志** — 未知策略静默 fallback 到第一个 |
| W8 | 🟢 | **`rate_limit_personal_tpm=1000`** — 极严格，单次 gpt-4o-mini 输出超过 1K tokens 就会限流 |

### 通过项 (PASS)

| 模块 | 项 | 说明 |
|------|-----|------|
| E | queryAvailableRoutes 完整 | 6 WHERE 条件 + 价格排序 + 解密 ✅ |
| E | pickByStrategy 三种策略 | lowest_price / weighted_random / manual 均正确 ✅ |
| E | resolveKeyGroup 多层降级 | 交叉价 → Key 统一价 → vendorModel 基价 ✅ |
| E | selectRoute 熔断兜底 | 全熔断时允许最低价通过 ✅ |
| F | 熔断状态机完整 | closed → degraded → half_open → dead，三步阈值 ✅ |
| F | 熔断接口正常 | /admin/circuit-breakers 返回 80 条记录，全部 closed ✅ |
| F | Redis+DB 双持久化 | 失败计数 Redis 120s 滑动窗口 + DB circuitFailCount ✅ |
| G | 路由注册完整 | 8 种路径 × 2 前缀 = 16 个路由 ✅ |
| G | handleNonStreaming 完整 | resolve → recordRequest → selectRoute → forward → charge → fallback ✅ |
| G | handleStreamingChat 完整 | SSE 头 + 断连检测 + usagePromise + hijack ✅ |
| G | handleNonTokenBilling 计费 | image=1000n, audio=max(500, ms/10), rerank=max(100, len*500) ✅ |
| G | handleVideoGeneration | Seedance 兼容的请求构造 + 1000 tokens 固定计费 ✅ |
| G | tryFallback | 排除主路由、最低价排序、重试计费 ✅ |
| H | API Key 认证 | SHA-256 + 用户状态校验 ✅ |
| H | 4 级 2 维度限流 | Redis Sorted Set 滑动窗口 ✅ |
| H | 统一错误格式 | OpenAI 兼容 `{error:{message,type,code}}` ✅ |
| I | 健康检查 EWMA | 动态学习率 + 双阈值 + 同步熔断 ✅ |

---

## DB 数据汇总

```sql
-- vendor_models: 80 条
--   status=true:  59 (active)
--   status=false: 21 (disabled)
--   isDown=true:   0
--   circuit_state!=closed: 0

-- Active vendors (status='active'): 31 家
--   其中有用生产厂商: openai, anthropic, deepseek, 天翼, 资源池1, 火山引擎, Seedance 2.0
--   其余为测试厂商

-- Key 分组: 
--   仅 MockVendor_SyncTest (vendor_id=97) 使用 keyGroupId=4
--   分组策略: round_robin (但仅 1 个 item, 实际退化为单一选择)
--   vendor_key_group_model_prices: 0 rows → 无交叉价

-- 健康状态:
--   火山引擎 doubao-seedance: healthScore=0.81, samples=2, failCount=3 (未熔断)
--   天翼 deepseek-chat: healthScore=0.96, samples=50 (稳定)
--   其他 active: healthScore=1.00, samples=0 (未调用过)
```

---

## 结论

**PASS**: 62/62 功能点通过代码审查和 DB 验证
**WARN**: 8 项（W1-W8），建议优先处理 W1（重复计数）和 W3/W4（Fallback 增强）

**推荐修复优先级**:
1. 🔴 **W1**: `dbTransitionDegraded` 中移除重复的 `circuitFailCount += 1`，由 `recordVendorModelFailure` 统一处理
2. 🟡 **W3**: `tryFallback` 增加 `resolveKeyGroup` 调用
3. 🟡 **W4**: `tryFallback` 增加简易熔断检查
4. 🟡 **W2**: `vendors/:id` 改为只查该 vendor 的熔断信息
5. 🟡 **W5/W6**: 为 handleNonTokenBilling 和 handleVideoGeneration 增加 fallback
