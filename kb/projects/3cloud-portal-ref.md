# 3Cloud Portal 参考文档

> 最后更新：2026-07-28
> 版本：Complete（含 API 接口、组件 Props、运营场景逻辑）

---

## 一、概述

Portal 是 3Cloud 面向公众的官网门户，提供品牌展示、模型目录、定价查询、系统状态、API 文档等功能。  
**面向用户**：潜在注册用户、开发者、公网访客。  
**与后台（Admin Panel）的界限**：Portal 无需登录即可访问（文档页），部分页面（注册/登录）需身份认证，不包含管理操作。

### 1.1 路由结构

| 路径 | 页面组件 | 描述 |
|------|----------|------|
| `/` | `PortalHome` (Home.tsx) | 首页（Hero + 特性 + 流程 + 数据 + CTA） |
| `/models` | `PortalModels` (Models.tsx) | 模型目录（按类型/搜索筛选） |
| `/pricing` | `PortalPricing` (Pricing.tsx) | 透明定价表 |
| `/status` | `PortalStatus` (Status.tsx) | 系统运行状态 + 公告 |
| `/docs` | `PortalDocs` (Docs.tsx) | API 文档（含代码示例/错误码） |
| `/register` | `RegisterPage` （shared） | 用户注册（重定向到统一注册页） |
| `/login` | `LoginPage` （shared） | 用户登录 |

### 1.2 布局

`PublicLayout.tsx` → `<PortalHeader /> + <Outlet /> + <PortalFooter />`

- **PortalHeader**：固定顶部导航栏，滚动时半透明毛玻璃效果
  - 导航链接：首页 / 模型 / 定价 / 状态 / 文档
  - 右侧 CTA：**登录** + **免费注册**
  - 响应式折叠菜单（移动端 `<Menu /> / <X />`）
  - 自动同步站点品牌配置（`site_name`, `site_logo_url`, `site_favicon_url`）
- **PortalFooter**：深色底部，四栏链接 + 版权 + 公众号二维码 + ICP 备案 + 公安备案 + 自定义 HTML

### 1.3 站点配置（Portal 特有数据流）

```
前端: useSiteConfig() hook → GET /api/v1/site-config/public → 渲染 Header/Footer
后端: publicSiteConfigRoutes → site_* keys 白名单过滤
```

**公开暴露的 site_* keys（12 个）**：

```
site_name, site_logo_url, site_favicon_url, site_company_name,
site_icp, site_icp_link, site_police_icp, site_contact_email,
site_contact_phone, site_copyright, site_wechat_qr_url, site_footer_html
```

---

## 二、首页（PortalHome）

### 2.1 组件层级

```
PortalHome
├── HeroSection          ← 首屏大 Banner + 实时统计数字动画
├── FeatureGrid          ← 6 个核心特性卡片
├── HowItWorks           ← 三步使用流程
├── StatsBanner          ← 数据展示横幅（4 个统计项）
└── CTASection           ← 底部行动号召
```

### 2.2 HeroSection Props / 数据源

| 数据 | 来源 | 备注 |
|------|------|------|
| 站点名称 (`site_name`) | `useSiteConfig()` | 默认 "3Cloud" |
| 统计数字 (`models/users/tokens`) | `GET /api/v1/public/stats` | 前端动画计数（CountUp 组件） |
| CTA 链接 | React Router Link | `/register` + `/docs` |

**CountUp 组件特性**：
- 数字从 0 动画递增到目标值（1500ms duration，ease-out cubic）
- 只执行一次（`useRef` 防重复）

### 2.3 FeatureGrid

6 个特性卡片，静态数据（不依赖 API）：

| 特性 | 图标 | 描述 |
|------|------|------|
| 统一 API 接入 | Zap | 单 Key 所有模型，兼容 OpenAI SDK |
| 智能路由调度 | Route | 自动选最低价/最优供应商，故障切换 |
| 透明按量计费 | DollarSign | 精确到 1e-6，明细可见 |
| 多厂商聚合 | Layers | DeepSeek/OpenAI/Anthropic 等 |
| 企业级安全 | Shield | 限流/熔断/安全事件监控 |
| API Key 管理 | Key | 创建/用量/额度/团队共享 |

### 2.4 HowItWorks

三步流程（静态数据）：
1. 注册账号 → 2. 创建 API Key → 3. 开始调用

