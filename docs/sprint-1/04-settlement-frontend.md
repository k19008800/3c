# 代理结算对账 — 前端组件 + 页面交互

> **所属 Sprint**：Sprint 1 | **优先级**：P0 | **版本**：V1.5

---

## 1. 页面路由与入口

| 端 | 路径 | 页面文件 | 权限 | 入口 | Tab |
|----|------|---------|------|------|-----|
| 管理端 | `/admin/finance` | `web/src/pages/admin/Finance.tsx` | super_admin/admin/finance | 侧边栏→财务管理 | "结算管理" Tab |
| 代理端 | `/agent/finance` | `web/src/pages/agent/Finance.tsx` | agent | 侧边栏→我的财务 | "结算对账" Tab |

### 集成方式

```typescript
// admin/Finance.tsx — 在已有 Tab 数组追加
const TABS = [
  { key: 'overview',    label: '概览',     component: FinanceOverview },
  { key: 'recharge',    label: '充值订单', component: RechargeOrders },
  { key: 'withdraw',    label: '提现管理', component: WithdrawManage },
  { key: 'commission',  label: '佣金记录', component: CommissionLogs },
  { key: 'settlement',  label: '结算管理', component: SettlementModule },   // ← 新增
  { key: 'invoice',     label: '发票管理', component: InvoiceManage },
];

// agent/Finance.tsx — 同理
const AGENT_TABS = [
  { key: 'overview',     label: '财务概览', component: AgentFinanceOverview },
  { key: 'withdraw',     label: '提现记录', component: AgentWithdrawRecords },
  { key: 'settlements',  label: '结算对账', component: AgentSettlementsPage }, // ← 新增
];
```

---

## 2. TypeScript 类型文件

**文件**：`web/src/types/settlement.ts`（新建）

```typescript
// ─── 状态枚举 ───
export type CycleStatus = 'open' | 'closed' | 'settled';
export type SettlementStatus = 'pending' | 'settled';
export type SettlementAction = 'generate' | 'confirm' | 'auto_confirm' | 'adjust';

// ─── 结算周期 ───
export interface SettlementCycle {
  id: number;
  periodStart: string;      // 'YYYY-MM-DD'
  periodEnd: string;
  status: CycleStatus;
  generatedAt: string | null;
  settledAt: string | null;
  totalBills: number;
  pendingBills: number;
  settledBills: number;
}

// ─── 结算单（列表项） ───
export interface SettlementListItem {
  id: number;
  cycleId: number;
  agentId: number;
  agentName: string;
  totalCommission: string;     // DECIMAL 字符串
  settledAmount: string;
  adjustmentAmount: string;
  adjustmentReason: string | null;
  status: SettlementStatus;
  confirmedAt: string | null;
  settledAt: string | null;
  createdAt: string;
}

// ─── 结算单（详情） ───
export interface SettlementDetail {
  id: number;
  cycleId: number;
  periodStart: string;
  periodEnd: string;
  cycleStatus: CycleStatus;
  agentId: number;
  agentName: string;
  agentEmail: string;
  totalCommission: string;
  settledAmount: string;
  adjustmentAmount: string;
  adjustmentReason: string | null;
  status: SettlementStatus;
  detailCount: number;
  confirmedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  logs: SettlementLog[];
}

// ─── 操作日志 ───
export interface SettlementLog {
  id: number;
  action: SettlementAction;
  operatorRole: string;       // system / agent / admin
  operatorName: string | null;
  detail: string | null;
  createdAt: string;
}

// ─── 明细行 ───
export interface SettlementDetailRow {
  id: number;
  commissionId: number;
  amount: string;
  clientUserId: number;
  clientName: string;          // 管理端有，代理端无
  model: string | null;
  tokens: number | null;
  commissionRate: string | null;
  createdAt: string;
}

// ─── 明细汇总 ───
export interface SettlementDetailSummary {
  totalAmount: string;
  totalTokens: number;
  modelCount: number;
}

// ─── 状态元数据 ───
export const CYCLE_STATUS_META: Record<CycleStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  open:    { label: '进行中', color: '#6b7280', bgColor: '#f3f4f6', icon: '🔵' },
  closed:  { label: '已关账', color: '#3b82f6', bgColor: '#dbeafe', icon: '🔒' },
  settled: { label: '已结算', color: '#22c55e', bgColor: '#dcfce7', icon: '✅' },
};

export const SETTLEMENT_STATUS_META: Record<SettlementStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  pending: { label: '待确认', color: '#d97706', bgColor: '#fef3c7', icon: '🟡' },
  settled: { label: '已结算', color: '#22c55e', bgColor: '#dcfce7', icon: '✅' },
};

export const SETTLEMENT_ACTION_LABELS: Record<SettlementAction, { label: string; icon: string }> = {
  generate:     { label: '关账生成',     icon: '🔨' },
  confirm:      { label: '代理确认',     icon: '✅' },
  auto_confirm: { label: '系统自动确认', icon: '🤖' },
  adjust:       { label: '管理员调整',   icon: '✏️' },
};

// ─── 格式化 ───
export function formatCurrency(amountStr: string | number, decimals = 2): string {
  const num = typeof amountStr === 'string' ? parseFloat(amountStr) : amountStr;
  const prefix = num < 0 ? '-' : '';
  return `${prefix}¥${Math.abs(num).toFixed(decimals)}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
