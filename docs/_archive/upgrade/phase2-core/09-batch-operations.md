# 09 — 批量操作体系

> **后端**: 2 人天 | **前端**: 1.5 人天 | **依赖**: 05 轻量化操作链路（BatchActionBar）

---

## 1. 背景与目标

**问题**：当前所有操作都是单条处理。导入 100 个上游 Key 需要逐个创建；创建 50 个客户需要逐个填表；启停 20 个通道需要逐个编辑。

**目标**：批量导入、批量创建、批量启停、批量导出完整覆盖。

---

## 2. 批量导入上游 Key

### 后端

```typescript
// POST /api/v1/admin/vendors/:id/key-groups/:gid/items/batch-import
// Content-Type: multipart/form-data
// Body: { file: CSV }

// CSV 格式
name,apiKey,weight,priority,note
主 Key,sk-xxxxx-xxxx,10,1,生产环境
备用 Key,sk-yyyyy-yyyy,5,2,测试环境
// 或
// 纯 Key 列表（每行一个），系统自动生成名称

// 响应
{
  "success": 95,
  "failed": [
    { "row": 3, "reason": "重复密钥" },
    { "row": 17, "reason": "格式无效" }
  ],
  "summary": {
    "total": 100,
    "successCount": 95,
    "failCount": 5
  }
}
```

```typescript
// 文件：api/src/routes/admin/vendors.ts 追加

app.post("/api/v1/admin/vendors/:id/key-groups/:gid/items/batch-import", {
  preHandler: [requirePerm(Perm.MODEL_MANAGE)],
}, async (request, reply) => {
  const { id, gid } = request.params as any
  const data = request.body as any
  
  // 1. 解析 CSV
  const rows = parseCSV(data.file)
  
  // 2. 逐行验证 + 插入
  const results = { success: 0, failed: [] as any[] }
  for (const [index, row] of rows.entries()) {
    try {
      const encrypted = encryptApiKey(row.apiKey)
      await db.insert(vendorKeyGroupItems).values({
        groupId: gid,
        apiKeyEncrypted: encrypted,
        apiKeyPrefix: row.apiKey.slice(0, 7) + '***',
        weight: row.weight ?? 1,
        priority: row.priority ?? 0,
        status: true,
      })
      results.success++
    } catch (err) {
      results.failed.push({ row: index + 1, reason: err.message })
    }
  }
  
  return { data: results }
})
```

### 前端

```tsx
function BatchImportKeys({ vendorId, groupId }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  
  const handleFileDrop = async (file: File) => {
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await post(
      `/api/v1/admin/vendors/${vendorId}/key-groups/${groupId}/items/batch-import`,
      formData, { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    setResult(res)
  }
  
  return (
    <div>
      <FileDropZone onDrop={handleFileDrop} accept=".csv,.txt" />
      {result && (
        <ImportResultSummary
          success={result.success}
          failed={result.failed}
          total={result.summary.total}
        />
      )}
    </div>
  )
}
```

---

## 3. 批量创建下游客户 Key

### 后端

```typescript
// POST /api/v1/admin/api-keys/batch-create
{
  "userId": 123,
  "count": 10,
  "nameTemplate": "key-{n}",       // → key-1, key-2, ...
  "prefix": "prod-",
  "rpmLimit": 100,
  "tpmLimit": 100000,
  "expiresAt": "2026-12-31T23:59:59Z"
}

// 响应
{
  "keys": [
    { "id": 101, "name": "key-1", "apiKey": "sk-xxx...", "plain": "sk-xxxxxxxxxxxx" },
    // ... 批量返回明文 Key（一次性展示，不持久化存储明文）
  ],
  "count": 10
}
```

重要——安全措施：
- 批量创建返回的明文 Key **只在响应中出现一次**
- 前端引导用户立即复制保存：`"已创建 10 个 Key，请立即复制以下密钥（只显示一次）"`

```typescript
async function batchCreateApiKeys({
  userId, count, nameTemplate, rpmLimit, tpmLimit
}: BatchCreateParams) {
  const results: any[] = []
  
  for (let i = 0; i < count; i++) {
    const name = nameTemplate.replace('{n}', String(i + 1))
    const apiKey = `sk-${randomBytes(32).toString('hex')}`
    const hashed = createHash('sha256').update(apiKey).digest('hex')
    
    const [key] = await db.insert(apiKeys).values({
      userId,
      name,
      keyHash: hashed,
      keyPrefix: apiKey.slice(0, 12),
      rpmLimit,
      tpmLimit,
      status: 'active',
    }).returning()
    
    results.push({ id: key.id, name: key.name, apiKey: key.keyPrefix, plain: apiKey })
  }
  
  return { keys: results, count }
}
```

---

## 4. 批量启停通道

### 后端

```typescript
// POST /api/v1/admin/vendor-models/batch-toggle
{
  "ids": [1, 2, 3, 4, 5],
  "action": "enable"     // enable | disable
}

// 响应
{
  "success": 5,
  "failed": []
}
```

