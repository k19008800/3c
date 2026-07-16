# 11 — 请求内容过滤 + 敏感词拦截

> **后端**: 1.5 人天 | **前端**: 1 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：当前 3cloud 仅做请求转发，对内容无任何过滤。无法阻止恶意请求、敏感内容、或注入攻击。

**目标**：在转发链路中插入可配置的内容过滤器：URL 黑白名单、请求体关键词拦截、响应体替换/阻断、PII 脱敏。

---

## 2. 数据库设计

### 新建 `content_filters` 表

```typescript
export const contentFilters = pgTable("content_filters", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  // 过滤阶段
  stage: varchar("stage", { length: 20 }).notNull(),
  // 'pre_request' | 'post_response' | 'both'
  
  // 匹配范围
  scope: varchar("scope", { length: 20 }).notNull(),
  // 'request_body' | 'response_body' | 'url' | 'headers' | 'all'
  
  // 匹配类型
  matchType: varchar("match_type", { length: 20 }).notNull(),
  // 'keyword' | 'regex' | 'exact'
  
  // 匹配模式
  pattern: text("pattern").notNull(),
  // 关键词：一行一个，OR 关系
  // 正则表达式：PCRE 格式
  // 精确匹配：完整字符串
  
  // 匹配后的动作
  action: varchar("action", { length: 20 }).notNull(),
  // 'block' — 阻断请求并返回 403
  // 'replace' — 替换匹配内容（仅 post_response）
  // 'mask' — 脱敏（仅 post_response，用 *** 替换）
  // 'log' — 仅记录不阻断
  // 'review' — 标记为待审核（配合异步审核流程）
  
  // 替换/脱敏用
  replacement: text("replacement"),
  
  // 作用范围
  applyTo: varchar("apply_to", { length: 10 }).array().notNull().default(sql`ARRAY['all']`),
  // 模型名称数组：['all'] 表示全部 / ['deepseek-chat'] 仅指定模型
  
  // 优先级（数值越小优先级越高）
  priority: integer("priority").notNull().default(100),
  
  // 统计
  hitCount: integer("hit_count").notNull().default(0),
  lastHitAt: timestamp("last_hit_at"),
  
  status: boolean("status").notNull().default(true),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})
```

### 过滤日志 `filter_logs`

```typescript
export const filterLogs = pgTable("filter_logs", {
  id: serial("id").primaryKey(),
  filterId: integer("filter_id").notNull().references(() => contentFilters.id),
  callLogId: integer("call_log_id"),
  userId: integer("user_id"),
  apiKeyId: integer("api_key_id"),
  action: varchar("action", { length: 20 }).notNull(),
  // 'blocked' | 'replaced' | 'masked' | 'logged' | 'review'
  
  matchContent: text("match_content"),  // 触发匹配的内容片段（已截断）
  matchedPattern: text("matched_pattern"),  // 命中的规则
  
  stage: varchar("stage", { length: 20 }).notNull(),
  requestSummary: text("request_summary"),  // 请求摘要
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
```

---

## 3. API 设计

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/admin/content-filters` | GET | 过滤规则列表 |
| `/api/v1/admin/content-filters` | POST | 创建规则 |
| `/api/v1/admin/content-filters/:id` | PATCH | 更新规则 |
| `/api/v1/admin/content-filters/:id` | DELETE | 删除规则 |
| `/api/v1/admin/content-filters/:id/test` | POST | 测试规则（输入内容→是否匹配） |
| `/api/v1/admin/content-filters/logs` | GET | 过滤日志（分页+条件筛选）|
| `/api/v1/admin/content-filters/stats` | GET | 规则命中统计 |

---

## 4. 核心逻辑

### 在转发链中插入过滤

```typescript
// proxy.ts — handleNonStreaming / handleStreaming 中

// 请求前过滤（pre_request）
const filterResult = await checkContentFilters({
  stage: 'pre_request',
  scope: 'request_body',
  content: JSON.stringify(request.body),
  modelName: forwardBody.model,
  userId,
})

if (filterResult.action === 'block') {
  await recordFilterLog(filterResult)
  return reply.status(403).send(openaiError(403,
    '请求被内容安全策略拦截',
    'content_filter',
    'content_blocked',
  ))
}

// 正常转发...
const response = await forwardRequest(route, request)