```

---

## 3. 管理端组件

### 3.1 组件树

```
SettlementModule（容器 — 双视图切换）
├── [view=cycles] SettlementCyclesList
│   ├── 周期表格
│   ├── SettlementCreateDialog（创建周期弹窗）
│   └── Pagination
└── [view=list]  SettlementList
    ├── ← 返回按钮 + 周期信息头
    ├── FilterBar（状态 Tab + 搜索）
    ├── 结算单表格
    │   └── SettlementDetailInline（展开行）
    │       ├── 明细子表
    │       ├── 操作日志
    │       ├── SettlementAdjustDialog（调整弹窗）
    │       └── SettlementExportBtn（导出按钮）
    └── Pagination
```

### 3.2 SettlementModule — 容器

```typescript
export function SettlementModule() {
  const [view, setView] = useState<'cycles' | 'list'>('cycles');
  const [selectedCycle, setSelectedCycle] = useState<{
    id: number; start: string; end: string;
  } | null>(null);

  if (view === 'list' && selectedCycle) {
    return (
      <SettlementList
        cycleId={selectedCycle.id}
        periodStart={selectedCycle.start}
        periodEnd={selectedCycle.end}
        onBack={() => { setView('cycles'); setSelectedCycle(null); }}
      />
    );
  }

  return (
    <SettlementCyclesList
      onViewBills={(cycle) => {
        setSelectedCycle({ id: cycle.id, start: cycle.periodStart, end: cycle.periodEnd });
        setView('list');
      }}
    />
  );
}
```

### 3.3 SettlementCyclesList — 周期列表

```
┌─ 结算管理 ──────────────────────────────────────────────────┐
│                                                              │
│  [创建新结算周期]                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 结算周期           │ 状态     │ 账单数 │ 待确认 │ 已结算 │ 操作  │
│  │─────────────────────│──────────│────────│────────│───────│───────│
│  │ 2026-07-01~07-31   │ 🔒已关账 │ 48     │ 8 🟡  │ 40 ✅ │ [详情] │
│  │ 2026-06-01~06-30   │ ✅已结算 │ 50     │ 0      │ 50    │ [详情] │
│  │ 2026-05-01~05-31   │ ✅已结算 │ 45     │ 0      │ 45    │ [详情] │
│  └──────────────────────────────────────────────────────────┘ │
│  < 1 2 3 >                                                   │
│                                                              │
│  Loading: 5 行骨架屏                                         │
│  Empty:  "暂无结算周期" + [创建新结算周期] 按钮              │
│  Error:  红色提示 + [重试]                                   │
└──────────────────────────────────────────────────────────────┘
```

```typescript
interface SettlementCyclesListProps {
  onViewBills: (cycle: { id: number; periodStart: string; periodEnd: string }) => void;
}