### 前端

```tsx
// 在 VendorModels.tsx 中接入 BatchActionBar

const [selectedIds, setSelectedIds] = useState<number[]>([])
const batchActions: BatchAction[] = [
  {
    key: 'enable',
    label: '批量启用',
    icon: <Power />,
    action: async (ids) => {
      await post('/api/v1/admin/vendor-models/batch-toggle', { ids, action: 'enable' })
    },
  },
  {
    key: 'disable',
    label: '批量禁用',
    icon: <PowerOff />,
    action: async (ids) => {
      await post('/api/v1/admin/vendor-models/batch-toggle', { ids, action: 'disable' })
    },
  },
  {
    key: 'delete',
    label: '批量删除',
    icon: <Trash2 />,
    variant: 'danger',
    confirm: `确定删除已选的 ${selectedIds.length} 个通道？此操作不可撤销`,
    action: async (ids) => {
      await del('/api/v1/admin/vendor-models/batch-delete', { ids })
    },
  },
]

return (
  <div>
    <BatchActionBar
      selectedIds={selectedIds}
      onSelectionChange={setSelectedIds}
      actions={batchActions}
      total={total}
    />
    <table>
      <thead>
        <tr>
          <th><Checkbox checked={allSelected} onChange={toggleAll} /></th>
          <th>模型</th>
          <th>供应商</th>
          <th>状态</th>
          ...
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id}>
            <td><Checkbox checked={selectedIds.includes(item.id)} onChange={() => toggleOne(item.id)} /></td>
            ...
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
```

---

## 5. 批量导出

所有列表页新增导出按钮，支持 CSV/Excel：

### 后端

```typescript
// GET /api/v1/admin/{resource}/export
// Query: 同列表查询参数（keyword, status, timeRange, ...）
// Response: CSV 文件流（Content-Type: text/csv）

// 通用导出路由
function createExportRoute(app, path, queryFn, columns) {
  app.get(path, async (request, reply) => {
    const query = request.query as any
    query.pageSize = 10000    // 导出时一次性拉 1 万条
    const data = await queryFn(query)
    
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${path.replace(/\//g, '-')}.csv"`)
    
    // BOM for Excel compatibility
    const encoder = new TextEncoder()
    const BOM = '\uFEFF'
    let csv = BOM + columns.map(c => c.label).join(',') + '\n'
    
    for (const row of data) {
      csv += columns.map(c => {
        const val = get(row, c.key)
        if (val === null || val === undefined) return ''
        const str = String(val)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',') + '\n'
    }
    
    return reply.send(csv)
  })
}
```

### 支持导出的页面

| 页面 | 导出文件名 | 列数 | 最大行数 |
|------|-----------|------|---------|
| 调用日志 | call-logs-{date}.csv | 15 | 10000 |
| 审核日志 | audit-logs-{date}.csv | 10 | 10000 |
| 操作日志 | operation-logs-{date}.csv | 8 | 10000 |
| API Key | api-keys-{date}.csv | 8 | 5000 |
| 供应商 | vendors-{date}.csv | 6 | 1000 |
| 用户列表 | users-{date}.csv | 12 | 5000 |
| 充值订单 | recharges-{date}.csv | 10 | 5000 |
| 佣金记录 | commissions-{date}.csv | 10 | 5000 |

---

## 6. 批量操作端点汇总

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/admin/api-keys/batch-create` | POST | 批量创建下游 Key |
| `/api/v1/admin/api-keys/batch-toggle` | POST | 批量启禁用 |
| `/api/v1/admin/api-keys/batch-delete` | POST | 批量删除 |
| `/api/v1/admin/vendors/batch-toggle` | POST | 批量启禁用供应商 |
| `/api/v1/admin/vendors/batch-delete` | POST | 批量删除供应商 |
| `/api/v1/admin/vendor-models/batch-create` | POST | 批量创建通道 |
| `/api/v1/admin/vendor-models/batch-toggle` | POST | 批量启停通道 |
| `/api/v1/admin/vendor-models/batch-delete` | POST | 批量删除通道 |
| `/api/v1/admin/users/batch-toggle` | POST | 批量启禁用用户 |
| `/api/v1/admin/models/batch-toggle` | POST | 批量启禁用模型 |
| `GET /api/v1/admin/{resource}/export` | GET | CSV 导出（通用） |

---

## 7. 验收标准

- [ ] 供应商页面支持 CSV 批量导入上游 Key（含失败行提示）
- [ ] API Key 管理页支持批量创建（指定数量+命名规则）
- [ ] 通道列表支持批量启停（选中→批量操作栏→确认→执行）
- [ ] 所有列表页支持 CSV 导出（含 BOM 兼容 Excel）
- [ ] 批量操作有确认弹窗和进度提示
- [ ] 批量失败的可逐行查看失败原因
- [ ] 批量创建 Key 的明文仅展示一次