// 响应后过滤（post_response）
if (response.body && typeof response.body === 'object') {
  const responseText = JSON.stringify(response.body)
  const responseFilterResult = await checkContentFilters({
    stage: 'post_response',
    scope: 'response_body',
    content: responseText,
    modelName: forwardBody.model,
    userId,
  })
  
  if (responseFilterResult.action === 'block') {
    response.body = {
      error: { message: '响应内容已被安全策略拦截', type: 'content_filter', code: 'content_blocked' }
    }
  } else if (responseFilterResult.action === 'mask') {
    // 脱敏处理
    for (const match of responseFilterResult.matches) {
      responseText = responseText.replaceAll(match.content, '***')
    }
    response.body = JSON.parse(responseText)
  } else if (responseFilterResult.action === 'replace') {
    for (const match of responseFilterResult.matches) {
      responseText = responseText.replaceAll(match.content, match.replacement)
    }
    response.body = JSON.parse(responseText)
  }
}
```

### `checkContentFilters` 实现

```typescript
async function checkContentFilters(params: {
  stage: string
  scope: string
  content: string
  modelName: string
  userId: number
}): Promise<FilterCheckResult> {
  // 获取启用的过滤规则（缓存 60 秒）
  const filters = await getActiveFilters()
  
  for (const filter of filters) {
    if (filter.stage !== params.stage && filter.stage !== 'both') continue
    if (filter.scope !== params.scope && filter.scope !== 'all') continue
    
    // 检查 applyTo 范围
    if (!filter.applyTo.includes('all') && !filter.applyTo.includes(params.modelName)) continue
    
    // 执行匹配
    const matches = matchContent(params.content, filter)
    if (matches.length === 0) continue
    
    // 命中：更新计数器
    await db.update(contentFilters)
      .set({
        hitCount: sql`hit_count + 1`,
        lastHitAt: new Date(),
      })
      .where(eq(contentFilters.id, filter.id))
    
    switch (filter.action) {
      case 'block':
        return { action: 'block', filter, matches }
      case 'replace':
        return { action: 'replace', filter, matches }
      case 'mask':
        return { action: 'mask', filter, matches }
      case 'log':
        await logFilterHit(filter, matches, params)
        continue  // 不阻断
      case 'review':
        await markForReview(filter, matches, params)
        continue  // 不阻断但标记
    }
  }
  
  return { action: 'pass' }
}

function matchContent(content: string, filter: typeof contentFilters): MatchResult[] {
  switch (filter.matchType) {
    case 'keyword': {
      const keywords = filter.pattern.split('\n').map(s => s.trim()).filter(Boolean)
      const results: MatchResult[] = []
      for (const keyword of keywords) {
        let pos = content.indexOf(keyword)
        while (pos !== -1) {
          results.push({
            content: keyword,
            start: pos,
            end: pos + keyword.length,
          })
          pos = content.indexOf(keyword, pos + 1)
        }
      }
      return results
    }
    case 'regex': {
      const regex = new RegExp(filter.pattern, 'gi')
      const results: MatchResult[] = []
      let match
      while ((match = regex.exec(content)) !== null) {
        results.push({
          content: match[0],
          start: match.index,
          end: match.index + match[0].length,
        })
      }
      return results
    }
    case 'exact':
      return content === filter.pattern
        ? [{ content: filter.pattern, start: 0, end: filter.pattern.length }]
        : []
  }
}
```

### 性能要点

- 过滤规则加载到内存缓存（更新后失效）
- 长内容（>10KB）仅检查前 10KB（配置参数）
- 正则编译缓存（编译后的 RegExp 对象缓存复用）
- 流式响应仅在最后合并时过滤（避免逐 chunk 过滤开销）

---

## 5. 前端管理页面

```
内容安全 > 过滤规则
┌──────────────────────────────────────────────────────────┐
│ [+ 新增规则]                                              │
│                                                           │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐│
│ │ 名称  │ 阶段  │ 范围  │ 类型  │ 动作  │ 命中  │ 状态  │ 操作 ││
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤│
│ │ 敏感  │ 请求前 │请求体│关键词│ 阻断  │ 23次  │ ✅   │编辑 ││
│ │ 内容  │      │      │      │      │      │      │删除 ││
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤│
│ │ 手机  │ 响应后 │响应体│ 正则 │ 脱敏  │ 156次 │ ✅   │编辑 ││
│ │ 号码  │      │      │      │      │      │      │删除 ││
│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘│
│                                                           │
│ 规则测试器                                                 │
│ ┌─────────────────────────────────────────────────┐       │
│ │ 输入测试内容:                                     │       │
│ │ "我的手机号是13800138000，帮我查一下"               │       │
│ │                                       [测试规则] │       │
│ ├─────────────────────────────────────────────────┤       │
│ │ 匹配结果: 规则"手机号码" → 命中 (匹配: 13800138000)│       │
│ └─────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────┘
```

---

## 6. 验收标准

- [ ] 支持创建内容过滤规则（关键词/正则/精确匹配）
- [ ] 支持请求前阻断（返回 403）和响应后脱敏/替换
- [ ] 规则可按模型范围限定（全局 / 指定模型）
- [ ] 命中计数实时更新
- [ ] 过滤日志可查询
- [ ] 内置规则测试器可验证规则是否生效
- [ ] 性能：500 条规则下过滤耗时 < 5ms（缓存+预编译）
- [ ] 流式返回注意在 SSE 结束时一次性过滤
