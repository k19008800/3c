# 3cloud 系统架构概览

> **最后更新**：2026-08-12
> **版本**：v1.0
> **定位**：系统架构、部署架构、数据流、模块依赖关系的可视化参考

---

## 一、系统架构总览

```mermaid
graph TB
    subgraph 客户端
        UI[Web 前端<br/>React + Vite]
        SDK[用户 SDK<br/>OpenAI 兼容]
        AGENT[代理端<br/>React]
        VENDOR[供应商端<br/>React]
        ADMIN[管理员端<br/>React]
    end

    subgraph 接入层
        NGX[Nginx 反向代理<br/>SSL/TLS + 负载均衡]
        WS[WebSocket<br/>实时推送]
    end

    subgraph 应用层
        API[Fastify API<br/>PM2 Cluster]
        AUTH[认证服务<br/>JWT + 2FA]
        RATE[限流引擎<br/>四级限流]
        RT[路由引擎<br/>加权轮询 + 熔断器]
        BILL[计费引擎<br/>定价 + 计费 + 账单]
    end

    subgraph 业务层
        USER[用户管理]
        AGENT_SVC[代理商服务]
        FINANCE[财务管理]
        SECURITY[安全风控]
        VENDOR_SVC[供应商管理]
        CAMPAIGN[营销活动]
        NOTIFY[通知服务]
        MONITOR[监控告警]
    end

    subgraph 数据层
        PG[(PostgreSQL 17<br/>主数据库)]
        REDIS[(Redis<br/>缓存 + 限流)]
        FS[文件存储<br/>图片/文件]
    end

    subgraph 外部
        PROVIDERS[AI 供应商<br/>DeepSeek / OpenAI / ...]
        PAY[支付网关<br/>微信 / 支付宝]
        SMTP[邮件服务<br/>SMTP]
    end

    UI --> NGX
    SDK --> NGX
    AGENT --> NGX
    VENDOR --> NGX
    ADMIN --> NGX

    NGX --> API
    API --> AUTH
    API --> RATE
    API --> RT
    API --> BILL

    API --> USER
    API --> AGENT_SVC
    API --> FINANCE
    API --> SECURITY
    API --> VENDOR_SVC
    API --> CAMPAIGN
    API --> NOTIFY
    API --> MONITOR

    RATE --> REDIS
    BILL --> PG
    BILL --> REDIS
    USER --> PG
    AGENT_SVC --> PG
    FINANCE --> PG
    SECURITY --> PG
    VENDOR_SVC --> PG
    CAMPAIGN --> PG
    NOTIFY --> PG
    MONITOR --> PG

    RT --> PROVIDERS
    API --> PAY
    NOTIFY --> SMTP
    NOTIFY --> WS
    WS --> UI

    PG --> REDIS
```

---

## 二、部署架构

```mermaid
graph TB
    subgraph 生产服1 [生产服1 117.78.2.66]
        NGX1[Nginx<br/>80/443]
        PM2[PM2 Cluster<br/>2 instances]
        PG1[(PostgreSQL 17<br/>:5432)]
        RD1[(Redis 6<br/>:6379)]
        FS1[本地文件存储]
        BT[宝塔面板<br/>:8888]
    end

    subgraph 生产服2 [生产服2 备用 123.60.55.62]
        NGX2[Nginx<br/>80/443]
        BT2[宝塔面板<br/>:9999]
    end

    subgraph DNS
        DNS1[unmisa.com → 117.78.2.66]
        DNS2[api.unmisa.com → 117.78.2.66]
    end

    subgraph 外部
        GIT[GitHub]
        LETS[Let's Encrypt<br/>SSL 证书]
        PAYGW[支付网关]
        MAIL[SMTP 邮件]
        PROVIDERS[AI 供应商]
    end

    DNS1 --> NGX1
    DNS2 --> NGX1
    NGX1 --> PM2
    PM2 --> PG1
    PM2 --> RD1
    PM2 --> FS1
    PM2 --> PROVIDERS
    PM2 --> PAYGW
    PM2 --> MAIL

    NGX1 --> BT
    PM2 --> GIT
    GIT -->|deploy.sh| PM2
    LETS -->|自动续签| NGX1

    NGX2 -.->|备用| PM2
```

