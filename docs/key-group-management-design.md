# Key 分组管理 — 功能设计方案

> 版本：v1.0 | 更新：2026-07-17 | 状态：设计稿

---

## 1. 背景与定位

### 1.1 业务问题

3cloud 作为 AI Token 聚合平台，对接多家模型供应商（DeepSeek、OpenAI、Claude 等）。每家供应商可能有**多个 API Key**，需要：

- **管理维度**：几十上百个 Key 如何组织？按用途、等级、区域分类。
- **路由维度**：一个模型通道如何负载均衡、故障转移？
- **费用维度**：不同 Key 可能有不同的成本价和渠道价。
- **健康维度**：Key 级熔断检测，自动摘除失活的 Key。

### 1.2 定位

**Key 分组管理**是连接「供应商」与「模型通道」的中间层：

```
供应商 (Vendors)
  └── Key 分组 (Vendor Key Groups) ← 本功能
        ├── Key 条目 (Key Items) × N
        └── 路由策略（轮询/加权/故障转移）
              ↓
        模型通道 (Vendor Models) — 引用 Key 分组
              ↓
        路由引擎 (Route Engine) — 运行时选 Key 转发
```

一句话：**对上游 API Key 进行池化管理，让路由引擎在运行时动态选择合适的 Key 转发请求。**

---

## 2. 数据模型

### 2.1 vendor_key_groups（分组表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| vendor_id | integer FK → vendors | 所属供应商 |
| name | varchar(100) | 分组名称（如"主池"、"备用池"） |
| strategy | varchar(20) | 路由策略（见 2.3） |
| description | text | 备注 |
| status | boolean | 启用/禁用 |
| created_at | timestamp | — |
| updated_at | timestamp | — |

**索引**：`(vendor_id)` 加速按厂商查询

### 2.2 vendor_key_group_items（分组条目表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| group_id | integer FK → vendor_key_groups | 所属分组（CASCADE 删除）|
| api_key_encrypted | text | AES-256-GCM 加密存储 |
| api_key_prefix | varchar(12) | 明文前缀（如 `sk-b82...`）|
| weight | integer | 权重（加权策略用）|
| priority | integer | 优先级（数值越小越高）|
| cost_price_input | numeric(18,6) | 专属成本价/输入（可选）|
| cost_price_output | numeric(18,6) | 专属成本价/输出（可选）|
| sell_price_input | numeric(18,6) | 专属售价/输入（可选）|
| sell_price_output | numeric(18,6) | 专属售价/输出（可选）|
| status | boolean | Key 开关 |
| is_down | boolean | 宕机标记（被动检测）|
| consecutive_failures | integer | 连续失败计数 |
| last_used_at | timestamp | 最后调用时间 |
| total_calls | integer | 累计调用次数 |
| success_calls | integer | 成功调用次数 |
| created_at | timestamp | — |

**索引**：`(group_id)` 加速按分组查询

### 2.3 路由策略枚举

| 策略值 | 名称 | 行为 |
|--------|------|------|
| round_robin | 轮询 | Redis INCR 计数器，`index % count` |
| weighted | 加权 | 按 weight 权重随机选 |
| failover | 故障转移 | 始终选 priority 最高的；失败后降级到次高 |
| priority | 优先级 | 始终选 priority 最高的 |

### 2.4 vendor_models 关联字段

`vendor_models` 表已有 `key_group_id` 字段：

```sql
key_group_id integer REFERENCES vendor_key_groups(id)
```

- `NULL`：该通道不使用 Key 分组，直接用 `vendor_models.api_key_encrypted`
- 非 `NULL`：路由引擎运行时从对应分组中动态选 Key

---

## 3. 后端 API 设计