### 2.5 StatsBanner Props

| Prop | 类型 | 默认值 | 来源 |
|------|------|--------|------|
| models | number | 130 | GET /api/v1/public/stats |
| vendors | number | 40 | 同上 |
| users | number | 813 | 同上 |
| totalTokens | number | 595893775 | 同上 |

**统计格式化规则**（`fmtTokens`）：
- ≥ 1B → `"5.9B"`
- ≥ 1M → `"5.9M"`
- ≥ 1K → `"5.9K"`
- 否则原值

### 2.6 CTASection

- 纯展示组件，React.memo 优化
- CTA 按钮：`/register`

---

## 三、模型目录（PortalModels）

### 3.1 页面结构

```
PortalModels
  └── ModelCatalog       ← 核心组件
```

### 3.2 ModelCatalog Props / 状态

| 状态 | 类型 | 初始值 | 更新方式 |
|------|------|--------|----------|
| models | ModelCatalogItem[] | [] | GET /api/v1/models |
| loading | boolean | true | axios then/finally |
| error | string | '' | axios catch |
| activeTab | string | '' | 用户切换 |
| searchQuery | string | '' | 用户输入 |

### 3.3 数据模型

```typescript
interface VendorInfo {
  vendorId: number
  vendorName: string
  inputPrice: string      // 字符串数字，需 Number() 转换
  outputPrice: string
}

interface ModelCatalogItem {
  id: number
  name: string            // 模型名，如 "gpt-4o"
  displayName: string | null
  description: string | null
  type: string            // chat | embedding | image | audio | rerank | video | moderation | realtime
  vendors: VendorInfo[]
}
```

**API 端点**：`GET /api/v1/models`

### 3.4 类型筛选选项

| value | label | 图标 |
|-------|-------|------|
| '' | 全部 | null |
| chat | 对话 | MessageSquare |
| embedding | 嵌入 | Hash |
| image | 图像 | Image |
| audio | 音频 | Headphones |
| rerank | 重排序 | ArrowLeftRight |
| video | 视频 | Video |
| moderation | 审核 | Shield |
| realtime | 实时 | Clock |

### 3.5 运营场景逻辑

**供应商管理联动**：
- 模型目录展示各模型下所有供应商的价格（`model.vendors[]`）
- 每条目显示：供应商名称 + ¥输入价 / ¥输出价（精确到 6 位小数）
- **当某供应商下线时**：对应的 vendor entry 仍然展示但价格标记为旧数据——Portal 应当考虑在接口中增加 `vendorStatus` 字段（当前未实现）
- **价格变更后**：Portal 在下次刷新页面时自动获取最新价格（非实时推送）

**运营注意事项**：
- 模型数量 130+ 时触发懒加载性能优化（当前未分页，全部加载到前端筛选）
- `activeTab` + `searchQuery` 组合筛选在内存中执行（`useMemo`）
- 若某类型模型为空，Tab 仍然显示但计数为 0

---

## 四、定价页面（PortalPricing）

### 4.1 页面结构

```
PortalPricing
├── PricingTable        ← 价格表格
├── BillingNote         ← 计费说明（静态）
└── PricingFaq          ← FAQ 组件
```

### 4.2 PricingTable

**数据源**：`GET /api/v1/models`（复用模型列表接口）

**表格结构**：

| 列 | 说明 |
|----|------|
| 模型 | 名称 + displayName（可选） |
| 供应商 | 供应商名称 |
| 输入价格 | ¥每 1K tokens，6 位小数 |
| 输出价格 | ¥每 1K tokens，6 位小数 |

**实现细节**：
- `flatRows = models.flatMap(m => m.vendors.map(v => ...))`
- 每行唯一 key = `${model.id}-${vendor.vendorId}`
- 大量数据时（130 模型 × 多供应商 ≈ 300+ 行）表格可横向滚动

### 4.3 PricingFaq

FAQ 组件，静态内容。当前常见问题：
- 如何计费？（按 Token 消耗，输入输出分别计价）
- 充值方式？（微信/支付宝/对公转账/兑换码）
- 账单周期？（实时计费）
- 未使用余额是否可退？（详见退款策略）

### 4.4 运营场景逻辑

