# 深化参考：§12.2 数据库管理面板

> **对应**：[`PRD-系统管理员支撑.md`](PRD-系统管理员支撑.md) §12.2
> **关联**：[`ref-12.1-audit-console.md`](ref-12.1-audit-console.md)
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

管理员需要了解数据库运行状态：哪些表数据量大、索引是否生效、慢查询情况。当前只能 SSH 到服务器执行 SQL，没有可视化界面。非运维背景的管理员（如运营）根本无法查看。

**核心价值**：无需 SSH 即可查看数据库关键指标，降低日常巡检门槛；慢查询分析和 Schema 浏览帮助定位性能瓶颈。

---

## 功能模块

### 1. 表总览

```
数据库表总览

  搜索表名: [____________]

  ┌────────┬────────┬────────┬────────┬────────┬─────────┐
  │ 表名    │ 估算行数│ 数据大小 │ 索引大小 │ 最后更新  │ 操作    │
  ├────────┼────────┼────────┼────────┼────────┼─────────┤
  │ users  │ 12,345 │ 45 MB │ 12 MB │ 07-28  │ [详情]  │
  │ call_logs│ 5.2M  │ 2.1 GB │ 512 MB│ 07-28  │ [详情]  │
  │ recharges│ 82,000│ 320 MB │ 95 MB │ 07-28  │ [详情] │
  │
  │ ...    │        │        │        │        │         │
  └────────┴────────┴────────┴────────┴────────┴─────────┘

  排序: [按行数 ▼]  [筛选: 用户相关 ▼]
```

**列说明**：

| 列 | 数据来源 | 说明 |
|---|---------|------|
| 表名 | pg_catalog.pg_tables | 表名（隐藏系统表和分区子表，可展开）|
| 估算行数 | pg_class.reltuples | PostgreSQL 统计信息的估算行数 |
| 数据大小 | pg_total_relation_size | 表数据占用的磁盘空间 |
| 索引大小 | pg_indexes_size | 索引占用的磁盘空间 |
| 最后更新时间 | 取 MAX(updated_at) 或 pg_class.reltuples 最后变更 | 最近一次数据变更时间 |
| 操作 | — | 查看详情 / 查看 Schema |

### 2. 索引管理

```
索引状态

  表: [users ▼]

  ┌────────────┬────────┬────────┬────────┬──────────┐
  │ 索引名     │ 列     │ 类型   │ 大小   │ 使用率   │  │
  ├────────────┼────────┼────────┼────────┼──────────┤
  │ idx_users_email │ email  │ btree  │ 4 MB  │ 98%     │ ✅  │
  │ idx_users_phone │ phone  │ btree  │ 3 MB  │ 45%     │ ⚠️ 低使用 │
  │ idx_users_name  │ name    │ btree  │ 2 MB  │ 0%      │ 🔴 未使用 │
  │ idx_users_name2 │ name    │ btree  │ 2 MB  │ —       │ 🔴 重复索引 │
  └────────┴────────┴────────┴────────┴──────────┘
```

**功能**：

| 功能 | 说明 |
|------|---------|
| 索引使用率 | 基于 pg_stat_user_indexes 统计的索引扫描次数 |
| 未使用索引 | 7 天内未扫描过的索引（建议删除以节省磁盘和写入开销）|
| 重复索引 | 相同列组合的多个索引（建议合并/删除）|
| 缺失索引建议 | 基于慢查询的 WHERE/JOIN 条件自动建议（仅提示，不自动创建）|

### 3. 慢查询分析

```
慢查询分析

  时间范围: [近 1 小时 ▼]  最慢阈值: [500ms ▼]  状态: [全部 ▼]

  ┌────────┬────────┬────────┬────────┬────────┬──────────┐
  │ 时间    │ 耗时   │ 行数   │ 扫描行 │ 锁等待  │ 查询（截取）│
  ├────────┼────────┼────────┼────────┼────────┼──────────┤
  │ 10:23  │ 2.3s │ 1     │ 120K  │ 0ms   │ SELECT *...│
  │ 10:15  │ 1.1s  │ 5     │ 85K   │ 50ms   │ SELECT u...│
  │ 10:10  │ 800ms  │ 0     │ 0     │ 200ms  │ UPDATE u...│
  │ ...    │        │        │        │        │          │
  └────────┴────────┴────────┴────────┴────────┴──────────┘

  数据来源：pg_stat_statements / pg_stat_activity

  [查看执行计划] → 输入 SQL → 显示 EXPLAIN ANALYZE 结果
```