### 3.1 分组 CRUD

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/admin/vendors/:vendorId/key-groups` | MODEL_MANAGE | 获取厂商的分组列表（含 keyCount） |
| POST | `/api/v1/admin/vendors/:vendorId/key-groups` | MODEL_MANAGE | 创建分组 |
| PATCH | `/api/v1/admin/key-groups/:groupId` | MODEL_MANAGE | 更新分组（name/strategy/description/status）|
| DELETE | `/api/v1/admin/key-groups/:groupId` | MODEL_MANAGE | 删除分组（校验未被 vendor_models 引用）|

### 3.2 分组内 Key 条目 CRUD

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/admin/key-groups/:groupId/items` | MODEL_MANAGE | 获取分组内 Key 列表 |
| POST | `/api/v1/admin/key-groups/:groupId/items` | MODEL_MANAGE | 新增 Key（加密存储 + 自动生成前缀）|
| PATCH | `/api/v1/admin/key-group-items/:itemId` | MODEL_MANAGE | 更新 Key 属性（weight/priority/价格等）|
| DELETE | `/api/v1/admin/key-group-items/:itemId` | MODEL_MANAGE | 删除 Key |
| POST | `/api/v1/admin/key-group-items/:itemId/test` | MODEL_MANAGE | 测试 Key 连通性 |

### 3.3 待补充 API（P1）

| 方法 | 路径 | 说明 |
|------|------|------|
| PATCH | `/api/v1/admin/key-groups/:groupId/toggle` | 一键启用/禁用整个分组 |
| PATCH | `/api/v1/admin/key-group-items/:itemId/toggle` | 一键启用/禁用单个 Key |
| POST | `/api/v1/admin/key-groups/:groupId/batch-import` | 批量导入 Key（JSON 数组）|
| POST | `/api/v1/admin/key-group-items/:itemId/reset-down` | 手动恢复宕机 Key |
| GET | `/api/v1/admin/key-groups/:groupId/stats` | 分组统计（总调用/成功率/平均延迟）|

---

## 4. 前端 UI 设计

### 4.1 页面结构（已实现）

```
┌─────────────────────────────────────────────────┐
│  Key 分组管理                                    │
│                                                  │
│  ┌─ 选择供应商 ───────────────────────────────┐  │
│  │  [下拉框 ▼] 请选择供应商                    │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌─────────── 资源池 ───────┐ ┌─── Key 列表 ────┐ │
│  │ [新建资源池]              │ │ [新增 Key]      │ │
│  │                          │ │                  │ │
│  │ ● 主池   轮询  5个Key  ✏️🗑️│ │ Key  权重 优先级 售价│ │
│  │ ● 备用池 故障转移 2Key ✏️🗑️│ │ sk-... 1   0    0.01│ │
│  │ ● 高优池 优先级  3Key  ✏️🗑️│ │ sk-... 2   1    0.02│ │
│  └──────────────────────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 4.2 交互流程

**选择供应商 → 左侧显示该厂商的资源池列表 → 点击池子 → 右侧显示 Key 列表**

#### 分组操作
- **创建**：Modal 表单 → 名称 / 路由策略 / 描述
- **编辑**：点击 ✏️ → 弹出预填 Modal
- **删除**：🗑️ → Confirm 弹窗 → 检查引用 → 级联删除 items

#### Key 操作
- **新增**：Modal → 输入 API Key（密码框） + 权重 + 优先级 + 可选价格覆盖
- **编辑**：Modal → 修改重量/优先级/价格
- **删除**：Confirm
- **测试连通性**：点击 ⚡ → POST 请求 → 弹窗显示结果

### 4.3 待补充 UI 改进（P1）

| 改进项 | 描述 |
|--------|------|
| 行内启用/禁用开关 | Key 条目行内 Toggle 开关，无需进 Modal |
| 批量导入 | 弹窗粘贴多行 Key / 上传 JSON 文件 |
| 搜索过滤 | 按 Key 名前缀搜索 |
| 统计指标 | 每个 Key 展示成功率、最近调用时间、延迟 |
| 分组状态切换 | 一键停用整个池 |
| 拖拽排序 | 调整优先级顺序 |

---

## 5. 路由引擎集成

### 5.1 运行时选 Key 流程

```
请求到达 → resolveModelId → queryAvailableRoutes
  → 熔断过滤 → 策略选择（1条 vendorModel）
  → resolveKeyGroup（判断 keyGroupId）
      ├── NULL → 直接用 vendorModel 的 apiKeyPlain
      └── 非NULL → selectKeyFromGroup(groupId, redis)
            ├── round_robin → redis.incr % count
            ├── weighted → Math.random * totalWeight
            ├── failover → items[0]（按 priority ASC）
            └── priority → items[0]（同 failover）
  → 解密 apiKeyPlain → 转发请求