### 2.1 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 前端框架 | React + TypeScript | 18+ | 组件化 UI |
| 构建工具 | Vite | 5+ | 开发/构建 |
| 后端框架 | Fastify | 4+ | Node.js 高性能框架 |
| ORM | Drizzle ORM | 最新 | TypeScript 优先 |
| 数据库 | PostgreSQL | 17 | 主数据库 |
| 缓存 | Redis | 6 | 缓存/限流/会话 |
| 反向代理 | Nginx | 1.30 | HTTPS + 静态资源 |
| 进程管理 | PM2 | 5+ | Node.js 进程守护 |
| 服务器 | Ubuntu | 22.04 | 生产环境 |

---

## 三、模块依赖关系

```mermaid
graph LR
    subgraph 核心引擎
        RT[路由引擎]
        BILL[计费引擎]
        RATE[限流引擎]
        CB[熔断器]
    end

    subgraph 业务模块
        USER[用户服务]
        AGENT[代理服务]
        FIN[财务服务]
        VEN[供应商服务]
        SEC[安全服务]
        NOT[通知服务]
        CAMP[活动服务]
    end

    subgraph 基础设施
        DB[(数据库)]
        CACHE[(Redis)]
        LOG[日志服务]
    end

    RT --> CB
    RT --> RATE
    RT --> BILL

    BILL --> FIN
    BILL --> USER

    USER --> CACHE
    AGENT --> FIN
    AGENT --> USER

    VEN --> RT
    VEN --> DB

    SEC --> USER
    SEC --> LOG
    SEC --> CACHE

    NOT --> USER
    NOT --> CAMP

    FIN --> DB
    FIN --> CACHE

    USER --> DB
    AGENT --> DB
    VEN --> DB
    CAMP --> DB

    LOG --> DB
```

### 3.1 核心依赖说明

| 模块 | 依赖 | 说明 |
|------|------|------|
| 路由引擎 | 供应商服务、熔断器、限流引擎 | 请求转发前需知道供应商状态和限流限制 |
| 计费引擎 | 用户服务、财务服务 | 计费需要用户折扣率和定价配置 |
| 通知服务 | 用户服务、活动服务 | 通知需要知道用户订阅偏好 |
| 安全服务 | 用户服务、日志服务 | 安全检测需要用户行为和日志 |
| 代理商服务 | 财务服务、用户服务 | 佣金计算依赖财务数据 |

---

## 四、数据流

### 4.1 API 请求数据流

```mermaid
sequenceDiagram
    participant C as 客户端
    participant N as Nginx
    participant A as 认证中间件
    participant L as 限流器
    participant R as 路由引擎
    participant CB as 熔断器
    participant P as 供应商
    participant B as 计费引擎
    participant D as 数据库

    C->>N: HTTPS 请求
    N->>A: 转发请求
    A->>A: 验证 JWT / API Key
    A->>L: 请求通过认证

    L->>L: 四级限流检查
    L->>R: 限流通过

    R->>R: 查询供应商优先级
    R->>CB: 检查供应商状态
    CB->>CB: 检查熔断状态

    alt 熔断关闭
        CB->>R: 供应商可用
        R->>B: 预估算费 + 预扣余额
        B->>D: 查询折扣率
        B->>D: 预扣余额
        B->>R: 预扣成功
        R->>P: 转发请求
        P-->>R: 返回响应
        R->>B: 实际计费（多退少补）
        B->>D: 更新余额 + 记录日志
        R-->>C: 返回响应
    else 熔断打开
        CB->>R: 供应商不可用
        R->>R: 选择备用供应商
        R->>CB: 检查备用供应商
        R->>P: 转发到备用
    end
```

> **旁路：对话上下文留痕** — `/v1/chat/completions` 每笔请求（成功/失败/超时/402）在外层 `try/finally` 结束时异步落一条**完整上下文**到 `conversation_context_records`（上文 messages + 响应原文 + 路由/Key 指纹/计费明细，内容不脱敏）。写入为旁路（失败吞错、不影响主链路），供交易纠纷举证与政府调证；保留策略由调度器按 `system_config` 配置清理。详见 [`ref-12.9-conversation-records.md`](ref-12.9-conversation-records.md)。

### 4.2 充值数据流

```mermaid
sequenceDiagram
    participant U as 用户
    participant S as 系统
    participant P as 支付网关

    U->>S: 提交充值订单
    S->>S: 创建订单（pending）
    S->>P: 请求支付链接
    P-->>S: 返回支付链接
    S-->>U: 返回支付链接

    U->>P: 完成支付
    P->>S: 异步回调通知

    S->>S: 校验签名 + 幂等性
    S->>S: 更新订单（paid）
    S->>S: 增加余额
    S->>S: 写入 balance_logs
    S->>S: 发送通知
    S-->>U: 前端轮询获知结果
```

