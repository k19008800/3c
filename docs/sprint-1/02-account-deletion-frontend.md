# 账号注销 — 前端组件 + 页面交互

> **所属 Sprint**：Sprint 1 | **优先级**：P0 | **版本**：V1.5

---

## 1. 页面路由与入口

| 端 | 路径 | 页面文件 | 权限 | 入口位置 |
|----|------|---------|------|---------|
| 用户端 | `/settings/security` | `web/src/pages/user/SecuritySettings.tsx` | 已登录 | 设置→安全→账号注销 |
| 管理端 | `/admin/deletion` | `web/src/pages/admin/AccountDeletion.tsx` | super_admin/admin | 侧边栏→用户管理→注销审核 |

### 路由注册

```typescript
// App.tsx
const AccountDeletion = lazy(() => import('@/pages/admin/AccountDeletion'));
<Route path="/admin/deletion" element={<AdminGuard><AccountDeletion /></AdminGuard>} />
```

### 侧边栏配置

```typescript
// Sidebar.tsx — 管理端侧边栏
{
  section: '用户管理',
  items: [
    { label: '用户列表', path: '/admin/users' },
    { label: '实名审核', path: '/admin/verification' },
    { label: '注销审核', path: '/admin/deletion', badge: 'deletionCount' }, // 动态角标
  ],
}
```

**角标逻辑**：`deletionCount` 从 `GET /api/v1/admin/deletion?status=pending,cooling` 的 `stats` 中取 `pending + cooling` 数量。为 0 时不显示角标。使用 SWR 60 秒轮询。

---

## 2. TypeScript 类型文件

**文件**：`web/src/types/deletion.ts`（新建）

```typescript
// ─── 状态枚举 ───
export type DeletionStatus = 'pending' | 'cooling' | 'completed' | 'cancelled' | 'rejected';
export type CheckItemKey =
  | 'balance_cleared'
  | 'no_pending_withdraw'
  | 'no_unsettled_bills'
  | 'no_active_keys'
  | 'no_pending_invoices'
  | 'no_active_agent';

// ─── 请求/响应类型 ───
export interface DeletionRequest {
  id: number;
  userId: number;
  reason: string | null;
  status: DeletionStatus;
  coolingDeadline: string | null;       // ISO 8601
  cancelledAt: string | null;
  completedAt: string | null;
  rejectedReason: string | null;
  processedBy: number | null;
  createdAt: string;
  updatedAt: string;
  checks: DeletionCheck[];
}

export interface DeletionCheck {
  checkItem: CheckItemKey;
  passed: 'true' | 'false';
  detail: string;
}

export interface DeletionListRow {
  id: number;
  userId: number;
  userEmail: string;
  userNickname: string;
  reason: string | null;
  status: DeletionStatus;
  coolingDeadline: string | null;
  createdAt: string;
}

export interface DeletionListResponse {
  rows: DeletionListRow[];
  stats: {
    pending: number;
    cooling: number;
    completed: number;
    cancelled: number;
    rejected: number;
  };
}

export interface DeletionSubmitResponse {
  requestId: number;
  coolingDeadline: string;
  freezeDays: number;
}

export interface DeletionCheckFailedResponse {
  checks: DeletionCheck[];
}

// ─── 状态元数据 ───
export const DELETION_STATUS_META: Record<DeletionStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
}> = {
  pending:   { label: '待处理',   color: '#6b7280', bgColor: '#f3f4f6', icon: '⏳', description: '注销条件未全通过，待用户处理' },
  cooling:   { label: '冷静期',    color: '#d97706', bgColor: '#fef3c7', icon: '⏱️', description: '7 天冷静期内，账号已冻结' },
  completed: { label: '已注销',    color: '#dc2626', bgColor: '#fee2e2', icon: '🗑️', description: '账号已完成注销，数据已脱敏' },
  cancelled: { label: '已撤销',    color: '#6b7280', bgColor: '#f3f4f6', icon: '↩️', description: '用户主动撤销注销申请' },
  rejected:  { label: '已驳回',    color: '#7c3aed', bgColor: '#ede9fe', icon: '🚫', description: '管理员驳回注销申请' },
};

export const CHECK_ITEM_LABELS: Record<CheckItemKey, string> = {
  balance_cleared: '余额已清零',
  no_pending_withdraw: '无进行中提现',
  no_unsettled_bills: '无未完成充值',
  no_active_keys: '无活跃 API Key',
  no_pending_invoices: '无进行中发票',
  no_active_agent: '无代理客户绑定',
};

export const CHECK_ITEM_ACTION_HINTS: Record<CheckItemKey, { label: string; link: string }> = {
  balance_cleared:         { label: '前往消费', link: '/dashboard' },
  no_pending_withdraw:     { label: '查看提现', link: '/agent/finance?tab=withdraw' },
  no_unsettled_bills:      { label: '查看充值', link: '/dashboard' },
  no_active_keys:          { label: '管理 API Key', link: '/dashboard?tab=api-keys' },
  no_pending_invoices:     { label: '查看发票', link: '/dashboard?tab=invoices' },
  no_active_agent:         { label: '管理客户', link: '/agent/clients' },
};

// ─── 金额格式化 ───
export function formatCurrency(amount: number | string | null): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  return `¥${n.toFixed(2)}`;
}

// ─── 倒计时格式化 ───
export function formatCountdown(deadline: string | null): { days: number; hours: number; minutes: number; seconds: number; isExpired: boolean } {
  if (!deadline) return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { days, hours, minutes, seconds, isExpired: false };
}
```

