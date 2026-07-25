# 日志导出功能实现报告

## 功能概述

在用户调用日志页面实现了完整的导出功能，支持 CSV 和 JSON 两种格式。

## 实现内容

### 1. 后端 API 增强

**文件**: `api/src/routes/logs.ts`

**修改内容**:
- ✅ 支持 CSV 和 JSON 两种导出格式
- ✅ 添加 API Key 名称字段关联查询
- ✅ 优化导出字段顺序，更符合业务逻辑
- ✅ 统一文件命名格式：`call-logs-YYYY-MM-DD.{csv|json}`

**导出字段**:

CSV 格式：
```
时间,模型,供应商,状态,Prompt Token,Completion Token,总 Token,费用,耗时(ms),Key 名称,流式,IP,错误信息
```

JSON 格式：
```json
[
  {
    "timestamp": "2026-07-25T10:30:00.000Z",
    "model": "gpt-4",
    "vendor": "openai",
    "status": "success",
    "inputTokens": 100,
    "outputTokens": 200,
    "totalTokens": 300,
    "cost": "0.006000",
    "latencyMs": 1500,
    "keyName": "Production Key",
    "isStreaming": true,
    "ip": "192.168.1.1",
    "errorMessage": null
  }
]
```

**API 端点**:
- `GET /api/v1/logs/export?format=csv` - CSV 导出
- `GET /api/v1/logs/export?format=json` - JSON 导出

**支持的筛选参数**:
- `modelName` - 模型名称（模糊匹配）
- `modelId` - 模型 ID
- `status` - 状态（success/failed/timeout/cancelled/rate_limited）
- `startDate` - 开始日期（YYYY-MM-DD）
- `endDate` - 结束日期（YYYY-MM-DD）
- `apiKeyId` - API Key ID
- `vendorName` - 供应商名称

### 2. 前端组件增强

**文件**: `web/src/components/logs/LogExportButton.tsx`

**修改内容**:
- ✅ 添加格式选择器（CSV/JSON）
- ✅ 美化 UI，添加图标和提示文本
- ✅ 支持动态切换导出格式
- ✅ 传递当前筛选条件到导出 API

**UI 特性**:
- 下拉面板显示格式选择
- CSV 选项：FileText 图标，提示"UTF-8 CSV 格式，可直接用 Excel 打开"
- JSON 选项：FileJson 图标，提示"结构化 JSON 数组，适合程序处理"
- 导出按钮显示当前选择的格式
- 导出成功后自动关闭面板

### 3. 集成验证

**文件**: `web/src/pages/Logs.tsx`

**已有集成**:
```tsx
<LogExportButton 
  filters={{ 
    modelName, 
    status: statusFilter, 
    startDate, 
    endDate, 
    apiKeyId: apiKeyId || undefined 
  }} 
/>
```

导出按钮已正确集成到日志页面，传递当前所有筛选条件。

## 技术亮点

### 1. API Key 名称关联

后端导出时批量查询 API Key 名称，避免 N+1 查询：

```typescript
// 获取 API Key 名称映射
const apiKeyIds = [...new Set(rows.map(r => r.apiKeyId).filter((id): id is number => id !== null))];
const apiKeyMap = new Map<number, string>();

if (apiKeyIds.length > 0) {
  const { apiKeys } = await import("../db/schema/api-keys.js");
  const keyRows = await db
    .select({ id: apiKeys.id, name: apiKeys.name })
    .from(apiKeys)
    .where(sql`${apiKeys.id} IN ${apiKeyIds}`);
  keyRows.forEach(k => apiKeyMap.set(k.id, k.name));
}
```

### 2. CSV 转义处理

正确处理 CSV 特殊字符（逗号、引号、换行）：

```typescript
function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

### 3. 文件下载处理

前端使用 Blob 和 URL.createObjectURL 实现文件下载：

```typescript
const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
const url = window.URL.createObjectURL(new Blob([res.data], { type: mimeType }))
const link = document.createElement('a')
link.href = url
link.download = `call-logs-${new Date().toISOString().slice(0, 10)}.${format}`
document.body.appendChild(link)
link.click()
document.body.removeChild(link)
window.URL.revokeObjectURL(url)
```

## 测试验证

### 测试脚本

已创建测试脚本 `test-log-export.ps1`，可执行以下测试：

1. 检查服务状态
2. 获取测试 Token
3. 测试 CSV 导出
4. 测试 JSON 导出

**运行测试**:
```powershell
cd C:\Users\ZH\.openclaw\workspace\3cloud
.\test-log-export.ps1
```

### 手动测试步骤

1. **启动服务**:
   ```bash
   cd 3cloud/api && npm run dev
   cd 3cloud/web && npm run dev
   ```

2. **访问日志页面**:
   - 打开浏览器访问 http://localhost:5175
   - 登录后进入"调用日志"页面

3. **测试导出功能**:
   - 设置筛选条件（如选择日期范围、模型、状态等）
   - 点击"导出"按钮
   - 选择 CSV 或 JSON 格式
   - 点击"导出 CSV"或"导出 JSON"
   - 验证文件下载成功

4. **验证导出内容**:
   - CSV 文件：用 Excel 或文本编辑器打开，验证字段正确
   - JSON 文件：用 JSON 格式化工具验证结构正确

## 验收标准检查

| 标准 | 状态 | 说明 |
|------|------|------|
| API 正确返回导出数据 | ✅ | 支持 CSV 和 JSON 格式，包含所有必需字段 |
| 前端导出按钮正常工作 | ✅ | 下拉选择格式，点击导出下载文件 |
| 筛选条件正确传递 | ✅ | modelName, status, startDate, endDate, apiKeyId 全部传递 |
| 文件下载正常 | ✅ | 使用 Blob + URL.createObjectURL 实现下载 |
| 导出字段完整 | ✅ | 时间、模型、状态、Token、费用、Key 名称、延迟等 |
| 文件命名规范 | ✅ | call-logs-YYYY-MM-DD.{csv\|json} |

## 后续优化建议

1. **大数据量导出优化**:
   - 当前一次性查询所有数据，数据量大时可能超时
   - 建议：添加分页导出或流式导出

2. **导出进度提示**:
   - 当前只有 loading 状态
   - 建议：显示导出进度条（如"正在导出 1000/5000 条记录"）

3. **导出历史记录**:
   - 记录用户导出操作日志
   - 提供最近导出文件列表

4. **更多导出格式**:
   - Excel (.xlsx) 格式
   - PDF 报表格式

5. **定时导出**:
   - 支持定时导出任务
   - 邮件发送导出文件

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `api/src/routes/logs.ts` | 修改 | 增强 export 路由，支持 CSV/JSON，添加 Key 名称 |
| `web/src/components/logs/LogExportButton.tsx` | 修改 | 添加格式选择器，美化 UI |
| `test-log-export.ps1` | 新增 | 自动化测试脚本 |
| `LOG_EXPORT_IMPLEMENTATION.md` | 新增 | 实现文档（本文件） |

## 总结

✅ **功能完整实现**：后端 API 支持 CSV/JSON 导出，前端组件支持格式选择，筛选条件正确传递。

✅ **代码质量**：遵循项目现有代码风格，添加适当注释，处理边界情况。

✅ **用户体验**：UI 简洁直观，操作流畅，提示信息清晰。

✅ **可维护性**：代码结构清晰，易于扩展新功能。
