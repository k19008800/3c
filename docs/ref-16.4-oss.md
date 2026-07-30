# 深化参考：§16.4 对象存储（OSS/S3）

> **对应**：[`PRD-第三方集成.md`](PRD-第三方集成.md) §16.4
> **关联**：[`SPEC-§33-合规法务与成本分析.md`](SPEC-§33-合规法务与成本分析.md)
> **优先级**：P1 | **状态**：代码已实现，补充需求文档
> **最后更新**：2026-07-30

---

## 概述

系统需要对象存储服务用于文件上传（实名认证材料、发票附件、合同附件）、数据库备份、日志归档。当前使用阿里云 OSS / 腾讯云 COS / AWS S3（兼容 MinIO），文件上传逻辑已实现，但缺少统一管理界面。

**核心价值**：文件存储统一管理，生命周期自动管理，预签名 URL 安全直传。

---

## 功能模块

### 1. 使用场景

| 场景 | 存储路径 | 保留策略 | 访问控制 |
|------|---------|---------|---------|
| 实名认证材料 | `/uploads/real-name/{userId}/{date}/` | 永久保留 | 仅管理员可读 |
| 发票附件 | `/uploads/invoice/{userId}/{date}/` | 永久保留 | 仅管理员和用户本人可读 |
| 合同附件 | `/uploads/contract/{contractId}/` | 合同到期后 3 年 | 仅管理员和业务员可读 |
| 数据库备份 | `/backups/db/{date}/` | 30 天后自动删除 | 仅服务端可读写 |
| 日志归档 | `/backups/logs/{date}/` | 90 天后自动删除 | 仅服务端可读写 |
| 用户头像 | `/uploads/avatar/{userId}.jpg` | 永久保留 | 公开只读 |

### 2. 存储配置

```typescript
// storage_configs — 存储配置
export const storageConfigs = pgTable("storage_configs", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 20 }).notNull().unique(), // aliyun | tencent | aws | minio
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull(),
  // aliyun: { endpoint, bucket, accessKeyId, accessKeySecret }
  testMode: boolean("test_mode").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 3. 预签名 URL

前端上传文件时不直接暴露 AccessKey，而是通过服务端生成预签名 URL：

```
上传流程：
1. 前端请求 POST /api/v1/admin/upload/presigned-url
   body: { fileName, fileType, scene }
2. 服务端验证权限 → 生成预签名 PUT URL（有效期 5 分钟）
3. 前端直接 PUT 到 OSS
4. 上传完成后前端调用 POST /api/v1/admin/upload/confirm
   body: { fileKey, fileSize, scene }
5. 服务端记录文件信息到 file_records 表
```

```typescript
// file_records — 文件记录
export const fileRecords = pgTable("file_records", {
  id: serial("id").primaryKey(),
  fileKey: varchar("file_key", { length: 255 }).notNull(), // OSS 中的路径
  fileName: varchar("file_name", { length: 200 }).notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  scene: varchar("scene", { length: 30 }).notNull(),
  // real_name | invoice | contract | avatar | backup | log | other
  uploadedBy: integer("uploaded_by").references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // 自动过期删除时间
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 4. 存储管理

```
对象存储管理

  ┌─────────────────────────────────────────────────────┐
  │  总存储: 15.2 GB / 100 GB  █████░░░░░░  15%         │
  │                                                      │
  │  按场景分布:                                         │
  │  ├── 实名认证材料: 2.1 GB                            │
  │  ├── 发票附件: 1.5 GB                               │
  │  ├── 合同附件: 3.2 GB                               │
  │  ├── 数据库备份: 5.8 GB                             │
  │  └── 日志归档: 2.6 GB                               │
  └─────────────────────────────────────────────────────┘

  文件列表
  [按场景 ▼] [搜索文件名] [时间范围 ▼]

  ┌──────┬────────┬────────┬────────┬────────┬──────────┐
  │ 文件名 │ 场景   │ 大小   │ 上传者  │ 上传时间 │ 操作    │
  ├──────┼────────┼────────┼────────┼────────┼──────────┤
  │ id_…  │ 实名认证│ 2.5 MB │ 张三   │ 07-28  │ [下载]  │
  │ inv_… │ 发票附件│ 1.2 MB │ 李四   │ 07-27  │ [下载]  │
  └──────┴────────┴────────┴────────┴────────┴──────────┘
```

### 5. 生命周期管理

| 操作 | 说明 |
|------|------|
| 自动过期 | 备份/日志文件按保留策略自动删除（通过 OSS 生命周期规则 + 服务端定时任务） |
| 手动清理 | 管理员可手动清理指定场景的过期文件 |
| 归档 | 超过 30 天的文件自动转为归档存储（降低存储成本） |

### 6. API 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/integrations/storage/config` | 存储配置 | 超管 |
| `PATCH` | `/api/v1/admin/integrations/storage/config` | 更新存储配置 | 超管 |
| `POST` | `/api/v1/admin/integrations/storage/test` | 测试连通性 | 超管 |
| `POST` | `/api/v1/admin/upload/presigned-url` | 获取预签名上传 URL | 登录用户 |
| `POST` | `/api/v1/admin/upload/confirm` | 确认上传完成 | 登录用户 |
| `GET` | `/api/v1/admin/upload/files?scene=&search=&page=&limit=` | 文件列表 | 管理员 |
| `GET` | `/api/v1/admin/upload/files/:id` | 文件详情 | 管理员 |
| `GET` | `/api/v1/admin/upload/files/:id/download` | 下载文件（预签名 URL） | 管理员 |
| `DELETE` | `/api/v1/admin/upload/files/:id` | 删除文件（软删除） | 管理员 |
| `GET` | `/api/v1/admin/upload/stats` | 存储统计 | 管理员 |

### 7. 降级策略

| 场景 | 降级方案 |
|------|---------|
| OSS 不可用 | 回退到本地磁盘存储（临时目录） |
| 本地磁盘也不可用 | 提示"存储服务异常"，阻止上传操作 |
| 存储空间不足 | 告警通知管理员，阻止新上传 |

### 8. 边界条件

| 场景 | 处理方式 |
|------|---------|
| 上传文件大小超过限制 | 单文件最大 50MB，超过返回错误 |
| 上传文件类型不合法 | 按场景校验 mime 类型（实名认证仅接受 jpg/png/pdf）|
| 预签名 URL 过期 | 返回 403，前端需重新获取 URL |
| 并发上传相同文件 | 允许多次上传，以最后一次为准 |
| 恶意文件检测 | 上传后扫描文件类型，非预期类型标记为"可疑" |

### 9. 关联模块

| 模块 | 关联方式 |
|------|---------|
| §33.3 用户数据导出 | 导出数据打包后上传到 OSS 供用户下载 |
| 实名认证 | 实名材料上传到 OSS |
| 发票/合同 | 附件上传到 OSS |

---

### [?] 页面帮助
**页面名称**：对象存储管理
**核心操作**：查看存储用量、管理文件、配置存储服务商
**注意事项**：上传文件单文件最大 50MB；备份文件 30 天后自动删除；存储服务不可用时降级为本地存储

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 配置 | 设置存储服务商（阿里云 OSS/腾讯云 COS/AWS S3） |
| 测试连通性 | 向当前配置的存储服务商发送测试请求 |
| 文件列表 | 查看所有上传文件的列表和大小 |
| 下载 | 生成预签名下载 URL，有效期 1 小时 |
| 删除 | 软删除文件记录，OSS 中的文件由生命周期规则清理 |