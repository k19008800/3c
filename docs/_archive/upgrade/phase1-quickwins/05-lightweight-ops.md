# 05 — 轻量化操作链路

> **后端**: 1 人天 | **前端**: 2 人天 | **依赖**: 01 页面状态持久化

---

## 1. 背景与目标

**问题**：
- 部分操作需打开 Modal → 填写 → 关闭 → 刷新列表（3-4 步链路）
- 状态切换/启用禁用需要进入编辑页
- 详情查看用 Modal 覆盖了列表，丢失上下文
- 提交后列表刷新回第 1 页

**目标**：行内编辑代替弹窗、Drawer 代替 Modal、批量操作栏减少重复操作。

---

## 2. 行内编辑组件

### `<InlineToggle>`

```tsx
// 文件：web/src/components/ui/InlineToggle.tsx

interface InlineToggleProps {
  value: boolean
  onChange: (value: boolean) => Promise<void>
  disabled?: boolean
  /** 确认文案（可选，关键操作需要确认） */
  confirm?: { title: string; description: string }
  /** 变更后的回调 */
  onSuccess?: () => void
  onError?: (err: Error) => void
}

// 使用方式（供应商列表-状态切换）
<InlineToggle
  value={vendor.status === 'active'}
  onChange={async (enabled) => {
    await patch(`/api/v1/admin/vendors/${vendor.id}`, {
      status: enabled ? 'active' : 'disabled'
    })
  }}
  confirm={vendor.modelCount > 0 ? {
    title: '禁用供应商',
    description: `该供应商下有 ${vendor.modelCount} 个模型映射，禁用后关联通道将不可用`
  } : undefined}
/>
```

渲染：
```
状态列（原先文字标签）→ 切换为开关
  ✅ 正常   ← 绿色开关
  ❌ 已禁用  ← 灰色开关
点击开关 → 确认弹窗（如果有关联影响）→ 异步切换 → Toast 反馈
```

### `<InlineEditText>`

```tsx
interface InlineEditTextProps {
  value: string
  onSave: (value: string) => Promise<void>
  validate?: (value: string) => string | null  // 返回错误信息或 null
  maxLength?: number
}
```

渲染：
```
名字列 → 点击进入编辑模式 → 输入框自动聚焦 → Enter 保存 / Esc 取消
```

---

## 3. Drawer 替代 Modal

将详情查看从 Modal 迁移到 Drawer（侧边滑出面板），保留列表页面完整可见。

### `<SlideDrawer>` 组件

```tsx
// 文件：web/src/components/ui/SlideDrawer.tsx

interface SlideDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  children: ReactNode
  /** 加载/错误状态 */
  loading?: boolean
  error?: string
}

// 尺寸：
// sm: w-96 (384px)
// md: w-128 (512px) ← 默认
// lg: w-160 (640px)
// xl: w-192 (768px)
// full: w-screen

// 使用
<SlideDrawer
  open={!!selectedUser}
  onClose={() => setSelectedUser(null)}
  title={`用户详情: ${selectedUser?.email}`}
  width="lg"
>
  <UserDetailTabs userId={selectedUser!.id} />
</SlideDrawer>
```

**带 Drawer 的页面改造清单**：

| 页面 | 当前方案 | 改造方案 |
|------|---------|---------|
| 调用日志 - 详情 | Modal | Drawer lg |
| 用户管理 - 详情 | Modal | Drawer xl（含 4 个 Tab）|
| 审计日志 - 详情 | Modal | Drawer md |
| 充值订单 - 审核 | Modal | Drawer lg（含银行信息+凭证图片）|
| 供应商 - 模型明细 | 行内展开 | Drawer lg（含完整模型列表+开关）|
| API Key 详情 | Modal | Drawer md |
| 安全事件详情 | Modal | Drawer lg |

---

## 4. 批量操作栏

### `<BatchActionBar>`

```tsx
// 文件：web/src/components/ui/BatchActionBar.tsx

interface BatchAction {
  key: string
  label: string
  icon?: ReactNode
  variant?: 'default' | 'danger'
  /** 操作前确认文案 */
  confirm?: string
  /** 操作函数 */
  action: (selectedIds: number[]) => Promise<void>
  /** 至少选择多少个才能启用（默认 1）*/
  minSelect?: number
}

interface BatchActionBarProps {
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  actions: BatchAction[]
  /** 总条目数 */
  total: number
  /** 已选条目提示 */
  selectedLabel?: (count: number) => string
}
```

渲染效果：
```
  已选择 3 项     [批量启用] [批量禁用] [批量删除 ⚠️]
  ◻ 全选
  ☑ Item 1
  ☑ Item 2
  ☐ Item 3
  ☑ Item 4
```

**需要增加批量操作的页面**：

| 页面 | 批量操作 |
|------|---------|
| API Key 管理 | 批量启用/禁用/删除 |
| 供应商管理 | 批量启用/禁用/删除 |
| 模型管理 | 批量启用/禁用/删除 |
| 限流管理 | 批量启用/禁用 |
| 用户管理 | 批量启用/禁用 |
| 兑换码 | 批量作废/导出 |

---

## 5. 操作后自动刷新保持

### `useListRefresh` Hook

```typescript
function useListRefresh(fetchFn: () => Promise<void>, options: {
  /** 成功的 toast 文案 */
  successMessage?: (action: string) => string
  onRefresh?: () => void
}) {
  const withRefresh = useCallback(async (
    action: string,
    actionFn: () => Promise<any>
  ) => {
    try {
      await actionFn()
      toast.success(successMessage(action))
      await fetchFn()       // 刷新列表，保持当前页码
    } catch (err) {
      toast.error(err.message)
    }
  }, [fetchFn])

  return { withRefresh }
}
```

核心改进：
- 所有增删改操作后**不再回到第 1 页**，保持当前页码
- 删除最后一项时自动回退到上一页
- 操作反馈用 Toast 而不是全屏加载

---

## 6. 后端变更

### PATCH 支持局部更新

当前许多端点是 PUT 完整替换，改造为支持 PATCH 局部更新：

```typescript
// 新增批量操作端点
POST   /api/v1/admin/{resource}/batch-enable     // 批量启用
POST   /api/v1/admin/{resource}/batch-disable    // 批量禁用
POST   /api/v1/admin/{resource}/batch-delete     // 批量删除
Request: { ids: number[] }
Response: { success: number; failed: { id: number; reason: string }[] }
```

---

## 7. 验收标准

- [ ] 状态切换列 → 行内开关（Toggle），切换后实时生效
- [ ] 名称列 → 行内编辑（InliteEditText），Enter 保存 Esc 取消
- [ ] 详情查看 → Drawer 侧滑替代 Modal
- [ ] 列表页顶部出现批量操作栏（选中条目后显示）
- [ ] 批量操作有确认弹窗（尤其是危险操作如批量删除）
- [ ] 操作后列表保持当前页码（不跳回第 1 页）
- [ ] 10+ 页面完成改造