**财务管理核算联动**：
- Portal 展示的是**面向用户的零售价**，与后台管理的**供应商成本价**不同
- 价格在管理端配置（`admin/prices.ts` + `admin/vendor-models.ts`），Portal 只读消费
- **价格发布时序**：
  1. 管理员在后台设置/调整某模型的某供应商价格
  2. `vendor_models` 表更新 `input_price` / `output_price`
  3. Portal 下次请求 `GET /api/v1/models` 时自动拉取新价格
  4. 无需手动发布或清缓存（API 无缓存或短缓存）
- **隐藏模型**：管理端可将模型置为 `status='disabled'`，此时不返回给 Portal（当前实现需确认）

**对账影响**：
- Portal 定价数据是**用户计费的依据**
- 后台 `call_logs` 计费时以 `vendor_models` 价格为准
- 如需促销（临时折扣），应通过管理员调整价格或使用活动/兑换码机制，而非修改 Portal 显示

---

## 五、系统状态页（PortalStatus）

### 5.1 API 定义

**`GET /api/v1/public/status`**

```typescript
// Response
interface SystemStatusResponse {
  code: 0
  data: {
    status: 'operational' | 'degraded' | 'major_outage'
    updatedAt: string          // ISO 8601
    services: ServiceItem[]
    announcements: AnnouncementItem[]
    stats: {
      totalUsers: number
      totalModels: number
      totalVendors: number
    }
  }
}

interface ServiceItem {
  name: string
  status: 'operational' | 'degraded' | 'major_outage'
  description: string
}

interface AnnouncementItem {
  id: number
  title: string
  type: 'maintenance' | 'incident' | 'announcement'
  content: string | null
  createdAt: string
}
```

### 5.2 后端实现细节

**健康检查逻辑**：

| 服务 | 检测方式 | 状态映射 |
|------|----------|----------|
| Redis | `redis.ping()` 返回 "PONG" | operational / major_outage |
| Database | `db.execute("SELECT 1")` | operational / major_outage |
| API 服务 | 静态 "operational" | 运行中 |
| WebSocket | 静态 "operational" | 运行中 |
| 模型网关 | 静态 "operational" | 运行中 |

**整体状态规则**：`dbOk && redisOk ? "operational" : "degraded"`

**公告查询**：
- 来源：`announcements` 表
- 条件：`status='published'` AND `publishAt <= now` AND `expireAt >= now`
- 排序：`createdAt DESC`，限制 10 条

**统计数据（fallback）**：
- users: 从 `users` 表 COUNT（默认 813）
- models: 从 `models` 表 COUNT（默认 130）
- vendors: 从 `vendors` 表 WHERE `status='active'`（默认 40）

### 5.3 前端状态渲染

| 状态 | 标签 | 颜色 | 图标 |
|------|------|------|------|
| operational | 正常运行 | 绿色 | CheckCircle2 |
| degraded | 部分异常 | 琥珀色 | AlertCircle |
| major_outage | 服务中断 | 红色 | XCircle |

### 5.4 运营场景逻辑

**告警/运维联动**：
- Portal 状态页是**用户侧**的可见状态，不同于后台运维监控的告警规则
- **故障响应流程**：
  1. 运维发现服务异常（后端告警规则 → 通知管理员）
  2. 运维在后台发布公告（`admin/announcements` → `type='incident'`）
  3. Portal 状态页自动展示公告
  4. 修复后关闭公告
- **定期维护**：提前通过 `type='maintenance'` 公告通知用户
- 状态页**不反映**供应商侧的状态（如 DeepSeek 自身服务异常），仅显示 3Cloud 基础设施健康度

---

## 六、API 文档页（PortalDocs）

### 6.1 页面结构

```
PortalDocs
├── SearchBar           ← 搜索文档章节
├── Sidebar             ← 左侧导航（桌面固定 + 移动端选项卡）
└── ContentRenderer     ← 内容渲染器（6 个章节切换）
```

### 6.2 文档章节定义

```typescript
interface DocSection {
  id: string
  label: string
  icon: LucideIcon
}

const sections: DocSection[] = [
  { id: 'models',  label: '模型列表',    icon: Cpu },
  { id: 'access',  label: '接入方式',    icon: LinkIcon },
  { id: 'pricing', label: '定价收费',    icon: DollarSign },
  { id: 'usage',   label: '使用指南',    icon: BookOpen },
  { id: 'codes',   label: '代码示例',    icon: Code },
  { id: 'errors',  label: '错误码参考',  icon: AlertCircle },
]
```