**功能**：

| 功能 | 说明 |
|------|---------|
| 慢查询列表 | 从 pg_stat_statements 获取超过阈值（默认 500ms）的查询 |
| 查询详情 | 点击展开完整 SQL、调用次数、平均耗时、缓存命中率 |
| 执行计划 | 输入 SQL 执行 EXPLAIN（只读模式），可视化展示计划树 |
| 实时查询 | 查看 pg_stat_activity 中当前正在执行的查询 |

### 4. 连接管理

```
当前连接

  活跃连接: 12 / 最大 100

  ┌────────┬──────────┬────────┬────────┬────────┬──────────┐
  │ PID   │ 用户   │ 数据库 │ 状态   │ 时长   │ 当前查询           │
  ├────────┼────────┼────────┼────────┼────────┼──────────┤
  │ 12345 │ postgres│ threecloud │ active │ 5s    │ SELECT * FROM...│
  │ 12346 │ postgres│ threecloud │ idle   │ 2m    │ —                 │
  │ 12347 │ postgres│ threecloud │ idle   │ 10m   │ —                 │
  │ ...  │        │        │        │        │                  │
  └────────┴────────┴────────┴────────┴────────┴──────────┘

  连接来源分布：
  本地: 8    外部: 4

  [终止连接] — 选中连接后强制终止（需二次确认）
```

### 5. Schema 浏览器

```
Schema 浏览器

  表: [users ▼]  [刷新]

  ┌────────────────────────────────────────────────────┐
  │ 列名          │ 类型          │ 可为空 │ 默认值  │ 约束       │
  ├────────────────┼──────────────┼────────┼────────┼──────────┤
  │ id            │ serial        │ NO     │ —       │ PRIMARY KEY│
  │ email         │ varchar(255)  │ NO     │ —       │ UNIQUE     │
  │ password_hash │ varchar(255)  │ NO     │ —       │            │
  │ role          │ varchar(20)   │ YES    │ 'user'  │            │
  │ created_at    │ timestamptz   │ YES    │ now()   │            │
  └────────────────┴──────────────┴────────┴────────┴──────────┘

  索引:
    idx_users_email ON (email)
    idx_users_role ON (role)

  外键:
    — 无外键

  DDL:
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      ...
    );
```

### 6. SQL 执行器（只读模式）

```
SQL 执行器

  [只读模式] — 仅允许 SELECT 查询

  SQL:
  ┌──────────────────────────────────────────────────────┐
  │ SELECT table_name, num_rows, data_size            │
  │ FROM table_stats                                  │
  │ WHERE table_schema = 'public'                    │
  │ ORDER BY num_rows DESC                           │
  │ LIMIT 10;                                        │
  └──────────────────────────────────────────────────────┘

 ［运行］  [格式化]  [清空]  [EXPLAIN]

  结果：
  ┌────────────┬──────────┬──────────┐
  │ table_name │ num_rows │ data_size│
  ├────────────┼──────────┼──────────┤
  │ call_logs  │ 5200000  │ 2.1 GB   │
  │ users      │ 12345    │ 45 MB    │
  └────────────┴──────────┴──────────┘
  耗时: 245ms  行数: 10
```