---

## 3. 用户端组件

### 3.1 组件树

```
SecuritySettings（已有页面）
└── AccountDeletionPanel（新增区块）
    ├── AccountDeletionStatus           — 有记录时显示状态
    │   ├── DeletionCoolingTimer        — cooling 时倒计时
    │   ├── DeletionChecklistView       — 检查清单
    │   └── DeletionCancelButton       — cooling 时显示撤销按钮
    └── AccountDeletionForm             — 无记录时显示提交表单
        ├── DeletionCheckSummary        — 实时检查清单（提交前预览）
        └── DeletionSubmitButton        — 提交按钮
```

### 3.2 AccountDeletionPanel — 容器

```typescript
interface AccountDeletionPanelProps {}

export function AccountDeletionPanel() {
  const { data, error, isLoading, mutate } = useSWR<DeletionRequest | null>(
    '/api/v1/me/deletion',
    fetcher,
    { revalidateOnFocus: true, revalidateOnReconnect: true }
  );

  // ── Loading 状态 ──
  if (isLoading) return <DeletionPanelSkeleton />;

  // ── Error 状态 ──
  if (error && error.status !== 404) {
    return <ErrorBlock
      message="加载注销信息失败"
      detail={error.message}
      onRetry={() => mutate()}
    />;
  }

  // ── Empty 状态（404 = 无记录） ──
  if (!data) {
    return <AccountDeletionForm onSuccess={mutate} />;
  }

  // ── 有记录 ──
  return <AccountDeletionStatus request={data} onRefresh={mutate} />;
}
```

**状态处理矩阵**：

| 状态 | isLoading | error | data | 渲染 |
|------|-----------|-------|------|------|
| 首次加载 | true | — | — | 骨架屏 5 行 |
| 加载失败 | false | Error | — | 红色错误块 + [重试] |
| 404（无记录） | false | 404 | — | AccountDeletionForm |
| 有记录 | false | — | DeletionRequest | AccountDeletionStatus |
| 刷新中 | false | — | 旧 data | 旧 UI + 顶部细线进度条 |

### 3.3 AccountDeletionForm — 提交表单

```
┌─ 账号注销 ──────────────────────────────────────────┐
│                                                       │
│ ⚠️ 注销须知                                            │
│ • 注销后个人数据将被脱敏，不可恢复                      │
│ • 提交后进入 7 天冷静期，期间账号将被冻结               │
│ • 冷静期内可随时撤销                                   │
│ • 有进行中的充值/提现/发票不可注销                     │
│                                                       │
│ 注销原因（选填，最多 500 字）：                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 不再使用该平台…                                   │  │
│ │                                                  │  │
│ └──────────────────────────────────────────────────┘  │
│ 0 / 500                                               │
│                                                       │
│ ── 注销条件检查 ──                                    │
│ ✅ 余额已清零                                          │
│ ❌ 存在 2 个活跃的 API Key [→ 管理 API Key]            │
│ ✅ 无进行中提现                                        │
│ ✅ 无未完成充值                                        │
│ ❌ 存在 1 笔进行中的发票 [→ 查看发票]                 │
│ ✅ 无代理客户绑定                                      │
│                                                       │
│ ⚠️ 有 2 项条件未通过，暂时无法提交注销申请             │
│                                                       │
│ [取消]                          [提交注销申请] 🔒    │
└───────────────────────────────────────────────────────┘
```