### 6.3 ContentRenderer 章节列表

| section id | 组件 | 数据源 | 说明 |
|------------|------|--------|------|
| models | ModelsSection | GET /api/v1/models | 模型名 + 类型 + 供应商 |
| access | AccessSection | baseUrl（props） | API Base URL + 认证 + 请求格式 |
| pricing | PricingSection | GET /api/v1/models | 价格表格（同 PricingTable） |
| usage | UsageSection | 静态 | 5 步使用指南 |
| codes | CodeSection | baseUrl（props） | Python/JS/cURL 代码示例 |
| errors | ErrorCodesSection | GET /api/v1/public/error-codes | 错误码搜索/筛选/展开详情 |

### 6.4 错误码 API

**`GET /api/v1/public/error-codes`**
- Query: `category`, `search`, `severity`
- 返回：`{ categories, errorCodes, total }`

**`GET /api/v1/public/error-codes/:code`** — 单条详情
**`GET /api/v1/public/error-codes/categories`** — 分类统计

```typescript
interface ErrorCodeDefinition {
  code: string
  message: string
  description: string
  severity: 'error' | 'warning' | 'info'
  category: string
  solution: string
}
```

### 6.5 运营场景逻辑

**Portal 文档的内容维护**：
- 模型列表/定价章节 → **自动从数据库生成**，无需手动更新
- 接入方式/代码示例/使用指南 → **静态内容**，需手工编辑 `ContentRenderer.tsx`
- 错误码参考 → **自动从 `error-codes.ts` 常量生成**，新增错误码时自动同步

**文档更新建议**：
- 新增模型/供应商 → 自动生效
- 修改接入方式（如新增 SDK）→ 编辑 `CodeSection` 组件
- 修改错误码 → 编辑 `api/src/constants/error-codes.ts`

---

## 七、公开 API 总览

### 7.1 公共接口

| 端点 | 方法 | 认证 | 缓存 | 说明 |
|------|------|------|------|------|
| `/api/v1/public/stats` | GET | 无 | Redis 5min | 首页统计数据 |
| `/api/v1/public/status` | GET | 无 | 无 | 系统状态 + 公告 |
| `/api/v1/public/error-codes` | GET | 无 | 无 | 错误码列表 |
| `/api/v1/public/error-codes/:code` | GET | 无 | 无 | 错误码详情 |
| `/api/v1/public/error-codes/categories` | GET | 无 | 无 | 错误码分类 |
| `/api/v1/site-config/public` | GET | 无 | 无 | 站点品牌配置 |

### 7.2 半公开接口（需要 API Key 但不限角色）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/models` | GET | 模型目录（含价格），Portal 所有页面均调用 |

---

## 八、组件 Props 汇总

### 8.1 Portal 组件

| 组件 | Props | 说明 |
|------|-------|------|
| QuickConnectPanel | `apiKeys: ApiKey[]`, `baseUrl: string`, `defaultModel: string` | 用户仪表盘内组件，不在 Portal 页面中 |
| PricingTable | 无（内部状态 GET /api/v1/models） | — |
| ModelCatalog | 无（内部状态） | — |
| StatsBanner | 无（内部状态） | — |
| HeroSection | 无（内部状态） | 使用 `useSiteConfig()` |
| PortalHeader | 无 | 使用 `useSiteConfig()` |
| PortalFooter | 无 | 使用 `useSiteConfig()` |
| ContentRenderer | `activeSection`, `models`, `loading`, `error`, `baseUrl`, `errorCodes`, `errorCodesLoading`, `errorCodesError` | Docs 内 |
| SearchBar | `value`, `onChange` | Docs 内 |
| Sidebar | `sections`, `activeSection`, `onSectionChange`, `searching` | Docs 内 |

### 8.2 共享 Hook

| Hook | 返回 | 用途 |
|------|------|------|
| `useSiteConfig()` | `{ config: Record<string,string> | null, loading: boolean }` | 站点品牌配置 |

---

## 九、Portal 与各业务模块的关系

### 9.1 供应商管理

| Portal 影响 | 说明 |
|-------------|------|
| 首页统计 | `vendors` 表 COUNT（`stats.ts`） |
| 模型目录 | 展示每个模型的供应商选项及价格 |
| 定价页 | 展示每个模型的供应商组合定价 |