**安全规则**：
- 仅允许 SELECT 查询（后端正则拦截 INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE/CREATE）
- 查询超时 10 秒自动终止
- 查询结果最大返回 1000 行
- 记录每个 SQL 执行到 audit_logs
- 每天查询次数限制：管理员 50 次，超管 200 次

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/database/tables` | 表总览列表 | admin |
| `GET` | `/api/v1/admin/database/tables/:name` | 表详情（大小/行数/估算）| admin |
| `GET` | `/api/v1/admin/database/indexes?tableName=` | 索引状态列表 | admin |
| `GET` | `/api/v1/admin/database/slow-queries?startDate=&endDate=&minDuration=&page=&limit=` | 慢查询列表 | admin |
| `GET` | `/api/v1/admin/database/slow-queries/:queryid` | 慢查询详情 | admin |
| `POST` | `/api/v1/admin/database/explain` | 执行 EXPLAIN | admin |
| `GET` | `/api/v1/admin/database/connections` | 活跃连接列表 | admin |
| `POST` | `/api/v1/admin/database/connections/:pid/kill` | 终止连接 | super_admin |
| `GET` | `/api/v1/admin/database/schema/:tableName` | 表 Schema（列/索引/外键/DLL）| admin |
| `POST` | `/api/v1/admin/database/query` | 执行 SELECT 查询（只读模式）| admin |
| `GET` | `/api/v1/admin/database/statistics` | 数据库整体统计（总大小/索引大小/缓存命中率）| admin |

---

## 前端组件 Props

```tsx
// 表总览
interface DatabaseTableListProps {
  tables: TableSummary[];
  onSearch: (q: string) => void;
  onTableClick: (name: string) => void;
  onSort: (field: string) => void;
  filter: string; // 按关键词过滤
  loading: boolean;
}

// 索引管理
interface IndexManagementProps {
  indexes: IndexInfo[];
  onAnalyze: (tableName: string) => void;
  unusedThreshold: number; // 默认 7 天
}

// 慢查询分析
interface SlowQueryListProps {
  queries: SlowQuery[];
  filters: SlowQueryFilters;
  onFilterChange: (filters: Partial<SlowQueryFilters>) => void;
  onQueryClick: (queryid: string) => void;
  onExplain: (sql: string) => Promise<void>;
  pagination: { page: number; total: number; limit: number };
  loading: boolean;
}

// SQL 执行器
interface SqlExecutorProps {
  onExecute: (sql: string) => Promise<SqlResult>;
  onExplain: (sql: string) => Promise<SqlExplainResult>;
  maxRows: number; // 默认 1000
  timeoutMs: number; // 默认 10000
  queryCountToday: number;
  maxQueriesPerDay: number;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 表数据量 > 1 亿行 | 使用 pg_class.reltuples 估算行数，不执行 COUNT(*) |
| 慢查询表数据量大（> 1000 条）| 分页展示，默认最近 50 条 |
| SQL 执行器命中 INSERT 语句 | 后端正则拦截 + 返回"只读模式，仅支持 SELECT" |
| 执行计划耗时 > 10 秒 | 自动终止，返回"查询超时，请简化查询条件" |
| 连接池耗尽 | 连接查询页面自动标记红色警告 + 推荐终止空闲连接 |
| 缺少 pg_stat_statements 扩展 | 返回"需要启用 pg_stat_statements 扩展，请联系运维" |
| 数据库连接失败 | 显示"数据库连接异常" + 建议查看健康检查大屏 |

---

## 验收标准

1. 表总览正确显示所有用户表的名/行数/大小/索引大小
2. 索引管理页面显示索引使用率，标记未使用和重复索引
3. 慢查询分析显示超过阈值的 SQL，支持查看执行计划
4. 连接管理页面显示当前活跃连接数、来源分布、可终止连接
5. Schema 浏览器正确显示表列/类型/约束/索引/外键/DLL
6. SQL 执行器只读模式正确拦截写操作，结果最多返回 1000 行
7. SQL 执行器查询超时 10 秒自动终止
8. 所有操作记录到 audit_logs

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §12.6 健康检查 | 数据库连接数和慢查询数量影响健康评分 |
| §12.1 审计控制台 | SQL 执行器操作记录到 audit_logs |
| §12.4 任务调度 | 数据库维护任务（VACUUM/ANALYZE）可在调度中配置 |

---

### [?] 页面帮助
**页面名称**：数据库管理面板
**核心操作**：查看表状态/索引/慢查询/Schema/执行只读 SQL
**注意事项**：SQL 执行器为只读模式，禁止执行写操作；慢查询数据依赖于 pg_stat_statements 扩展；终止连接请确认不影响正在运行的任务

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 表详情 | 查看指定表的完整大小/行数/索引/列信息 |
| 索引分析 | 查看索引使用率，识别未使用和重复索引 |
| 执行计划 | 查看 SQL 的执行计划（EXPLAIN），分析查询性能 |
| 终止连接 | 强制终止指定的数据库连接（需二次确认）|
| SQL 执行 | 在只读模式下执行 SELECT 查询，结果最多 1000 行 |
| 格式化 SQL | 自动格式化输入的 SQL 语句 |