```typescript
interface AccountDeletionFormProps {
  onSuccess: () => void;
}

export function AccountDeletionForm({ onSuccess }: AccountDeletionFormProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorChecks, setErrorChecks] = useState<DeletionCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 字数统计
  const charCount = reason.length;
  const maxChars = 500;
  const overLimit = charCount > maxChars;
  const trimmedReason = reason.trim();

  // 提交
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setErrorChecks(null);
    try {
      const res = await fetch('/api/v1/me/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmedReason || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        // 成功 → 重新拉取数据
        onSuccess();
      } else if (json.error === 'DELETION_CHECKS_FAILED') {
        // 条件未通过 → 展示失败清单
        setErrorChecks(json.data.checks);
      } else if (json.error === 'ACTIVE_DELETION_EXISTS') {
        // 已有申请 → 重新拉取
        onSuccess();
      } else {
        setError(json.message || '提交失败');
      }
    } catch (e: any) {
      setError('网络错误，请稍后重试: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 按钮禁用条件
  const buttonDisabled = submitting || overLimit;

  return (
    <Card>
      {/* 警告区 */}
      <Alert severity="warning">
        <ul>
          <li>注销后个人数据将被脱敏，不可恢复</li>
          <li>提交后进入 7 天冷静期，期间账号将被冻结</li>
          <li>冷静期内可随时撤销</li>
          <li>有进行中的充值/提现/发票不可注销</li>
        </ul>
      </Alert>

      {/* 原因输入 */}
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder="不再使用该平台…"
        maxLength={500}
        rows={4}
      />
      <div className={overLimit ? 'text-red-500' : 'text-gray-400'}>
        {charCount} / {maxChars}
      </div>

      {/* 失败清单 */}
      {errorChecks && (
        <DeletionCheckSummary checks={errorChecks} />
      )}

      {/* 其他错误 */}
      {error && <Alert severity="error">{error}</Alert>}

      {/* 按钮 */}
      <Button
        variant="danger"
        disabled={buttonDisabled}
        loading={submitting}
        onClick={handleSubmit}
      >
        {submitting ? '提交中…' : '提交注销申请'}
      </Button>
    </Card>
  );
}
```

**交互状态**：

| 状态 | 按钮文本 | 按钮禁用 | 其他 UI |
|------|---------|---------|---------|
| 初始 | 提交注销申请 | false | — |
| 输入原因 | 提交注销申请 | false | 字数实时 |
| 超过 500 字 | 提交注销申请 | **true** | 字数红色 |
| 提交中 | 提交中… | **true** | loading 旋转 |
| 条件不通过 | 提交注销申请 | false | 展示失败清单 |
| 网络超时 | 提交注销申请 | false | 红色 toast "网络错误" |
| 409 重复 | 提交注销申请 | false | 自动刷新 |

### 3.4 DeletionCoolingTimer — 倒计时

```typescript
interface DeletionCoolingTimerProps {
  deadline: string;  // ISO 8601
}

export function DeletionCoolingTimer({ deadline }: DeletionCoolingTimerProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(deadline));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(deadline));
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (countdown.isExpired) {
    return <div className="text-red-500 font-bold">冷静期已结束，系统正在处理注销…</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-amber-600 font-semibold">⏱️ 剩余</span>
      <span className="font-mono text-2xl font-bold text-amber-600">
        {countdown.days}天 {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
```

**实现要点**：
- 使用 `useState` 初始化 + `setInterval(1000)` 每秒更新
- `deadline` prop 变化时 `useEffect` 清除旧 timer 设置新 timer
- 倒计时归零后显示"系统正在处理"，不再继续轮询
- 不依赖服务端轮询，纯客户端时间计算（减少 API 调用）
- 如果浏览器时间不准，最多差 1 秒（可接受）

### 3.5 DeletionChecklistView — 检查清单

