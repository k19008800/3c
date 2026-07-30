# 深化参考：§11.8 团队协作与客户交接

> **对应**：[`PRD-业务员支撑.md`](PRD-业务员支撑.md) §11.8
> **关联**：[`ref-11.1-crm.md`](ref-11.1-crm.md)、[`ref-11.2-leads.md`](ref-11.2-leads.md)、[`ref-11.4-opportunity.md`](ref-11.4-opportunity.md)、[`ref-11.6-quote-contract.md`](ref-11.6-quote-contract.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

业务团队需要灵活的组织结构和协作机制：团队组长需管理成员、分配线索、查看团队业绩；客户/线索/商机在业务员之间流转（离职交接、跨组调配）时需完整记录，避免信息丢失。

**核心价值**：团队管理结构化，客户交接可追溯，线索分配流程化，组长可掌控团队业绩全貌。

---

## 功能模块

### 1. 团队管理

**创建团队**（管理员/组长）：

| 字段 | 说明 |
|------|------|
| 团队名称 | 如"华东销售一组" |
| 团队组长 | 从业务员中选择一人担任 |
| 团队描述 | 区域/行业等说明 |
| 创建时间 | 自动记录 |

**成员管理**：

| 操作 | 说明 | 权限 |
|------|------|------|
| 添加成员 | 将业务员加入团队 | 管理员 / 组长 |
| 移除成员 | 将成员移出团队 | 管理员 / 组长 |
| 变更角色 | 将成员升级为组长或降级为成员 | 管理员 |

**组长权限**：

| 权限项 | 说明 |
|--------|------|
| 查看团队业绩汇总 | 查看组员业绩数据 |
| 分配线索 | 将线索分配给组员 |
| 查看组员客户 | 查看组员名下客户列表（仅查看，不可操作）|
| 团队数据导出 | 导出团队业绩数据 |

### 2. 客户交接

**交接场景**：

| 场景 | 说明 |
|------|------|
| 业务员离职 | 原业务员名下客户/线索/商机/合同批量转移给接替人员 |
| 客户重新分配 | 客户要求更换对接人 |
| 跨组调动 | 业务员调组后相关资源转移 |
| 线索再分配 | 线索跟进效果不佳，转给其他组员 |

**批量转移操作**：

```
选择来源业务员 ─→ 选择目标业务员
    │
    ├── ☑ 转移客户（全部/按状态筛选）
    ├── ☑ 转移线索（全部/按状态筛选）
    ├── ☑ 转移商机（全部/按状态筛选）
    └── ☑ 转移合同（全部/按状态筛选）
    │
    └── 填写转移原因 ─→ 确认转移
```

**交接日志**：每次转移记录在 `customerTransferLog` 表中，支持按时间/操作人/类型检索。

| 字段 | 示例 |
|------|------|
| 转移时间 | 2026-07-30 15:00:00 |
| 原负责人 | 张三 |
| 现负责人 | 李四 |
| 转移类型 | customer |
| 转移客户数 | 12 |
| 转移原因 | 张三离职，客户交接 |
| 操作人 | 管理员王强 |

### 3. 线索分配

组长将线索池中的线索分配给组员：

```
线索池 ──→ 组长选择线索 ──→ 选择组员 ──→ 分配确认
                                         │
                                         ├── 单条分配
                                         └── 批量分配（最多 50 条/次）
```

分配后：
- 线索状态变更为 `assigned`
- 线索 `salespersonId` 更新为目标组员
- 系统通知目标组员："您有 N 条新线索待跟进"

### 4. 团队视图

组长查看团队业绩汇总：

| 维度 | 指标 |
|------|------|
| 团队整体 | 新增客户数 / 消费总额 / 目标完成率 / 商机数 / 成交数 |
| 按成员 | 每人对应上述指标明细 |
| 时间范围 | 本月 / 本季度 / 自定义 |

```
┌────────────────────────────────────────────────────────┐
│  团队业绩汇总 · 华东销售一组 · 2026年7月               │
├────────────────────────────────────────────────────────┤
│ 团队指标                                                   │
│  新增客户: 56  |  消费总额: ¥12.3万  |  目标完成率: 82%   │
├────────────────────────────────────────────────────────┤
│ 成员明细                                                   │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬───────┐  │
│ │ 成员  │ 新增  │ 消费  │ 目标  │ 商机  │ 成交  │ 操作  │  │
│ │      │ 客户数 │ 额    │ 完成率 │ 数    │ 数    │      │  │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼───────┤  │
│ │ 李四  │ 15   │ ¥3.2万│ 85%  │ 8    │ 5    │ [查看] │  │
│ │ 王五  │ 12   │ ¥2.8万│ 78%  │ 6    │ 3    │ [查看] │  │
│ │ ...   │      │      │      │      │      │       │  │
│ └──────┴──────┴──────┴──────┴──────┴──────┴───────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 数据表定义

### salesTeams（销售团队）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| name | varchar(50) | 团队名称 |
| leaderId | integer | 组长用户 ID |
| description | text | 团队描述 |
| createdAt | timestamp | 创建时间 |

### salesTeamMembers（团队成员）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| teamId | integer | 团队 ID |
| userId | integer | 用户 ID |
| role | enum | `leader` / `member` |
| joinedAt | timestamp | 加入时间 |

### customerTransferLog（客户交接日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| fromUserId | integer | 原负责人 |
| toUserId | integer | 新负责人 |
| customerIds | jsonb | 转移的客户 ID 数组 |
| transferType | enum | `customer` / `lead` / `opportunity` / `contract` |
| reason | text | 转移原因 |
| operatedBy | integer | 操作人 |
| createdAt | timestamp | 创建时间 |

---

## API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/teams` | 创建团队 | 管理员 |
| `GET` | `/api/v1/admin/teams` | 团队列表 | 管理员 |
| `POST` | `/api/v1/admin/teams/:id/members` | 添加成员 | 管理员 / 组长 |
| `DELETE` | `/api/v1/admin/teams/:id/members/:userId` | 移除成员 | 管理员 / 组长 |
| `POST` | `/api/v1/admin/customers/transfer` | 批量转移客户 | 管理员 |
| `POST` | `/api/v1/admin/leads/assign` | 批量分配线索 | 管理员 / 组长 |
| `GET` | `/api/v1/agent/team/performance` | 团队业绩汇总 | 组长 |
| `GET` | `/api/v1/agent/team/members` | 团队成员列表及业绩 | 组长 |

---

## 前端组件 Props

```tsx
// 团队列表
interface TeamListProps {
  teams: TeamSummary[];
  onCreate: () => void;
  onEdit: (id: number) => void;
}

// 创建/编辑团队
interface TeamEditorProps {
  mode: 'create' | 'edit';
  initialData?: TeamInput;
  allUsers: UserSelectItem[];
  onSave: (data: TeamInput) => void;
}

interface TeamInput {
  name: string;
  leaderId: number;
  description?: string;
  memberIds: number[]; // 初始成员
}

// 团队详情（含成员列表）
interface TeamDetailProps {
  team: TeamDetail;
  onAddMember: () => void;
  onRemoveMember: (userId: number) => void;
}

// 客户交接
interface CustomerTransferProps {
  fromUsers: UserSelectItem[];
  toUsers: UserSelectItem[];
  transferTypes: { key: string; label: string }[];
  onTransfer: (data: TransferInput) => void;
}

interface TransferInput {
  fromUserId: number;
  toUserId: number;
  transferTypes: string[]; // ["customer", "lead", "opportunity", "contract"]
  customerFilter?: { status?: string }; // 可选筛选
  reason: string;
}

// 线索分配
interface LeadAssignProps {
  teamMembers: UserSelectItem[];
  leads: LeadSummary[];
  onAssign: (data: { leadIds: number[]; userId: number }) => void;
}

// 团队业绩视图（组长）
interface TeamPerformanceProps {
  teamId: number;
  teamSummary: TeamPerformanceSummary;
  memberPerformances: MemberPerformance[];
  onMemberClick: (userId: number) => void;
}

interface TeamPerformanceSummary {
  newCustomers: number;
  consumptionTotal: number;
  targetCompletion: number;
  opportunityCount: number;
  dealCount: number;
}

interface MemberPerformance {
  userId: number;
  name: string;
  newCustomers: number;
  consumptionTotal: number;
  targetCompletion: number;
  opportunityCount: number;
  dealCount: number;
}

// 交接日志
interface TransferLogProps {
  logs: TransferLogEntry[];
  onFilter?: (filter: TransferLogFilter) => void;
}

interface TransferLogEntry {
  id: number;
  fromUser: string;
  toUser: string;
  transferType: string;
  customerCount: number;
  reason: string;
  operatedBy: string;
  createdAt: string;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 团队组长离职 | 必须先转移组长身份，否则无法移除组长 |
| 移除成员时该成员有未分配线索 | 提示"该成员有 X 条未分配的线索，请先分配后再移除" |
| 客户批量转移量级大（>500）| 使用异步任务处理，前端显示"转移任务已提交，请稍后查看结果" |
| 一个用户被移除团队后 | 该用户的客户/线索/商机不受影响，但不再显示在团队视图 |
| 线索分配目标组员已离职 | 分配时校验目标用户状态，已离职用户不可选 |
| 交接日志量过大 | 按时间倒序分页，支持按操作人/类型筛选 |
| 一个用户加入多个团队 | 一个用户仅属于一个团队，加入新团队时需从原团队退出 |
| 转移操作并发冲突 | 同一客户同时被两个交接请求选中时，先处理的成功，后处理返回冲突错误 |

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §11.1 CRM | 客户交接直接影响客户 `salespersonId` 变更 |
| §11.2 线索管理 | 线索分配影响线索状态和负责人 |
| §11.4 商机 | 商机转移跟随客户交接 |
| §11.6 报价与合同 | 合同转移跟随客户交接 |
| §11.5 业绩看板 | 团队视图数据源 |
| §4.2 用户管理 | 团队成员关联用户账号 |
| §12.4 任务调度 | 批量转移超过 500 条时使用异步任务处理 |

---

### [?] 页面帮助
**页面名称**：团队协作与客户交接
**核心操作**：管理员创建团队并分配组长 → 组长管理成员、分配线索 → 客户交接记录完整追溯 → 组长查看团队业绩
**注意事项**：组长离职须先转让组长身份；批量转移超过 500 条将异步处理；线索分配后系统自动通知目标组员

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建团队 | 设置团队名称、指定组长、添加初始成员 |
| 添加成员 | 将业务员加入团队，加入后该业务员团队关系立即生效 |
| 移除成员 | 将成员移出团队，需先处理其未分配线索 |
| 批量转移客户 | 将原负责人名下的客户/线索/商机/合同批量转移给新负责人 |
| 分配线索 | 组长将线索池中的线索分配给组内成员 |
| 团队业绩 | 组长查看团队整体及按成员维度的业绩汇总 |
| 交接日志 | 查看所有客户/线索/商机/合同交接的历史记录 |