```

### 5.2 价格覆盖逻辑

```
选定 Key 后判断：
  keyItem.sellPriceInput / sellPriceOutput 非空？
    → YES: 优先使用 Key 级专属售价
    → NO:  沿用 vendorModels 的 sellPrice
  （同理解 costPrice）
```

### 5.3 健康检测

- **被动检测**：转发失败时 `consecutive_failures++`，超阈值自动 `isDown=true`
- **主动检测**：管理员手动点击"测试连通性"按钮
- **恢复机制**：管理员手动 `reset-down`，或定时巡检自动恢复（待实现）

---

## 6. 功能矩阵（当前状态 vs 规划）

### ✅ 已实现

| 模块 | 状态 |
|------|------|
| 分组 CRUD（增删改查） | ✅ 完整 |
| Key 条目 CRUD（增删改查） | ✅ 完整 |
| 加密存储（AES-256-GCM） | ✅ |
| 4 种路由策略 | ✅ round_robin/weighted/failover/priority |
| 全局 Key 连通性测试 | ✅ |
| 价格覆盖机制 | ✅ |
| 全局状态标记（isDown） | ✅ |
| 路由引擎集成 | ✅ |
| 调用计数 | ✅ |

### 🔄 待实现（P1 — 下一轮）

| 模块 | 优先级 | 说明 |
|------|--------|------|
| 行内启用/禁用开关 | P1 | 每条 Key 可快速切换，无需弹窗 |
| 批量导入 Key | P1 | 一次性导入 10-100 个 Key |
| 搜索/过滤 | P1 | 按前缀、状态搜索 |
| Key 详情统计 | P1 | 成功率、平均延迟、趋势图表 |
| 分组级状态开关 | P1 | 一键停用整个分组 |
| 审计日志 | P1 | 增删改 Key 记录审计日志 |
| 分组健康看板 | P1 | 所有分组一览展示宕机 Key 数量 |

### 📋 待讨论（P2）

| 功能 | 说明 |
|------|------|
| 自动健康巡检 | 后台定时任务自动检测宕机 Key 并恢复 |
| Key 到期提醒 | Key 过期前自动通知 |
| 用量配额 | Key 级月度调用上限 |
| 成本分摊 | 按 Key 维度统计成本归属 |
| 分组克隆 | 一键复制另一厂商的分组配置 |

---

## 7. 实现建议

### 7.1 增量改进顺序

```
Phase 1 — 快速优化（1-2天）
  1. 行内启用/禁用开关（Key 行 + 分组行）
  2. 搜索过滤（Key 前缀搜索）
  3. 审计日志补充

Phase 2 — 效率提升（2-3天）
  4. 批量导入 Key
  5. 分组级状态开关
  6. Key 详情统计（调用次数、成功率）

Phase 3 — 运维增强（3-5天）
  7. 所有分组健康看板（聚合视图）
  8. 自动健康巡检（定时任务）
```

### 7.2 安全注意事项

- API Key 全程 AES-256-GCM 加密，数据库无明文
- 前端 Key 输入使用 `type="password"`，创建后不可回显
- 连通性测试临时解密，不暴露完整 Key
- 路由链路：解密仅在查询时执行，不缓存明文

---

## 8. 关联功能

| 关联功能 | 关系 |
|---------|------|
| 供应商管理 | 分组属于供应商，新增/删除供应商时级联 |
| 模型映射 (vendor_models) | 通道引用 `keyGroupId` 绑定分组 |
| 路由引擎 | 运行时从分组选 Key |
| 熔断器 | Key 级 `isDown` + vendorModel 级 `isDown` 两级熔断 |
| 审计日志 | 记录 Key 增删改等敏感操作 |
| 加密服务 | `encryptApiKey` / `decryptApiKey` |

---

## 9. 总结

**Key 分组管理**是 3cloud 聚合路由能力的核心组件之一，当前已经实现了完整的 CRUD + 4 种路由策略 + 加密存储 + 运行时的 Key 动态选择。

下一阶段重点补齐 **P1 效率功能**（行内开关、批量导入、搜索过滤、统计指标），让运维管理 50+ Key 时不再需要逐个弹窗操作。