```typescript
interface DeletionChecklistViewProps {
  checks: DeletionCheck[];
}

export function DeletionChecklistView({ checks }: DeletionChecklistViewProps) {
  return (
    <div className="space-y-2">
      <h4>注销条件检查</h4>
      {checks.map((c) => {
        const passed = c.passed === 'true';
        const hint = CHECK_ITEM_ACTION_HINTS[c.checkItem];
        return (
          <div key={c.checkItem} className={`flex items-start gap-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>
            <span>{passed ? '✅' : '❌'}</span>
            <span>{CHECK_ITEM_LABELS[c.checkItem]}</span>
            <span className="text-gray-500 text-sm">{c.detail}</span>
            {!passed && hint && (
              <Link to={hint.link} className="text-blue-500 text-sm underline">{hint.label} →</Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### 3.6 DeletionCancelButton — 撤销按钮

```typescript
interface DeletionCancelButtonProps {
  requestId: number;
  onSuccess: () => void;
}

export function DeletionCancelButton({ requestId, onSuccess }: DeletionCancelButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
        撤销注销申请
      </Button>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>确认撤销注销？</DialogTitle>
        <DialogContent>
          撤销后账号将恢复正常使用。你可以在任何时候重新提交注销申请。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch('/api/v1/me/deletion', { method: 'DELETE' });
                if (res.ok) {
                  setConfirmOpen(false);
                  onSuccess();
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            确认撤销
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

### 3.7 DeletionPanelSkeleton — 骨架屏

```typescript
export function DeletionPanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-20 bg-gray-200 rounded" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-10 bg-gray-200 rounded w-1/4" />
    </div>
  );
}
```

---

## 4. 管理端组件

### 4.1 组件树

```
AccountDeletion（页面）
├── StatsCards（4 张统计卡）
├── FilterBar（筛选 + 搜索）
├── DeletionTable（表格）
│   └── DeletionDetailInline（展开行）
│       ├── DeletionChecklistView（复用用户端组件）
│       └── AdminDeletionActions（操作按钮组）
│           ├── AdminRejectDialog（驳回弹窗）
│           └── AdminForceDialog（强制注销弹窗）
└── Pagination（分页）
```

### 4.2 StatsCards — 统计卡

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ ⏳ 待处理    │ ⏱️ 冷静期    │ 🗑️ 已注销   │ 🚫 已驳回   │
│    5         │    8         │   15        │    2        │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

```typescript
interface StatsCardsProps {
  stats: DeletionListResponse['stats'];
}

export function StatsCards({ stats }: StatsCardsProps) {
  const items = [
    { label: '待处理', value: stats.pending,   color: '#6b7280', icon: '⏳' },
    { label: '冷静期', value: stats.cooling,   color: '#d97706', icon: '⏱️' },
    { label: '已注销', value: stats.completed, color: '#dc2626', icon: '🗑️' },
    { label: '已驳回', value: stats.rejected,  color: '#7c3aed', icon: '🚫' },
  ];
  return (
    <div className="grid grid-cols-4 gap-4">
      {items.map(item => (
        <Card key={item.label}>
          <div className="text-2xl">{item.icon}</div>
          <div className="text-2xl font-bold">{item.value}</div>
          <div className="text-sm text-gray-500">{item.label}</div>
        </Card>
      ))}
    </div>
  );
}
```

### 4.3 FilterBar — 筛选栏

```typescript
interface FilterBarProps {
  status: DeletionStatus | 'all';
  search: string;
  onStatusChange: (s: DeletionStatus | 'all') => void;
  onSearchChange: (s: string) => void;
}