### 4.3 实时推送数据流

```mermaid
sequenceDiagram
    participant U as 用户端
    participant S as 后端服务
    participant WS as WebSocket 服务
    participant R as Redis Pub/Sub

    U->>WS: 建立 WebSocket 连接（JWT 认证）
    WS->>R: 订阅用户频道

    Note over S: 事件发生（余额变动/通知/告警）
    S->>R: 发布消息到用户频道

    R->>WS: 推送消息
    WS->>U: 实时推送
    U->>U: 更新前端 UI
```

---

## 五、服务拆分布局

> 后端服务已全部拆分完成（42 个目录，零残留大文件）

```
api/src/
├── routes/              ← 路由定义（按模块组织）
├── services/            ← 领域服务（已拆分为子目录）
│   ├── auth-service/    ← 认证服务（6 子文件）
│   ├── billing/        ← 计费服务（6 子文件）
│   ├── circuit-breaker/ ← 熔断器（6 子文件）
│   ├── stats-usage-service/ ← 统计服务（7 子文件）
│   ├── notification-service/ ← 通知服务（5 子文件）
│   ├── geo-check/      ← 地理检查（6 子文件）
│   ├── real-name-service/ ← 实名服务（7 子文件）
│   ├── invoice-service/ ← 发票服务（5 子文件）
│   ├── finance-service/ ← 财务服务（12 子文件）
│   ├── agent-finance/  ← 代理财务
│   ├── agent-core/     ← 代理核心
│   ├── agent-commission/ ← 代理佣金
│   ├── agent-withdraw/ ← 代理提现
│   ├── key-group/      ← Key 资源池
│   ├── recharge-service/ ← 充值服务
│   ├── config-version/ ← 配置版本（7 子文件）
│   ├── pricing/        ← 定价服务（5 子文件）
│   ├── email/          ← 邮件服务（4 子文件）
│   ├── refund/         ← 退款服务（2 子文件）
│   ├── rule-engine/    ← 规则引擎（2 子文件）
│   ├── session/        ← 会话管理（2 子文件）
│   ├── profit/         ← 利润分析（2 子文件）
│   ├── daily-summary/  ← 日汇总（3 子文件）
│   ├── alert-channel/  ← 告警通道（2 子文件）
│   ├── payment/        ← 支付适配（3 子文件）
│   ├── two-factor/     ← 双因素（2 子文件）
│   ├── security-event/ ← 安全事件（2 子文件）
│   ├── alert-service/  ← 告警服务（3 子文件）
│   └── operation-alert/ ← 运营告警
├── db/                 ← 数据库
│   ├── schema/         ← 42 个 Drizzle Schema 文件
│   ├── migrations/     ← 数据库迁移
│   └── seed/           ← 种子数据
└── middleware/          ← 中间件
```

---

## 六、安全性架构

```mermaid
graph TB
    subgraph 安全层级
        L1[L1 传输层]
        L2[L2 认证层]
        L3[L3 权限层]
        L4[L4 应用层]
        L5[L5 数据层]
    end

    subgraph 防护措施
        HTTPS[HTTPS SSL/TLS]
        JWT[JWT + 2FA TOTP]
        RBAC[Bitset 权限矩阵]
        RATE[四级限流]
        FILTER[内容过滤]
        GEO[IP 地理封禁]
        ENCRYPT[敏感字段加密]
        AUDIT[操作审计日志]
        CAPTCHA[验证码]
        BAN[IP/用户封禁]
    end

    L1 --> HTTPS
    L2 --> JWT
    L2 --> CAPTCHA
    L3 --> RBAC
    L4 --> RATE
    L4 --> FILTER
    L4 --> GEO
    L4 --> BAN
    L5 --> ENCRYPT
    L5 --> AUDIT
```

---

## 七、交叉引用

| 其他文档 | 关联内容 |
|---------|---------|
| TOOLS.md | 本地开发环境架构 |
| ref-7-nfr.md | 可用性 SLA、灾备方案 |
| ops-guide.md | 部署架构详细配置 |
| frontend-routes.md | 前端页面路由结构 |
| ref-5.1-routing.md | 路由引擎架构 |
| ref-5.3-rate-limiter.md | 限流引擎架构 |
| ref-4.6-security.md | 安全架构详情 |