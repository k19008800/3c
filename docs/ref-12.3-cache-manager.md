# 深化参考：§12.3 缓存管理

> **对应**：[`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) §12.3
> **关联**：[`ref-12.6-health-dashboard.md`](ref-12.6-health-dashboard.md)
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

系统大量使用 Redis 缓存（用户会话、路由缓存、计费缓存等），但管理员无法看到缓存运行状态——哪些 Key 占用内存最多、命中率如何、是否内存溢出。一旦 Redis 内存打满，会导致连锁故障。

**核心价值**：Redis 状态可视化，快速排查缓存问题，防止内存溢出导致的服务不可用。

---

## 功能模块

### 1. Redis 概览

```
Redis 缓存状态

  ┌─────────────────────────────────────────────────────────┐
  │  状态: 🟢 正常                                           │
  │  版本: Redis 6.2.7                                       │
  │  运行时间: 32 天 5 小时                                    │
  │  内存使用: 1.2 GB / 2 GB   ████████████████░░░  60%    │
  │  CPU 使用: 12%                                            │
  │  当前连接: 45 / 128                                       │
  │  命中率:  98.5%  (hits: 1,200,000 / misses: 18,000)      │
  │  过期 Key: 12,345                                         │
  │  网络 IO: 入 2.5 MB/s  出 8.1 MB/s                        │
  └─────────────────────────────────────────────────────────┘
```

| 指标 | 正常范围 | 警告 | 异常 |
|------|---------|------|------|
| 内存使用 | < 70% | 70-85% | > 85% |
| 命中率 | > 95% | 85-95% | < 85% |
| CPU | < 30% | 30-60% | > 60% |
| 连接数 | < 70% 最大连接 | 70-85% | > 85% |
| 过期 Key 堆积 | 正常范围 | 短时间内大量过期 | 内存不足导致淘汰 |

### 2. Key 查询

```
Key 查询

  [按前缀搜索 ▼]  session:*    [查询]

  匹配结果: 1,234 个 Key  总大小: 45 MB

  ┌────────────────┬──────────┬────────┬────────┬──────────┐
  │ Key            │ 类型     │ 大小   │ TTL    │ 操作     │
  ├────────────────┼──────────┼────────┼────────┼──────────┤
  │ session:abc123 │ string   │ 2.5 KB │ 1,800s │ [查看][删除]│
  │ session:def456 │ string   │ 3.1 KB │ 900s   │ [查看][删除]│
  │ session:ghi789 │ hash     │ 5.2 KB │ -1     │ [查看][删除]│
  │ ...           │          │        │        │          │
  └────────────────┴──────────┴────────┴────────┴──────────┘
```

| 搜索方式 | 说明 |
|---------|------|
| 按前缀搜索 | `session:*` / `cache:*` / `rate_limit:*` |
| 按 Key 名搜索 | 精确 Key 名或模糊匹配 `*keyword*` |
| 按类型筛选 | string / hash / list / set / zset |
| 按 TTL 筛选 | 永不过期 / < 1 小时 / 1-24 小时 / > 24 小时 |

### 3. 内存分析

```
内存分析 — Top 10 前缀

  ┌──────────────┬──────────┬────────┬────────┬─────────┐
  │ Key 前缀     │ 内存占用 │ Key 数 │ 过期数  │ 操作    │
  ├──────────────┼──────────┼────────┼────────┼─────────┤
  │ cache:*      │ 512 MB   │ 8,500  │ 1,200  │ [清理]  │
  │ session:*    │ 256 MB   │ 12,000 │ 5,000  │ [清理]  │
  │ rate_limit:* │ 128 MB   │ 50,000 │ 48,000 │ [清理]  │
  │ route:*      │ 64 MB    │ 500    │ 0      │ [清理]  │
  │ ...          │          │        │        │         │
  └──────────────┴──────────┴────────┴────────┴─────────┘

  总内存使用: 1.2 GB / 2 GB
```

**大 Key 检测**：自动检测占用超过 1 MB 的 Key（Top 20），标记为潜在优化对象。

### 4. Key 详情

```
Key 详情

  Key:    session:abc123
  类型:   hash
  大小:   2.5 KB
  TTL:    1,800s (30 分钟)
  编码:   ziplist

  字段:
  ┌────────────┬────────────┐
  │ user_id    │ 42         │
  │ role       │ admin      │
  │ expires_at │ 2026-07-30 │
  └────────────┴────────────┘

  [删除 Key] [刷新 TTL] [复制 Key 名]
```

### 5. Key 管理

| 操作 | 说明 | 确认要求 |
|------|------|---------|
| 删除 Key | 删除指定 Key | 二次确认弹窗 |
| 批量删除 | 按前缀批量删除（如 `session:expired_*`）| 确认影响范围 |
| 清理过期 | 按前缀清理所有已过期 Key | 确认 |
| 刷新 TTL | 将指定 Key 的 TTL 延长 | 确认 |
| 按前缀批量刷新 | 批量刷新指定前缀 Key 的 TTL | 二次确认弹窗 |

**批量删除安全策略**：
- 批量删除前显示"将删除 N 个 Key，占用约 X MB"
- 二次确认弹窗要求输入"确认删除"
- 批量删除记录到 audit_logs
- 不允许删除 `system:config:*` 等核心配置前缀（保护名单）

### 6. 命中率趋势

```
近 7 天缓存命中率

  100% ┤  ●─●─●─●─●─●─●
   95% ┤  │  │  │  │  │  │  │
   90% ┤  │  │  │  │  │  │  │
   85% ┤
      └─────────────────────────
       07-22 07-23 ...  07-28

  平均命中率: 98.5%  🟢 良好
  最低命中率: 96.2% (07-24)
```

命中率按小时聚合，保留 30 天历史。

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/cache/status` | Redis 概览（内存/CPU/连接/命中率） | admin |
| `GET` | `/api/v1/admin/cache/keys?prefix=&search=&type=&ttlRange=&page=&limit=` | 查询 Key | admin |
| `GET` | `/api/v1/admin/cache/keys/:key` | Key 详情 | admin |
| `DELETE` | `/api/v1/admin/cache/keys/:key` | 删除 Key | admin |
| `POST` | `/api/v1/admin/cache/keys/batch-delete` | 按前缀批量删除 | super_admin |
| `POST` | `/api/v1/admin/cache/keys/batch-flush-ttl` | 按前缀批量刷新 TTL | super_admin |
| `GET` | `/api/v1/admin/cache/memory-analysis` | 内存分析（按前缀分组）| admin |
| `GET` | `/api/v1/admin/cache/large-keys` | 大 Key 列表（> 1 MB）| admin |
| `GET` | `/api/v1/admin/cache/hit-rate?days=7` | 命中率趋势 | admin |
| `GET` | `/api/v1/admin/cache/hit-rate/history` | 命中率历史（30 天）| admin |

> ⚠️ **注意**：`batch-delete` 和 `batch-flush-ttl` 操作影响面大，仅 super_admin 可用，且需二次确认。

---

## 前端组件 Props

```tsx
// Redis 概览
interface CacheStatusProps {
  status: RedisStatus;
  hitRateHistory: HitRatePoint[];
}

// Key 查询
interface CacheKeySearchProps {
  onSearch: (query: CacheSearchQuery) => void;
  results: CacheKey[];
  pagination: { page: number; total: number; limit: number };
  onViewKey: (key: string) => void;
  onDeleteKey: (key: string) => void;
  onBatchDelete: (prefix: string) => void;
  loading: boolean;
}

// Key 详情
interface CacheKeyDetailProps {
  key: string;
  detail: CacheKeyDetail;
  onDelete: () => void;
  onRefreshTtl: (ttl: number) => void;
  onClose: () => void;
}

// 内存分析
interface MemoryAnalysisProps {
  topPrefixes: MemoryPrefix[];
  onCleanup: (prefix: string) => void;
  totalMemory: { used: number; max: number };
}

// 命中率趋势图
interface CacheHitRateChartProps {
  data: HitRatePoint[];
  average: number;
  days: number; // 7/30
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| Redis 不可用 | 页面显示"Redis 连接失败"，所有功能不可用，引导查看健康检查大屏 |
| Key 前缀搜索匹配数量 > 10000 | 限制返回前 100 条 + 显示"共匹配 N 个 Key，仅展示前 100 个" |
| Key 查询使用 SCAN 而非 KEYS | 避免阻塞 Redis，使用 COUNT 参数控制每次扫描数量 |
| 内存分析计算量大 | 缓存结果 5 分钟，避免频繁调用 MEMORY USAGE |
| 保护名单中的 Key 被尝试删除 | 返回"该 Key 受保护，无法删除"，记录操作到 audit_logs |
| 大 Key 删除影响 | 使用 UNLINK 而非 DEL 异步删除，避免阻塞 |
| 命中率数据 > 30 天 | 自动归档，仅保留 30 天详细数据 |

---

## 验收标准

1. Redis 概览正确显示内存/CPU/连接/命中率/运行时间
2. 按前缀搜索 Key 正常，支持类型和 TTL 筛选
3. Key 详情展示 Key 类型/大小/TTL/编码/字段内容（结构类型）
4. 删除 Key 二次确认后执行，记录 audit_logs
5. 内存分析按前缀分组展示 Top 10 内存占用
6. 大 Key 检测自动列出占用 > 1 MB 的 Key
7. 命中率趋势图展示近 7 天和 30 天数据
8. 批量删除操作仅 super_admin 可用，有安全确认弹窗

---

## 保护名单（禁止批量删除的 Key 前缀）

```
system:config:*
route:cache:*
billing:*
```

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §12.6 健康检查 | Redis 状态是健康评分维度之一 |
| §12.2 数据库管理面板 | Redis 和 DB 监控互补，同属于系统运维视图 |
| §12.4 任务调度 | 定时清理过期缓存可配置为调度任务 |

---

### [?] 页面帮助
**页面名称**：缓存管理
**核心操作**：查看 Redis 状态、查询/删除 Key、内存分析、命中率趋势
**注意事项**：删除操作不可逆；批量删除影响面大，仅超级管理员可用；系统配置类 Key（`system:config:*`）受保护不可删除

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 搜索 Key | 按前缀/关键词/类型/TTL 筛选查询 Redis Key |
| 查看详情 | 查看 Key 的详细内容（值/类型/TTL/编码）|
| 删除 Key | 删除指定 Key（二次确认）|
| 批量删除 | 按前缀批量删除 Key（仅 super_admin，需二次确认）|
| 内存分析 | 按 Key 前缀分组展示内存占用 Top 10 |
| 大 Key 检测 | 自动扫描并列出占用超过 1 MB 的大 Key |
| 刷新 TTL | 延长指定 Key 的过期时间 |