export function SettlementCyclesList({ onViewBills }: SettlementCyclesListProps) {
  const [page, setPage] = useState(1);
  const limit = 20;
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/admin/finance/settlement-cycles?limit=${limit}&offset=${(page - 1) * limit}`,
    fetcher,
  );

  if (isLoading) return <TableSkeleton rows={5} cols={6} />;
  if (error) return <ErrorBlock message="加载结算周期失败" onRetry={() => mutate()} />;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        message="暂无结算周期"
        action={<SettlementCreateDialog onSuccess={mutate} />}
      />
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <SettlementCreateDialog onSuccess={mutate} />
      </div>

      <table>
        <thead>
          <tr>
            <th>结算周期</th>
            <th>状态</th>
            <th>账单数</th>
            <th>待确认</th>
            <th>已结算</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((cycle: SettlementCycle) => (
            <tr key={cycle.id}>
              <td>{cycle.periodStart} ~ {cycle.periodEnd}</td>
              <td><StatusTag meta={CYCLE_STATUS_META[cycle.status]} /></td>
              <td>{cycle.totalBills}</td>
              <td>{cycle.pendingBills > 0 ? <span className="text-amber-600 font-medium">{cycle.pendingBills} 🟡</span> : '0'}</td>
              <td>{cycle.settledBills > 0 ? <span className="text-green-600">{cycle.settledBills} ✅</span> : '0'}</td>
              <td>
                <Button size="sm" variant="outline" onClick={() => onViewBills(cycle)}>
                  查看账单
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination page={page} total={Math.ceil(data.total / limit)} onChange={setPage} />
    </div>
  );
}
```

### 3.4 SettlementCreateDialog — 创建周期弹窗

```
┌─ 创建结算周期 ─────────────────────────────────────────────┐
│                                                            │
│ 创建后将自动关账并生成所有正式代理的结算账单                  │
│                                                            │
│ 周期开始：  [2026-07-01] 📅  （默认上月 1 日）              │
│ 周期结束：  [2026-07-31] 📅  （默认上月最后一天）            │
│                                                            │
│ ⚠️ 同一周期不可重复创建                                     │
│                                                            │
│ Error: "结束日期必须大于开始日期"                           │
│ Error: "结算周期已关账"                                     │
│ Error: "结算周期不能超过 366 天"                            │
│                                                            │
│ [取消]                                   [创建并关账]       │
└────────────────────────────────────────────────────────────┘
```

```typescript
interface SettlementCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SettlementCreateDialog({ open, onClose, onSuccess }: SettlementCreateDialogProps) {
  // 默认上月
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [periodStart, setPeriodStart] = useState(formatDate(lastMonth.toISOString()));
  const [periodEnd, setPeriodEnd] = useState(formatDate(lastMonthEnd.toISOString()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/finance/settlement-cycles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd }),
      });
      const json = await res.json();
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(json.message || '创建失败');
      }
    } catch (e: any) {
      setError('网络错误: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle>创建结算周期</DialogTitle>
        <DialogDescription>
          创建后将自动关账并生成所有正式代理的结算账单
        </DialogDescription>

        <div className="space-y-3">
          <div>
            <Label>周期开始</Label>
            <DatePicker value={periodStart} onChange={setPeriodStart} />
          </div>
          <div>
            <Label>周期结束</Label>
            <DatePicker value={periodEnd} onChange={setPeriodEnd} />
          </div>
        </div>

        <Alert severity="warning">
          ⚠️ 同一周期不可重复创建
        </Alert>

        {error && <Alert severity="error">{error}</Alert>}

        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={loading} onClick={handleSubmit}>
            创建并关账
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

**按钮状态**：

| 状态 | 文本 | 禁用 |
|------|------|------|
| 初始 | 创建并关账 | false |
| 提交中 | 创建中… | true |
| 409 已关账 | 创建并关账 | false（显示 error） |
| 400 格式错误 | 创建并关账 | false（显示 error） |

### 3.5 SettlementList — 结算单列表

```
┌─ ← 返回周期列表                                             │
│                                                              │
│ 结算周期: 2026-07-01 ~ 2026-07-31  | 🔒已关账               │
│                                                              │
│ [全部 48] [🟡 待确认 8] [✅ 已结算 40]                      │
│                                                              │
│ 🔍 搜索代理名称/邮箱...                                      │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 代理名称      │ 总佣金     │ 结算金额   │ 调整     │ 状态 │ 操作 │
│ │──────────────│────────────│───────────│─────────│──────│──────│
│ │ TechAgent    │ ¥3,456.78  │ ¥3,433.28 │ -¥23.50 │ 🟡   │ [▼]  │
│ │ ├─ #15 ──────────────────────────────────────────────────┤ │
│ │ │ 总佣金 ¥3,456.78    调整 -¥23.50    结算金额 ¥3,433.28  │ │
│ │ │ 状态: 🟡 待确认    创建: 2026-08-01 02:00              │ │
│ │ │ ── 明细 ──                                               │ │
│ │ │ 日期       │ 客户   │ 模型        │ Token │ 佣金    │  │ │
│ │ │ 2026-07-15 │ 客户A  │ gpt-4       │ 8500  │ ¥12.50 │  │ │
│ │ │ 2026-07-15 │ 客户B  │ claude-3   │ 12000 │ ¥18.00 │  │ │
│ │ │ < 1 2 3 >  (共 145 条)                                  │ │
│ │ │ ── 操作日志 ──                                          │ │
│ │ │ 🔨 关账生成   2026-08-01 02:00                         │ │
│ │ │ ✏️ 管理员调整  2026-08-01 10:30                        │ │
│ │ │                          [✏️调整金额] [📥导出 CSV]     │ │
│ │ └─────────────────────────────────────────────────────────┘ │
│ │ CloudService │ ¥1,200.00  │ ¥1,200.00 │ ¥0.00  │ ✅   │ [▼] │
│ └──────────────────────────────────────────────────────────┘ │
│ < 1 2 3 >                                                    │
└──────────────────────────────────────────────────────────────┘
```

```typescript
interface SettlementListProps {
  cycleId: number;
  periodStart: string;
  periodEnd: string;
  onBack: () => void;
}

export function SettlementList({ cycleId, periodStart, periodEnd, onBack }: SettlementListProps) {
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = 20;

  // debounce search 300ms
  const debouncedSearch = useDebounce(search, 300);

  const queryStr = buildQueryString({
    cycle_id: cycleId,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: debouncedSearch || undefined,
    limit,
    offset: (page - 1) * limit,
  });

  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/admin/finance/settlements?${queryStr}`,
    fetcher,
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" onClick={onBack}>← 返回</Button>
        <span className="text-lg font-medium">
          结算周期: {periodStart} ~ {periodEnd}
        </span>
      </div>

      {/* 状态 Tab */}
      <div className="flex gap-2 mb-4">
        <FilterTab label="全部" active={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); setPage(1); }} />
        <FilterTab label="🟡 待确认" active={statusFilter === 'pending'} onClick={() => { setStatusFilter('pending'); setPage(1); }} />
        <FilterTab label="✅ 已结算" active={statusFilter === 'settled'} onClick={() => { setStatusFilter('settled'); setPage(1); }} />
      </div>

      {/* 搜索 */}
      <Input
        placeholder="搜索代理名称/邮箱…"
        value={search}
        onChange={(e) => setSearch(e.target.value.slice(0, 50))}
        className="max-w-xs"
      />

      {/* 表格 */}
      {isLoading ? (
        <TableSkeleton rows={10} cols={6} />
      ) : error ? (
        <ErrorBlock message="加载结算单失败" onRetry={() => mutate()} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState message="暂无结算单" />
      ) : (
        <table>
          <thead>
            <tr>
              <th>代理名称</th>
              <th>总佣金</th>
              <th>结算金额</th>
              <th>调整</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((item: SettlementListItem) => (
              <Fragment key={item.id}>
                <tr
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  <td>{item.agentName}</td>
                  <td>{formatCurrency(item.totalCommission)}</td>
                  <td className="font-medium">{formatCurrency(item.settledAmount)}</td>
                  <td>
                    {item.adjustmentAmount !== '0.0000' ? (
                      <span className={parseFloat(item.adjustmentAmount) < 0 ? 'text-red-500' : 'text-green-600'}>
                        {parseFloat(item.adjustmentAmount) < 0 ? '' : '+'}{formatCurrency(item.adjustmentAmount)}
                      </span>
                    ) : '—'}
                  </td>
                  <td><StatusTag meta={SETTLEMENT_STATUS_META[item.status]} /></td>
                  <td>
                    <Button size="sm" variant="ghost">
                      {expandedId === item.id ? '收起' : '展开'}
                    </Button>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr>
                    <td colSpan={6}>
                      <SettlementDetailInline
                        settlementId={item.id}
                        onRefresh={mutate}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {data && data.total > limit && (
        <Pagination page={page} total={Math.ceil(data.total / limit)} onChange={setPage} />
      )}
    </div>
  );
}
```

### 3.6 SettlementDetailInline — 展开详情

```typescript
interface SettlementDetailInlineProps {
  settlementId: number;
  onRefresh: () => void;
}

export function SettlementDetailInline({ settlementId, onRefresh }: SettlementDetailInlineProps) {
  const [detailPage, setDetailPage] = useState(1);
  const detailLimit = 20;

  const { data: detail, error: detailError } = useSWR(
    `/api/v1/admin/finance/settlements/${settlementId}`,
    fetcher,
  );

  const { data: detailsData, error: detailsError } = useSWR(
    `/api/v1/admin/finance/settlements/${settlementId}/details?limit=${detailLimit}&offset=${(detailPage - 1) * detailLimit}`,
    fetcher,
  );

  if (detailError) return <ErrorBlock message="加载详情失败" />;
  if (!detail) return <div className="p-4 animate-pulse">加载中…</div>;

  const settlement = detail.settlement;
  const logs = detail.logs;

  return (
    <div className="bg-gray-50 p-4 space-y-4">
      {/* 汇总信息 */}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <div className="text-sm text-gray-500">总佣金</div>
          <div className="text-lg font-medium">{formatCurrency(settlement.totalCommission)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">调整</div>
          <div className={`text-lg font-medium ${parseFloat(settlement.adjustmentAmount) < 0 ? 'text-red-500' : 'text-green-600'}`}>
            {settlement.adjustmentAmount !== '0.0000' ? formatCurrency(settlement.adjustmentAmount) : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">结算金额</div>
          <div className="text-lg font-bold text-blue-600">{formatCurrency(settlement.settledAmount)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">状态</div>
          <StatusTag meta={SETTLEMENT_STATUS_META[settlement.status]} />
        </div>
      </div>

      {/* 调整原因 */}
      {settlement.adjustmentReason && (
        <div className="text-sm">
          <span className="text-gray-500">调整原因：</span>
          {settlement.adjustmentReason}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        {settlement.status === 'pending' && (
          <SettlementAdjustDialog settlementId={settlementId} currentAmount={settlement.settledAmount} onSuccess={onRefresh} />
        )}
        <SettlementExportBtn settlementId={settlementId} apiPath="/api/v1/admin/finance/settlements" />
      </div>

      {/* 明细表 */}
      <div>
        <h5 className="font-medium mb-2">佣金明细（共 {detailsData?.summary?.totalAmount ? `${Math.ceil(parseFloat(detailsData.summary.totalAmount))} 条` : '…'}）</h5>
        {detailsError ? (
          <div className="text-red-500 text-sm">明细加载失败</div>
        ) : !detailsData ? (
          <div className="text-gray-400 text-sm">加载中…</div>
        ) : (
          <>
            <div className="mb-2 text-sm text-gray-500">
              汇总：{formatCurrency(detailsData.summary.totalAmount)} | Token {detailsData.summary.totalTokens?.toLocaleString()} | {detailsData.summary.modelCount} 个模型
            </div>
            <table className="text-sm">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>客户ID</th>
                  <th>客户姓名</th>
                  <th>模型</th>
                  <th>Token</th>
                  <th>佣金</th>
                  <th>佣金率</th>
                </tr>
              </thead>
              <tbody>
                {detailsData.rows.map((d: SettlementDetailRow) => (
                  <tr key={d.id}>
                    <td>{formatDate(d.createdAt)}</td>
                    <td>{d.clientUserId}</td>
                    <td>{d.clientName || '—'}</td>
                    <td>{d.model || '—'}</td>
                    <td>{d.tokens?.toLocaleString() || 0}</td>
                    <td>{formatCurrency(d.amount)}</td>
                    <td>{d.commissionRate ? `${d.commissionRate}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* 分页 */}
            {/* ... */}
          </>
        )}
      </div>

      {/* 操作日志 */}
      <div>
        <h5 className="font-medium mb-2">操作日志</h5>
        <div className="space-y-1 text-sm">
          {logs.map((log: SettlementLog) => (
            <div key={log.id} className="flex items-start gap-2">
              <span>{SETTLEMENT_ACTION_LABELS[log.action].icon}</span>
              <span className="font-medium">{SETTLEMENT_ACTION_LABELS[log.action].label}</span>
              <span className="text-gray-500">{log.operatorRole}</span>
              <span className="text-gray-400">{formatDateTime(log.createdAt)}</span>
              {log.detail && <span className="text-gray-600">{log.detail}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 3.7 SettlementAdjustDialog — 调整弹窗

```
┌─ 调整结算金额 ─────────────────────────────────────────────┐
│                                                            │
│ 结算单 #15                                                │
│ 代理：TechAgent                                           │
│ 当前结算金额：¥3,456.78                                   │
│                                                            │
│ 调整金额（正=加，负=减）：                                  │
│ ┌──────────────┐                                          │
│ │ -23.50       │                                          │
│ └──────────────┘                                          │
│                                                            │
│ 调整后金额：¥3,433.28（自动计算）                          │
│                                                            │
│ 调整原因（必填，5-500 字）：                                │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 客户退款扣除佣金                                       │ │
│ │                                                        │ │
│ └────────────────────────────────────────────────────────┘ │ │
│ 14 / 500                                                   │
│                                                            │
│ ⚠️ 调整后代理将看到调整原因                                  │
│                                                            │
│ Error: "调整后金额不能为负数"                               │
│                                                            │
│ [取消]                              [确认调整]             │
└────────────────────────────────────────────────────────────┘
```

```typescript
interface SettlementAdjustDialogProps {
  settlementId: number;
  currentAmount: string;
  onSuccess: () => void;
}

export function SettlementAdjustDialog({ settlementId, currentAmount, onSuccess }: SettlementAdjustDialogProps) {
  const [open, setOpen] = useState(false);
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentNum = parseFloat(currentAmount);
  const adjustNum = parseFloat(adjustment || '0');
  const newAmount = currentNum + adjustNum;
  const isNegative = newAmount < 0;
  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= 500;

  const canSubmit = !loading && adjustment !== '' && !isNegative && reasonValid;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/finance/settlements/${settlementId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustmentAmount: adjustNum,
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setOpen(false);
        setAdjustment('');
        setReason('');
        onSuccess();
      } else {
        setError(json.message || '调整失败');
      }
    } catch (e: any) {
      setError('网络错误: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">✏️ 调整金额</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>调整结算金额</DialogTitle>
        <DialogDescription>
          结算单 #{settlementId} | 当前金额 {formatCurrency(currentAmount)}
        </DialogDescription>

        <div className="space-y-3">
          <div>
            <Label>调整金额（正=加，负=减）</Label>
            <Input
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="-23.50"
              step="0.01"
            />
            <div className={`text-sm mt-1 ${isNegative ? 'text-red-500' : 'text-gray-600'}`}>
              调整后金额：{formatCurrency(newAmount.toFixed(4))}
              {isNegative && ' ⚠️ 不能为负数'}
            </div>
          </div>

          <div>
            <Label>调整原因（5-500 字）</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="客户退款扣除佣金…"
              rows={3}
              maxLength={500}
            />
            <div className="text-xs text-gray-400">{reason.trim().length} / 500</div>
          </div>
        </div>

        <Alert severity="warning">
          ⚠️ 调整后代理将看到调整原因
        </Alert>

        {error && <Alert severity="error">{error}</Alert>}

        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" disabled={!canSubmit} loading={loading} onClick={handleSubmit}>
            确认调整
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 4. 代理端组件

### 4.1 组件树

```
AgentSettlementsPage（页面容器）
├── AgentSettlementSummary（汇总卡片）
│   ├── 待确认结算金
│   └── 已结算总额
├── FilterBar（状态 Tab）
├── AgentSettlementsTable（列表表格）
│   └── AgentSettlementDetailInline（展开行）
│       ├── 明细子表（无客户姓名列）
│       ├── 操作日志
│       ├── AgentSettlementConfirmBtn（确认按钮）
│       └── SettlementExportBtn（导出）
└── Pagination
```

### 4.2 AgentSettlementSummary — 汇总卡片

```
┌─ 待确认结算金 ──────────┬─ 已结算总额 ──────────────────┐
│                          │                                │
│  ¥8,433.28               │  ¥12,100.00                   │
│  2 笔待确认               │  可提现                       │
│                          │                                │
└──────────────────────────┴────────────────────────────────┘
```

```typescript
export function AgentSettlementSummary({ rows }: { rows: SettlementListItem[] }) {
  const pendingAmount = rows
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + parseFloat(r.settledAmount || '0'), 0);
  const pendingCount = rows.filter(r => r.status === 'pending').length;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="bg-amber-50 border-amber-200">
        <div className="text-sm text-amber-600">待确认结算金</div>
        <div className="text-2xl font-bold text-amber-700">
          {formatCurrency(pendingAmount.toFixed(4))}
        </div>
        <div className="text-xs text-amber-600">
          {pendingCount > 0 ? `${pendingCount} 笔待确认` : '无待确认账单'}
        </div>
      </Card>
      <Card className="bg-green-50 border-green-200">
        <div className="text-sm text-green-600">已结算总额（可提现）</div>
        <div className="text-2xl font-bold text-green-700">
          {/* 从代理 profile 获取，不从列表算 */}
          <AgentBalanceFetcher />
        </div>
        <div className="text-xs text-green-600">可提现</div>
      </Card>
    </div>
  );
}
```

### 4.3 AgentSettlementConfirmBtn — 确认按钮

```
┌─ 确认结算单 ──────────────────────────────────────────────┐
│                                                            │
│ 结算周期：2026-07-01 ~ 2026-07-31                          │
│ 结算金额：¥3,433.28                                       │
│                                                            │
│ 确认后该笔金额将转入可提现余额                              │
│ 确认后如需调整请联系管理员                                  │
│ 3 天未确认系统将自动确认                                    │
│                                                            │
│ [取消]                              [确认结算]             │
└────────────────────────────────────────────────────────────┘
```

```typescript
interface AgentSettlementConfirmBtnProps {
  settlementId: number;
  settledAmount: string;
  periodLabel: string;
  onSuccess: () => void;
}

export function AgentSettlementConfirmBtn({ settlementId, settledAmount, periodLabel, onSuccess }: AgentSettlementConfirmBtnProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/agent/settlements/${settlementId}/confirm`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setOpen(false);
        onSuccess();
      } else {
        setError(json.message || '确认失败');
      }
    } catch (e: any) {
      setError('网络错误: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="primary" size="sm">确认结算</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>确认结算单</DialogTitle>
        <div className="space-y-2">
          <div>结算周期：{periodLabel}</div>
          <div className="text-2xl font-bold text-blue-600">{formatCurrency(settledAmount)}</div>
        </div>
        <Alert severity="info">
          <ul className="text-sm">
            <li>确认后该笔金额将转入可提现余额</li>
            <li>确认后如需调整请联系管理员</li>
            <li>3 天未确认系统将自动确认</li>
          </ul>
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" loading={loading} onClick={handleConfirm}>
            确认结算
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

### 4.4 SettlementExportBtn — 通用导出按钮

```typescript
interface SettlementExportBtnProps {
  settlementId: number;
  apiPath: string;  // '/api/v1/admin/finance/settlements' or '/api/v1/agent/settlements'
  label?: string;
}

export function SettlementExportBtn({ settlementId, apiPath, label = '导出 CSV' }: SettlementExportBtnProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiPath}/${settlementId}/export${apiPath.includes('/agent/') ? '-csv' : ''}`);
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settlement_${settlementId}_details.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('导出失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      {loading ? '导出中…' : `📥 ${label}`}
    </Button>
  );
}
```

---

## 5. API 对接清单

| 组件 | API | 方法 | 触发 | 说明 |
|------|-----|------|------|------|
| SettlementCyclesList | /api/v1/admin/finance/settlement-cycles | GET | 挂载 + 翻页 | 60s SWR |
| SettlementCreateDialog | …/settlement-cycles/generate | POST | 确认创建 | 200→刷新+关闭; 409→显示 error |
| SettlementList | …/settlements?cycle_id= | GET | 挂载 + 筛选 + 搜索 + 翻页 | debounce 300ms |
| SettlementDetailInline | …/settlements/:id | GET | 展开行 | 含 logs |
| SettlementDetailInline 明细 | …/settlements/:id/details | GET | 展开 + 明细翻页 | 含 summary |
| SettlementAdjustDialog | …/settlements/:id/adjust | POST | 确认调整 | 200→刷新; 400→显示 error |
| SettlementExportBtn (admin) | …/settlements/:id/export | GET | 点击导出 | Blob 下载 |
| AgentSettlementsPage | /api/v1/agent/settlements | GET | 挂载 + 筛选 + 刷新 | 含 stats |
| AgentSettlementDetailInline | /api/v1/agent/settlements/:id | GET | 展开行 | 验证归属 |
| AgentSettlementConfirmBtn | …/settlements/:id/confirm | POST | 确认 | 200→刷新; 400→显示 error |
| SettlementExportBtn (agent) | …/settlements/:id/export-csv | GET | 点击导出 | Blob 下载 |
