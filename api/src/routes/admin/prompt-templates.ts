// ============================================================
//  3cloud (3C) — Admin 提示词模板库
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, like, desc, asc, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { promptTemplates, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

// ── 预设模板数据 ──

const PRESET_TEMPLATES = [
  {
    name: "通用对话模板",
    description: "适用于日常对话、问答场景，强调友好、专业的回复风格",
    category: "conversation",
    content: `你是一个专业、友好的AI助手。请遵循以下原则：

1. 回答准确、简洁、有条理
2. 使用清晰的语言，避免过于专业的术语
3. 如果不确定，请诚实说明
4. 对于复杂问题，可以分步骤解答

用户问题：{{question}}

请提供你的回答：`,
    variables: [
      { name: "question", label: "用户问题", required: true, description: "用户提出的问题" },
    ],
    rules: { checkSensitive: true, maxLength: 4000 },
    tags: ["对话", "问答", "通用"],
    sortOrder: 1,
  },
  {
    name: "代码生成模板",
    description: "适用于代码编写、调试、优化场景，强调代码质量和最佳实践",
    category: "code",
    content: `你是一个专业的编程助手。请根据以下要求生成代码：

语言：{{language}}
功能描述：{{description}}
要求：{{requirements}}

请提供：
1. 完整的代码实现
2. 必要的注释说明
3. 使用示例
4. 时间/空间复杂度分析（如适用）

注意事项：
- 遵循该语言的最佳实践
- 考虑边界情况和错误处理
- 代码应具有良好的可读性`,
    variables: [
      { name: "language", label: "编程语言", required: true, default: "JavaScript" },
      { name: "description", label: "功能描述", required: true },
      { name: "requirements", label: "特殊要求", default: "" },
    ],
    rules: { checkSensitive: true, maxLength: 8000, requireApproval: false },
    tags: ["代码", "编程", "开发"],
    sortOrder: 2,
  },
  {
    name: "文档写作模板",
    description: "适用于技术文档、API文档、使用说明等写作场景",
    category: "document",
    content: `请根据以下信息撰写专业文档：

文档类型：{{docType}}
主题：{{topic}}
目标读者：{{audience}}

内容要求：
- 结构清晰，层次分明
- 语言准确、专业
- 提供必要的示例
- 包含常见问题解答

请按照以下结构输出：
1. 概述
2. 详细说明
3. 使用示例
4. 注意事项
5. 常见问题`,
    variables: [
      { name: "docType", label: "文档类型", required: true, default: "技术文档" },
      { name: "topic", label: "文档主题", required: true },
      { name: "audience", label: "目标读者", default: "开发者" },
    ],
    rules: { checkSensitive: true, maxLength: 10000 },
    tags: ["文档", "写作", "说明"],
    sortOrder: 3,
  },
  {
    name: "数据分析模板",
    description: "适用于数据解读、趋势分析、报告生成场景",
    category: "analysis",
    content: `请对以下数据进行分析：

数据描述：{{dataDescription}}
分析目标：{{goal}}
时间范围：{{timeRange}}

请提供：
1. 数据概览
   - 数据量统计
   - 关键指标

2. 趋势分析
   - 主要趋势
   - 异常点识别

3. 洞察与建议
   - 关键发现
   - 改进建议

4. 可视化建议
   - 推荐图表类型
   - 展示重点`,
    variables: [
      { name: "dataDescription", label: "数据描述", required: true },
      { name: "goal", label: "分析目标", required: true },
      { name: "timeRange", label: "时间范围", default: "近30天" },
    ],
    rules: { checkSensitive: true, maxLength: 6000 },
    tags: ["数据分析", "报告", "统计"],
    sortOrder: 4,
  },
  {
    name: "API 接口文档模板",
    description: "专门用于生成 RESTful API 接口文档",
    category: "document",
    content: `请为以下 API 生成完整的接口文档：

接口名称：{{apiName}}
请求方法：{{method}}
路径：{{path}}
功能描述：{{description}}

请按以下格式输出：

## 接口说明
[接口用途和注意事项]

## 请求
- 方法：{{method}}
- 路径：{{path}}
- Content-Type: application/json

### 请求参数
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|

### 请求示例
\`\`\`json
{}
\`\`\`

## 响应
### 响应参数
| 参数名 | 类型 | 说明 |
|--------|------|------|

### 响应示例
\`\`\`json
{}
\`\`\`

## 错误码
| 错误码 | 说明 |
|--------|------|`,
    variables: [
      { name: "apiName", label: "接口名称", required: true },
      { name: "method", label: "请求方法", required: true, default: "GET" },
      { name: "path", label: "接口路径", required: true },
      { name: "description", label: "功能描述", required: true },
    ],
    rules: { checkSensitive: true, maxLength: 8000 },
    tags: ["API", "文档", "接口"],
    sortOrder: 5,
  },
  {
    name: "代码审查模板",
    description: "用于代码审查，检查代码质量、安全性、性能等方面",
    category: "code",
    content: `请对以下代码进行审查：

语言：{{language}}
代码：
\`\`\`{{language}}
{{code}}
\`\`\`

请从以下方面进行审查：

1. **代码质量**
   - 可读性
   - 命名规范
   - 代码结构

2. **安全性**
   - 潜在漏洞
   - 敏感信息处理

3. **性能**
   - 算法效率
   - 资源使用

4. **最佳实践**
   - 语言特性使用
   - 设计模式

请提供：
- 问题列表（按严重程度排序）
- 改进建议
- 优化后的代码示例（如有必要）`,
    variables: [
      { name: "language", label: "编程语言", required: true, default: "JavaScript" },
      { name: "code", label: "待审查代码", required: true },
    ],
    rules: { checkSensitive: true, maxLength: 10000 },
    tags: ["代码审查", "质量", "安全"],
    sortOrder: 6,
  },
];

export async function promptTemplatesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/prompt-templates — 模板列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/prompt-templates", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      category?: string;
      enabled?: string;
      isPreset?: string;
      keyword?: string;
      sortBy?: string;
      sortOrder?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];

    if (query.category) {
      conditions.push(eq(promptTemplates.category, query.category));
    }
    if (query.enabled !== undefined) {
      conditions.push(eq(promptTemplates.enabled, query.enabled === "true"));
    }
    if (query.isPreset !== undefined) {
      conditions.push(eq(promptTemplates.isPreset, query.isPreset === "true"));
    }
    if (query.keyword) {
      conditions.push(
        sql`(${promptTemplates.name} ILIKE ${`%${query.keyword}%`} OR ${promptTemplates.description} ILIKE ${`%${query.keyword}%`})`
      );
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promptTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // 排序
    const sortColumn = query.sortBy === "usage" ? promptTemplates.usageCount :
                       query.sortBy === "name" ? promptTemplates.name :
                       promptTemplates.sortOrder;
    const orderFn = query.sortOrder === "desc" ? desc : asc;

    const rows = await db
      .select({
        id: promptTemplates.id,
        name: promptTemplates.name,
        description: promptTemplates.description,
        category: promptTemplates.category,
        content: promptTemplates.content,
        variables: promptTemplates.variables,
        rules: promptTemplates.rules,
        usageCount: promptTemplates.usageCount,
        lastUsedAt: promptTemplates.lastUsedAt,
        enabled: promptTemplates.enabled,
        isPreset: promptTemplates.isPreset,
        reviewStatus: promptTemplates.reviewStatus,
        tags: promptTemplates.tags,
        sortOrder: promptTemplates.sortOrder,
        createdBy: promptTemplates.createdBy,
        createdAt: promptTemplates.createdAt,
        updatedAt: promptTemplates.updatedAt,
        creatorName: users.nickname,
      })
      .from(promptTemplates)
      .leftJoin(users, eq(promptTemplates.createdBy, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset);

    reply.send({
      code: 0,
      data: {
        list: rows,
        total: countResult.count,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/prompt-templates/categories — 分类列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/prompt-templates/categories", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();

    const rows = await db
      .select({
        category: promptTemplates.category,
        count: sql<number>`count(*)::int`,
      })
      .from(promptTemplates)
      .groupBy(promptTemplates.category);

    const categories = [
      { key: "conversation", label: "通用对话", count: 0 },
      { key: "code", label: "代码生成", count: 0 },
      { key: "document", label: "文档写作", count: 0 },
      { key: "analysis", label: "数据分析", count: 0 },
      { key: "custom", label: "自定义", count: 0 },
    ];

    for (const row of rows) {
      const cat = categories.find(c => c.key === row.category);
      if (cat) cat.count = row.count;
    }

    reply.send({ code: 0, data: categories, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/prompt-templates/:id — 详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/prompt-templates/:id", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const [row] = await db
      .select({
        id: promptTemplates.id,
        name: promptTemplates.name,
        description: promptTemplates.description,
        category: promptTemplates.category,
        content: promptTemplates.content,
        variables: promptTemplates.variables,
        rules: promptTemplates.rules,
        usageCount: promptTemplates.usageCount,
        lastUsedAt: promptTemplates.lastUsedAt,
        enabled: promptTemplates.enabled,
        isPreset: promptTemplates.isPreset,
        reviewStatus: promptTemplates.reviewStatus,
        reviewedBy: promptTemplates.reviewedBy,
        reviewedAt: promptTemplates.reviewedAt,
        reviewNote: promptTemplates.reviewNote,
        tags: promptTemplates.tags,
        sortOrder: promptTemplates.sortOrder,
        createdBy: promptTemplates.createdBy,
        createdAt: promptTemplates.createdAt,
        updatedAt: promptTemplates.updatedAt,
        creatorName: users.nickname,
      })
      .from(promptTemplates)
      .leftJoin(users, eq(promptTemplates.createdBy, users.id))
      .where(eq(promptTemplates.id, parseInt(id, 10)));

    if (!row) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }

    reply.send({ code: 0, data: row, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/prompt-templates — 创建模板
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/prompt-templates", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      name: string;
      description?: string;
      category?: string;
      content: string;
      variables?: any[];
      rules?: any;
      tags?: string[];
      sortOrder?: number;
    };

    if (!body.name || body.name.trim().length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "模板名称不能为空" });
    }
    if (!body.content || body.content.trim().length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "模板内容不能为空" });
    }

    const [created] = await db
      .insert(promptTemplates)
      .values({
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        category: body.category ?? "custom",
        content: body.content,
        variables: body.variables ?? [],
        rules: body.rules ?? {},
        tags: body.tags ?? [],
        sortOrder: body.sortOrder ?? 0,
        createdBy: (request.user as any).id,
      })
      .returning();

    reply.send({ code: 0, data: created, message: "创建成功" });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/prompt-templates/:id — 更新模板
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/prompt-templates/:id", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      category?: string;
      content?: string;
      variables?: any[];
      rules?: any;
      enabled?: boolean;
      tags?: string[];
      sortOrder?: number;
    };

    const [existing] = await db
      .select({ id: promptTemplates.id, isPreset: promptTemplates.isPreset })
      .from(promptTemplates)
      .where(eq(promptTemplates.id, parseInt(id, 10)));

    if (!existing) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }

    // 预设模板只能修改部分字段
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (existing.isPreset) {
      // 预设模板只允许修改 enabled 和 sortOrder
      if (body.enabled !== undefined) updateData.enabled = body.enabled;
      if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
    } else {
      // 自定义模板可以修改所有字段
      if (body.name !== undefined) updateData.name = body.name.trim();
      if (body.description !== undefined) updateData.description = body.description?.trim() ?? null;
      if (body.category !== undefined) updateData.category = body.category;
      if (body.content !== undefined) updateData.content = body.content;
      if (body.variables !== undefined) updateData.variables = body.variables;
      if (body.rules !== undefined) updateData.rules = body.rules;
      if (body.enabled !== undefined) updateData.enabled = body.enabled;
      if (body.tags !== undefined) updateData.tags = body.tags;
      if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
    }

    const [updated] = await db
      .update(promptTemplates)
      .set(updateData)
      .where(eq(promptTemplates.id, parseInt(id, 10)))
      .returning();

    reply.send({ code: 0, data: updated, message: "更新成功" });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/prompt-templates/:id — 删除模板
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/prompt-templates/:id", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select({ id: promptTemplates.id, isPreset: promptTemplates.isPreset })
      .from(promptTemplates)
      .where(eq(promptTemplates.id, parseInt(id, 10)));

    if (!existing) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }

    if (existing.isPreset) {
      return reply.status(400).send({ code: 400, data: null, message: "预设模板不可删除" });
    }

    await db
      .delete(promptTemplates)
      .where(eq(promptTemplates.id, parseInt(id, 10)));

    reply.send({ code: 0, data: null, message: "删除成功" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/prompt-templates/:id/use — 记录使用
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/prompt-templates/:id/use", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(eq(promptTemplates.id, parseInt(id, 10)));

    if (!existing) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }

    const [updated] = await db
      .update(promptTemplates)
      .set({
        usageCount: sql`${promptTemplates.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(promptTemplates.id, parseInt(id, 10)))
      .returning();

    reply.send({ code: 0, data: updated, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/prompt-templates/preview — 预览模板
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/prompt-templates/preview", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const body = request.body as {
      content: string;
      variables?: Record<string, string>;
    };

    if (!body.content) {
      return reply.status(400).send({ code: 400, data: null, message: "模板内容不能为空" });
    }

    let result = body.content;
    const vars = body.variables ?? {};

    // 替换变量 {{varName}}
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      result = result.replace(regex, value);
    }

    // 检查未替换的变量
    const unreplaced = result.match(/\{\{(\w+)\}\}/g);
    const unreplacedVars = unreplaced
      ? [...new Set(unreplaced.map(v => v.slice(2, -2)))]
      : [];

    reply.send({
      code: 0,
      data: {
        result,
        unreplacedVars,
        hasUnreplaced: unreplacedVars.length > 0,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/prompt-templates/init-presets — 初始化预设模板
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/prompt-templates/init-presets", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();

    // 检查是否已初始化
    const [existing] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promptTemplates)
      .where(eq(promptTemplates.isPreset, true));

    if (existing.count > 0) {
      return reply.send({
        code: 0,
        data: { count: 0, message: "预设模板已存在" },
        message: "ok",
      });
    }

    // 插入预设模板
    const values = PRESET_TEMPLATES.map(t => ({
      ...t,
      isPreset: true,
      createdBy: (request.user as any).id,
    }));

    const created = await db
      .insert(promptTemplates)
      .values(values)
      .returning();

    reply.send({
      code: 0,
      data: { count: created.length },
      message: `成功初始化 ${created.length} 个预设模板`,
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/prompt-templates/:id/review — 审核模板
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/prompt-templates/:id/review", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const body = request.body as {
      reviewStatus: "approved" | "rejected";
      reviewNote?: string;
    };

    const [existing] = await db
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(eq(promptTemplates.id, parseInt(id, 10)));

    if (!existing) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }

    const [updated] = await db
      .update(promptTemplates)
      .set({
        reviewStatus: body.reviewStatus,
        reviewedBy: (request.user as any).id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote ?? null,
        updatedAt: new Date(),
      })
      .where(eq(promptTemplates.id, parseInt(id, 10)))
      .returning();

    reply.send({ code: 0, data: updated, message: "审核完成" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/prompt-templates/batch — 批量操作
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/prompt-templates/batch", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      ids: number[];
      action: "enable" | "disable" | "delete";
    };

    if (!body.ids || body.ids.length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "请选择模板" });
    }

    // 获取目标模板
    const targets = await db
      .select({ id: promptTemplates.id, isPreset: promptTemplates.isPreset })
      .from(promptTemplates)
      .where(inArray(promptTemplates.id, body.ids));

    if (targets.length === 0) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }

    let affected = 0;

    if (body.action === "enable" || body.action === "disable") {
      const enabled = body.action === "enable";
      const result = await db
        .update(promptTemplates)
        .set({ enabled, updatedAt: new Date() })
        .where(inArray(promptTemplates.id, targets.map(t => t.id)));
      affected = result.length;
    } else if (body.action === "delete") {
      // 只删除非预设模板
      const deletable = targets.filter(t => !t.isPreset);
      if (deletable.length > 0) {
        await db
          .delete(promptTemplates)
          .where(inArray(promptTemplates.id, deletable.map(t => t.id)));
        affected = deletable.length;
      }
    }

    reply.send({
      code: 0,
      data: { affected },
      message: `成功操作 ${affected} 个模板`,
    });
  });
}