**运营要点**：
- 供应商下线需通知 Portal 数据源（更新 `vendor_models` 价格或标记 `vendors.status`）
- 新增供应商不需要任何 Portal 代码变更

### 9.2 用户运营

| Portal 影响 | 说明 |
|-------------|------|
| 首页统计 | `users` 表 COUNT |
| 注册引导 | 从 Portal 注册页面 → 创建用户 → 充值 → API Key → 调用 |
| 状态页 | 展示所有注册用户总数 |

**运营要点**：
- Portal 注册流程是用户漏斗的起点
- 用户增长数据自动反映在首页 `StatsBanner`

### 9.3 代理商体系

| Portal 影响 | 说明 |
|-------------|------|
| 当前 Portal 不含代理商内容 | 代理商有独立的代理端仪表盘（非 Portal） |
| 潜在扩展 | 可在 Portal 增加「代理商加盟」页面 |

### 9.4 财务管理核算

| Portal 影响 | 说明 |
|-------------|------|
| 定价页面 | 直观展示各模型零售价，是用户侧计费的参考基准 |
| 充值 | 通过 `/register` + 充值页面完成，Portal 作为入口 |
| 兑换码 | 用户在 Portal 注册后使用兑换码充值（`POST /api/v1/redemption/redeem`） |

**运营要点**：
- 零售价与成本价的差额 = 平台毛利
- Portal 定价表是用户接受价格的依据，调价需及时同步
- 汇率相关的模型定价问题需关注（外币模型按固定汇率折算）

### 9.5 激活码兑现（兑换码）

| Portal 影响 | 说明 |
|-------------|------|
| Portal 文档 | 使用指南中包含「充值」步骤（提到兑换码） |
| 用户侧调用 | `POST /api/v1/redemption/redeem`（需登录 + API Key 认证） |

**兑换码运营侧详述**：
- **创建**：管理端 `admin/redemption-enhanced/`（批量生成 + 导出 CSV + 风险操作）
- **分发**：通过公告/活动/代理商分发
- **兑换**：用户在 Portal 注册后，通过用户端「兑换码」功能使用
- **风控**：`redemption-fraud/` 模块负责防刷（IP 限流 5 次/分钟 + 幂等 + 异常检测）
- **防刷策略**：
  - IP 限流：Redis incr + expire 60s，每分钟 5 次
  - 幂等：`X-Idempotency-Key` Header
  - 风控检查：`checkRedeemFraud()` 检查 IP 是否在黑名单、用户频率是否异常
  - 暴力破解记录：`recordBruteForce()` 记录无效兑换码尝试
  - 码泄露检测：`recordCodeLeak()` 记录兑换码被尝试的 IP

---

## 十、部署与运维

### 10.1 API 缓存策略

| 接口 | 缓存 | 使用场景 |
|------|------|----------|
| `/api/v1/public/stats` | Redis 5 分钟 TTL | 首页统计数字可接受 5 分钟延迟 |
| `/api/v1/public/status` | 无缓存 | 系统状态需准实时 |
| `/api/v1/models` | 无缓存或短缓存 | 价格变更需即时反映 |

### 10.2 性能考量

- **模型目录搜索**：前端全量筛选（130 模型 × ≤3 供应商 ≈ 390 行），在客户端内存中完成
- **价格表格**：`flatRows` 完全客户端生成，无额外网络请求
- **首页统计**：`useEffect` + fetch，`CountUp` 动画仅首屏执行一次

### 10.3 环境配置

- Portal 的 `baseUrl` 动态获取：`window.location.protocol + window.location.hostname`
- 生产环境通过 Nginx 反向代理到 API 后端
- 开发环境通过 Vite proxy（`/api/` 前缀）代理到 `localhost:3000`

---

## 十一、潜在改进项

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 供应商状态标记 | 中 | 模型目录展示供应商是否在线 |
| 模型搜索分页 | 低 | 模型超过 200 时需后端分页 |
| 价格历史趋势图 | 低 | 在定价页面展示价格变化 |
| Portal 国际化 | 低 | 多语言支持 |
| Portal 缓存策略 | 低 | `models` 接口增加短缓存减少数据库查询 |
| 代理商加盟页面 | 低 | 增加代理商注册入口 |
| 系统状态 WebSocket 推送 | 低 | 实时推送状态变化而非手动刷新 |