// 渲染 Tab 按钮：全部/待处理/冷静期/已注销/已驳回
// 搜索框 maxLength=50, debounce=300ms
```

### 4.4 DeletionTable — 表格

```typescript
interface DeletionTableProps {
  rows: DeletionListRow[];
  loading: boolean;
  expandedId: number | null;
  onToggleExpand: (id: number) => void;
  onRefresh: () => void;
}
```

**列定义**：

| 列 | 字段 | 宽度 | 渲染规则 |
|----|------|------|---------|
| 用户 | userEmail + nickname | 200px | 邮箱小字 + 昵称大字 |
| 原因 | reason | 200px | null→'—'，超 30 字省略 + tooltip |
| 状态 | status | 100px | StatusTag 组件 |
| 冷静期截止 | coolingDeadline | 150px | null→'—'，格式化 yyyy-MM-dd HH:mm |
| 提交时间 | createdAt | 150px | 格式化 |
| 操作 | — | 100px | [展开/收起] 按钮 |

**行展开**：点击行 → onToggleExpand(id) → 切换 expandedId → DeletionDetailInline 渲染

**状态处理**：

| 状态 | 表格表现 |
|------|---------|
| loading=true | 10 行骨架屏，每行高 48px |
| 空数据 | "暂无注销申请" 居中 + 插图 |
| error | 红色提示 + [重试] 按钮 |
| 正常 | 数据行 + 展开行 |

### 4.5 AdminDeletionActions — 操作按钮

```typescript
interface AdminDeletionActionsProps {
  row: DeletionListRow;
  onRefresh: () => void;
}

export function AdminDeletionActions({ row, onRefresh }: AdminDeletionActionsProps) {
  // 按状态显示不同按钮
  switch (row.status) {
    case 'pending':
      return <AdminRejectDialog requestId={row.id} onSuccess={onRefresh} />;
    case 'cooling':
      return (
        <>
          <AdminRejectDialog requestId={row.id} onSuccess={onRefresh} />
          <AdminForceDialog requestId={row.id} userEmail={row.userEmail} onSuccess={onRefresh} />
        </>
      );
    default:
      return <span className="text-gray-400">—</span>;
  }
}
```

**按钮矩阵**：

| 申请状态 | 驳回 | 强制注销 | 说明 |
|---------|------|---------|------|
| pending | ✅ 显示 | ❌ 不显示 | 条件未通过，等用户处理 |
| cooling | ✅ 显示 | ✅ 显示 | 可驳回或强制 |
| completed | ❌ | ❌ | 终态 |
| cancelled | ❌ | ❌ | 终态 |
| rejected | ❌ | ❌ | 终态 |

### 4.6 AdminRejectDialog — 驳回弹窗

```
┌─ 驳回注销申请 ───────────────────────────────────┐
│                                                    │
│ 用户：zhangsan@example.com (张三)                   │
│ 当前状态：冷静期                                    │
│                                                    │
│ 驳回原因（必填，5-500 字）：                        │
│ ┌────────────────────────────────────────────────┐ │
│ │ 经核实用户有未结清的费用…                       │ │
│ │                                                │ │
│ └────────────────────────────────────────────────┘ │ │
│ 0 / 500                                            │
│                                                    │
│ ⚠️ 驳回后用户需重新提交申请                        │
│                                                    │
│ [取消]                          [确认驳回]         │
└────────────────────────────────────────────────────┘
```

```typescript
interface AdminRejectDialogProps {
  requestId: number;
  onSuccess: () => void;
}

export function AdminRejectDialog({ requestId, onSuccess }: AdminRejectDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const valid = trimmed.length >= 5 && trimmed.length <= 500;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${requestId}/deletion/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });
      const json = await res.json();
      if (res.ok) {
        setOpen(false);
        setReason('');
        onSuccess();
      } else {
        setError(json.message || '操作失败');
      }
    } catch (e: any) {
      setError('网络错误: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button variant="outline">驳回</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>驳回注销申请</DialogTitle>
        <DialogDescription>
          驳回后用户需重新提交申请
        </DialogDescription>

        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          placeholder="经核实用户有未结清的费用…"
          rows={4}
          maxLength={500}
        />
        <div className={trimmed.length > 500 ? 'text-red-500' : 'text-gray-400'}>
          {trimmed.length} / 500
        </div>

        {error && <Alert severity="error">{error}</Alert>}

        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="danger"
            disabled={!valid || loading}
            loading={loading}
            onClick={handleSubmit}
          >
            确认驳回
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

**按钮状态**：

| 状态 | 文本 | 禁用 | 说明 |
|------|------|------|------|
| 初始 | 确认驳回 | true | reason 空 |
| 输入 < 5 字 | 确认驳回 | true | 太短 |
| 输入 5-500 字 | 确认驳回 | false | 可提交 |
| 输入 > 500 字 | 确认驳回 | true | 太长（已截断） |
| 提交中 | 提交中… | true | loading |

### 4.7 AdminForceDialog — 强制注销弹窗

```
┌─ ⚠️ 强制注销 ─────────────────────────────────────┐
│                                                    │
│ 🔴 危险操作                                         │
│                                                    │
│ 将立即注销以下账号，操作不可逆：                     │
│   邮箱：zhangsan@example.com                        │
│   昵称：张三                                        │
│                                                    │
│ • 所有个人数据将脱敏                                │
│ • 关联记录保留但不可反查                            │
│ • 此操作不可撤销                                    │
│                                                    │
│ 请输入 "确认注销" 以继续：                          │
│ ┌────────────────────────────────────────────────┐ │
│ │                                                │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ [取消]                         [🔒 强制注销] (5s)  │
└────────────────────────────────────────────────────┘
```

```typescript
interface AdminForceDialogProps {
  requestId: number;
  userEmail: string;
  onSuccess: () => void;
}

export function AdminForceDialog({ requestId, userEmail, onSuccess }: AdminForceDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState<string | null>(null);

  // 5 秒倒计时（打开弹窗时启动）
  useEffect(() => {
    if (!open) return;
    setCountdown(5);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  const canSubmit = confirmText === '确认注销' && countdown === 0 && !loading;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${requestId}/deletion/force`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setOpen(false);
        setConfirmText('');
        onSuccess();
      } else {
        setError(json.message || '操作失败');
      }
    } catch (e: any) {
      setError('网络错误: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button variant="danger">强制注销</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-red-600">⚠️ 强制注销</DialogTitle>
        <Alert severity="error">
          🔴 危险操作：将立即注销账号 <strong>{userEmail}</strong>，操作不可逆
        </Alert>

        <ul className="text-sm text-gray-600">
          <li>• 所有个人数据将脱敏</li>
          <li>• 关联记录保留但不可反查</li>
          <li>• 此操作不可撤销</li>
        </ul>

        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='请输入 "确认注销"'
        />

        {error && <Alert severity="error">{error}</Alert>}

        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="danger"
            disabled={!canSubmit}
            loading={loading}
            onClick={handleSubmit}
          >
            {countdown > 0 ? `强制注销 (${countdown}s)` : '🔒 强制注销'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

**防误触机制**：

| 条件 | 按钮文本 | 禁用 |
|------|---------|------|
| 倒计时 > 0 | 强制注销 (Ns) | **true** |
| 输入 ≠ "确认注销" | 🔒 强制注销 | **true** |
| 倒计时 = 0 + 输入正确 | 🔒 强制注销 | false |
| 提交中 | 提交中… | **true** |

---

## 5. API 对接清单

| 组件 | API | 方法 | 触发 | 说明 |
|------|-----|------|------|------|
| AccountDeletionPanel | GET /api/v1/me/deletion | GET | 挂载 + focus 重新验证 | 404 = 无记录 |
| AccountDeletionForm | POST /api/v1/me/deletion | POST | 提交按钮 | 200→刷新; 400→展示清单; 409→刷新 |
| DeletionCancelButton | DELETE /api/v1/me/deletion | DELETE | 确认撤销 | 200→刷新 |
| StatsCards | (从列表 API stats 计算) | — | — | 不单独请求 |
| DeletionTable | GET /api/v1/admin/deletion | GET | 挂载 + 筛选 + 翻页 | 60s SWR 轮询 |
| DeletionDetailInline | GET /api/v1/admin/users/:id/deletion | GET | 展开行时 | 按需加载 |
| AdminRejectDialog | POST /api/v1/admin/users/:id/deletion/reject | POST | 确认驳回 | |
| AdminForceDialog | POST /api/v1/admin/users/:id/deletion/force | POST | 确认注销 | |

---

## 6. 样式规范

| 元素 | 类名/样式 |
|------|----------|
| 状态标签 | `bg-{bgColor} text-{color} px-2 py-0.5 rounded text-xs font-medium` |
| 危险按钮 | `bg-red-600 text-white hover:bg-red-700 disabled:opacity-50` |
| 警告区 | `bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded` |
| 骨架屏 | `animate-pulse bg-gray-200 rounded` |
| 空状态 | `text-center py-12 text-gray-400` + 插图 |
| 倒计时数字 | `font-mono text-2xl font-bold text-amber-600` |
