import { registerFeatureDescriptions } from '@/components/admin/FeatureDescription'
import type { FeatureDesc } from '@/components/admin/FeatureDescription'

/**
 * 全局功能描述配置
 * key = 页面路由路径（如 "admin/finance/prices"）
 *
 * 每条描述包含：
 * - title:     页面名称
 * - summary:   一句话概括该页面的业务目的
 * - details:   关键业务概念说明（含 UI 功能 + 业务逻辑注释）
 * - usage:     日常操作提示（可选）
 */
const FEATURE_DESCRIPTIONS: Record<string, FeatureDesc> = {
  // ════════════════════════════════════════════
  //  📊 总览看板
  // ════════════════════════════════════════════

  "admin": {
    title: "管理仪表盘",
    summary: "系统核心运营总览，展示关键指标、收入趋势、系统健康状态和待办事项。",
    details: [
      "KPI 卡片：当日调用量、收入、活跃用户、系统健康分等关键数据",
      "收入趋势：近7/30天的收入曲线，辅助判断业务增长",
      "TOP 用户：按消费额排序的头部用户列表",
      "Vendor 健康：各供应商的连通性、熔断状态一览",
      "待办队列：需要管理员处理的事项（审核、告警等）",
      "【状态流转】N/A（只读聚合面板，无状态流转）",
      "【权限要求】DASHBOARD_VIEW（bit 0）",
      "【数据校验】无写入操作，无需校验",
      "【关联影响】KPI 卡片聚合自多个独立查询；todo-queue 展示待处理的实名审核/充值/提现，按优先级排序",
      "【触发条件】缓存 TTL 30s，数据每 30 秒自动刷新",
      "【API 端点】GET /admin/dashboard/stats, /admin/dashboard/trends, /admin/dashboard/revenue, /admin/dashboard/top-consumers, /admin/dashboard/todo-queue",
    ],
    usage: "每天早上打开查看整体运营状况，关注异常波动和待办事项。",
  },

  "admin/enterprise-analysis": {
    title: "企业数据分析",
    summary: "深度分析企业级用户的消费行为、模型使用分布和财务贡献。",
    details: [
      "企业总览：企业用户的注册数、活跃度、总消费等汇总",
      "消费趋势：企业用户按日/周/月的消费金额变化",
      "模型使用热力图：哪些模型被企业用户高频调用",
      "地理分布：企业用户在全国/全球的分布情况",
      "余额预警：余额不足的企业用户列表",
      "【状态流转】N/A（只读分析面板）",
      "【权限要求】DASHBOARD_VIEW（bit 0）",
      "【数据校验】无写入操作，时间范围筛选仅允许有效日期区间",
      "【关联影响】数据来源于 users 表（userType=enterprise）、call_logs、balance_logs 的聚合查询",
      "【触发条件】企业用户注册后自动进入分析范围",
      "【API 端点】GET /admin/dashboard/enterprise（聚合多维度企业数据）",
    ],
    usage: "用于 VIP 企业客户的经营分析，发现高价值客户和高频模型。",
  },

  "admin/stats": {
    title: "聚合统计",
    summary: "按时间维度统计全平台的关键业务数据，支持多维度对比。",
    details: [
      "聚合维度：按天、按模型、按供应商等维度统计",
      "指标包含：调用次数、Token 消耗、成功率、平均耗时",
      "【状态流转】N/A（只读统计面板）",
      "【权限要求】DASHBOARD_VIEW（bit 0）",
      "【数据校验】无写入操作，查询参数为可选的时间范围和维度筛选",
      "【关联影响】数据源为 call_logs 表聚合，支持按模型名/供应商/用户类型分组",
      "【触发条件】无特定触发条件，页面上选择时间范围和维度即可查询",
      "【API 端点】GET /admin/stats, GET /admin/stats-usage（聚合查询接口）",
    ],
    usage: "用于生成周报/月报的数据源，排查某段时间的异常波动。",
  },

  "admin/circuit-breakers": {
    title: "熔断看板",
    summary: "监控所有供应商接口的熔断器状态，当供应商连续失败时自动断开流量。",
    details: [
      "熔断机制：某供应商连续请求失败 → 自动断开流量 → 指定时间后尝试恢复",
      "状态说明：closed(正常) / open(已断开) / half_open(半开) / dead(死亡)",
      "跨供应商路由：一个熔断后，流量自动切换到其他健康供应商",
      "【状态流转】closed → open（连续失败达阈值）→ half_open（retryAfter 到期）→ closed（探测成功）或 open（探测失败）→ dead（手动标记/持续不可用）",
      "【权限要求】SECURITY_VIEW（bit 19）查看、SECURITY_ACTION（bit 20）重置熔断",
      "【数据校验】重置操作需验证 vendorModelId 有效",
      "【关联影响】熔断状态直接影响路由引擎的供应商选择，down 状态厂商被排除出路由池；重置熔断后路由立即恢复",
      "【触发条件】被动检测：成功率采样 < 30% 触发 open；主动探测：每 5 分钟健康检查探测宕机厂商",
      "【API 端点】GET /admin/security/circuits, POST /admin/security/circuits/:vmId/reset",
    ],
    usage: "定期关注被熔断的供应商，确认上游恢复后手动关闭熔断。",
  },

  "admin/system-health": {
    title: "系统健康",
    summary: "监控 3cloud 平台自身各组件的运行状态和资源使用情况。",
    details: [
      "组件状态：API 服务、PostgreSQL、Redis 等核心组件是否在线",
      "资源使用：CPU、内存、磁盘等系统资源水位",
      "响应延迟：API 接口的 P50/P95/P99 响应时间",
      "【状态流转】N/A（实时监控面板，无状态流转）",
      "【权限要求】OPS_READ（bit 25）",
      "【数据校验】无写入操作，均为只读健康检查探针",
      "【关联影响】Redis 不可用会影响 session/缓存/限流；PG 不可用会影响全部数据读写",
      "【触发条件】通过 /health（存活检查）和 /ready（就绪检查含 DB+Redis）端点获取状态",
      "【API 端点】GET /health, GET /ready, GET /admin/dashboard/health",
    ],
    usage: "排查系统故障时查看，关注资源使用率是否接近阈值。",
  },

  // ════════════════════════════════════════════
  //  👤 用户运营
  // ════════════════════════════════════════════

  "admin/users": {
    title: "用户管理",
    summary: "管理平台所有用户账户，支持查看详情、编辑资料、禁用/启用、模拟登录和角色变更。",
    details: [
      "状态说明：active(正常) / pending(未验证邮箱) / disabled(管理员禁用) / deleted(已注销)",
      "操作：查看用户详情、编辑昵称/邮箱、禁用/启用、修改角色、模拟登录（以该用户身份操作）",
      "详情弹窗含多标签：基本信息、API Key、调用统计、余额流水、登录历史、操作日志",
      "【状态流转】active → disabled（管理员禁用）→ active（重新启用）；active → deleted（软删除，记录 deletedAt）；pending ↔ active（邮箱验证联动，status 变更时自动处理 emailVerifiedAt）",
      "【权限要求】USER_LIST（bit 1）查看列表、USER_VIEW（bit 2）查看详情、USER_EDIT（bit 3）编辑、USER_DELETE（bit 4）删除、USER_CREATE（bit 5）创建、USER_RESET_PWD（bit 6）重置密码、USER_CHANGE_ROLE（bit 7）变更角色、USER_BALANCE（bit 8）余额管理、USER_IMPERSONATE（bit 9）模拟登录",
      "【数据校验】创建用户：邮箱格式 + 去重检查（409 冲突）、密码 min 8 chars 含大写+数字（bcrypt 哈希）、nickname 长度限制；编辑用户：仅允许更新白名单字段（nickname/phone/status/role/discountRate 等）",
      "【关联影响】删除用户 → 软删除（status=deleted），不影响历史 call_logs/balance_logs；角色变更 → 清除权限缓存（perm:user:*）；状态变更影响 API Key 鉴权（disabled/deleted 用户被 403 拦截）",
      "【触发条件】模拟登录仅在非模拟态下可用（guardNotImpersonating）；模拟态下禁止写操作",
      "【API 端点】GET/POST/PATCH/DELETE /admin/users, PATCH /admin/users/:id/change-role, POST /admin/users/:id/recharge, GET /admin/users/:id/permissions",
    ],
    usage: "日常用户管理、异常账号处理、客户支持时查看用户详情。",
  },

  "admin/real-name-review": {
    title: "实名审核",
    summary: "审核用户提交的实名认证申请，确保身份信息真实有效。",
    details: [
      "审核流程：用户提交姓名+身份证号 → 管理员审核通过/拒绝 → 实名状态更新",
      "状态说明：pending_review(待审核) / approved(已通过) / rejected(已拒绝)",
      "【状态流转】pending_review → approved（审核通过，清除 rejectReason）→ rejected（审核拒绝，填写拒绝原因）；rejected 用户可重新提交 → pending_review",
      "【权限要求】REVIEW_LIST（bit 10）查看审核列表、REVIEW_ACTION（bit 11）审核操作（approve/reject）",
      "【数据校验】OCR 结果通过 user_real_name_reviews 表多版本存储；身份证号校验（GB 11643 校验位算法）；支持手动确认实名绕过 OCR",
      "【关联影响】审核通过 → users.realNameStatus = approved → 用户可正常调用 API；审核拒绝 → 用户 API 调用返回 403 提示实名未通过；审核操作同步更新 user_real_name_reviews 表所有 pending 版本记录",
      "【触发条件】用户提交实名认证后进入审核队列；管理员可查看 user_real_name_reviews 的 OCR 置信度辅助决策",
      "【API 端点】GET /admin/real-name-review, GET /admin/real-name-review/detail/:userId, POST /admin/real-name-review/:id, POST /admin/users/:id/manual-real-name, GET /admin/users/:id/real-name-history, GET /admin/real-name-reviews（新版分页）",
    ],
    usage: "收到实名审核申请时尽快处理，影响用户的高额充值和使用权限。",
  },

  "admin/quotas": {
    title: "额度管理",
    summary: "管理用户的充值额度、赠送额度、API Key 调用限额等。",
    details: [
      "额度类型：monthly（每月自动重置）和 one_time（一次性，不自动重置）",
      "支持对单个用户进行额度设置（增加/减少/修改），可手动调整 usedAmount",
      "【状态流转】active（periodStart ≤ now ≤ periodEnd）→ expired（periodEnd 已过期）；monthly 类型在每月 1 号自动重置 usedAmount = 0",
      "【权限要求】USER_LIST（bit 1）查看列表、USER_EDIT（bit 3）创建/修改/删除额度",
      "【数据校验】quotaAmount > 0；alertPercent 1-100；RPM/TPM limits 必须为正整数；userId 必须存在；periodStart < periodEnd",
      "【关联影响】额度消耗通过 billing charge() 函数实时扣减 usedAmount；alertPercent 触发余额预警通知；所有操作记录在 auditLogs 中（含 before/after 快照）",
      "【触发条件】管理员手动设置或编辑额度；API 调用时自动从 QuotaService 读取并校验",
      "【API 端点】POST /admin/quotas（设置额度）、GET /admin/quotas（查询列表，支持 user_id/status 筛选）、PUT /admin/quotas/:id（修改）、DELETE /admin/quotas/:id（硬删除）",
    ],
    usage: "处理用户退款补偿、活动赠送额度、异常扣费返还等场景。",
  },

  "admin/admin-api-keys": {
    title: "管理 API Key",
    summary: "查看和管理全平台所有用户的 API 密钥，包括创建、禁用和删除。",
    details: [
      "可查看每个用户的 API Key 列表及使用状态",
      "支持管理员代用户创建新密钥",
      "支持禁用异常密钥，阻止非法调用",
      "【状态流转】API Key: active（可用）→ disabled（禁用，status=false）→ 可重新启用；expired（expiresAt 已过）",
      "【权限要求】MODEL_MANAGE（bit 12）管理 API Key",
      "【数据校验】创建 API Key 时名称为必填；密钥存储使用 SHA-256 哈希，原始 key 仅在创建时返回一次",
      "【关联影响】API Key 禁用/过期后调用 /v1/chat/completions 返回 401 invalid_api_key；API Key 状态变更不影响已生成的调用日志",
      "【触发条件】用户忘记密钥或密钥泄露时可以重置/禁用",
      "【API 端点】GET /admin/api-keys, POST /admin/api-keys, DELETE /admin/api-keys/:id, PATCH /admin/api-keys/:id",
    ],
    usage: "用户忘记密钥或密钥泄露时，管理员帮其重置或禁用。",
  },

  "admin/roles": {
    title: "角色权限",
    summary: "配置管理后台的角色和权限矩阵，控制不同管理员可访问的功能范围。",
    details: [
      "角色类型：系统预置角色（isSystem=true，不可删除）：super_admin(全权限 ~0n)、admin(运营)、finance_ops(财务)、ops(运维)、support(客服)、auditor(审计)；自定义角色（isSystem=false，可删除）",
      "权限精细到 27 个 bit 位（bigint 位掩码），支持自定义角色并赋予特定权限集合",
      "三栏布局：左侧角色列表、中间权限矩阵、右侧成员管理",
      "【状态流转】N/A（角色本身无生命周期状态；用户-角色分配为即时生效）",
      "【权限要求】CONFIG_VIEW（bit 17）查看角色列表、MODEL_MANAGE（bit 12）创建/编辑/删除角色；USER_EDIT（bit 3）分配/移除用户角色",
      "【数据校验】角色名唯一且格式要求 lowercase + underscore；permissions 字段为 bigint 字符串格式；super_admin 角色不可编辑/删除；isSystem 角色不可删除；分配角色时检查重复（同一用户-角色对不可重复分配）",
      "【关联影响】角色权限变更后 → clearAllPermissionCache() 清除所有用户权限缓存（perm:user:*，TTL 60s）；用户-角色分配变更 → clearPermissionCache(userId)；权限优先级：user_permission_overrides > user_role_assignments > users.role 硬编码",
      "【触发条件】编辑弹窗打开时 populate permKeys 从 bitmask 解析位值（FIXED 逻辑）",
      "【API 端点】GET /admin/roles, POST /admin/roles, PATCH /admin/roles/:id, DELETE /admin/roles/:id, GET /admin/roles/permissions/list, POST/DELETE /admin/roles/:id/users/:userId, GET /admin/roles/users/:roleId, GET/PUT/DELETE /admin/users/:id/permissions",
    ],
    usage: "新管理员入职时分配角色，或需要限制某角色访问特定功能时调整权限。",
  },

  // ════════════════════════════════════════════
  //  🤖 资源管理
  // ════════════════════════════════════════════

  "admin/models": {
    title: "模型管理",
    summary: "管理平台向用户开放的 AI 模型目录，控制模型的上架、定价和可见性。",
    details: [
      "模型列表：展示所有已接入的 AI 模型名称、类型（chat/embedding/image/audio）、供应商",
      "上架/下架：status 字段控制模型对用户是否可见可用",
      "模型分组：可以按业务场景对模型进行分组管理",
      "【状态流转】status: true（上架）↔ false（下架）；模型类型不可变（chat/embedding/image/audio）",
      "【权限要求】MODEL_MANAGE（bit 12）创建/编辑/删除模型",
      "【数据校验】name 必填且唯一（23505 冲突检测）；type 仅允许 chat/embedding/image/audio 四种；删除前检查是否有关联 vendor_models（有则拒绝）",
      "【关联影响】模型下架 → 用户端模型列表不可见；删除模型需先清理 vendor_models 关联映射；所有操作记录 auditLogs",
      "【触发条件】新增供应商接入后需要创建对应模型记录",
      "【API 端点】GET/POST/PATCH/DELETE /admin/models",
    ],
    usage: "新增模型供应商接入后，在此页面上架对应的 AI 模型。",
  },

  "admin/vendors": {
    title: "供应商管理",
    summary: "管理上游 AI 模型供应商的信息、接入配置和连通性。",
    details: [
      "供应商信息：名称、API 地址、密钥、状态（active/degraded/down/disabled/pending）",
      "行内展开模型明细：查看该供应商下每个模型的成本价、售价、权重、熔断状态",
      "操作：连通性测试、启用/禁用、编辑配置、审核供应商注册、同步上游模型、生成 Vendor Key",
      "【状态流转】pending（供应商自助注册）→ admin approve → active（自动生成 Vendor Key）；active → degraded（成功率 < 70%）→ down（成功率 < 30%）→ disabled（手动）；circuit_breaker 自动触发熔断状态变更（closed → open → half_open → closed/dead）",
      "【权限要求】MODEL_MANAGE（bit 12）全部操作",
      "【数据校验】创建时 name + baseUrl 必填，baseUrl 需为合法 URL 格式；API Key 使用 AES-256-GCM 加密存储；编辑时限制白名单字段；删除前检查 vendor_models 关联（有关联则拒绝）",
      "【关联影响】状态变更影响路由池（down/disabled 厂商被路由引擎排除）；审核通过自动生成 Vendor Key（SHA-256 哈希存储）；同步上游模型时自动创建 models + vendor_models 映射",
      "【触发条件】供应商自助注册后 status=pending 需要审核；健康检查每 5 分钟自动探测并更新 healthScore",
      "【API 端点】GET/POST/PATCH/DELETE /admin/vendors, GET /admin/vendors/:id/models, POST /admin/vendors/:id/approve, POST /admin/vendors/:id/vendor-key, POST /admin/vendors/:id/sync-models, POST /admin/vendor-models/:id/approve",
    ],
    usage: "新供应商接入时在此页面填写配置，日常巡检供应商健康状态。",
  },

  "admin/vendor-models": {
    title: "模型映射",
    summary: "将上游供应商的模型名称映射到平台的统一模型名称，实现多供应商接入。",
    details: [
      "映射关系：上游模型名（如 claude-3-opus-20240229）→ 平台统一模型名（如 Claude 3 Opus）",
      "一个平台模型可对应多个供应商的上游模型，实现多供应商冗余",
      "配置每个映射的价格、权重（流量分配比例）",
      "【状态流转】status: true（启用）↔ false（禁用）；映射本身可被启用/禁用",
      "【权限要求】MODEL_MANAGE（bit 12）全部操作",
      "【数据校验】vendorId + modelId 唯一约束；costPrice/SellPrice 为 DECIMAL(18,6) 精度",
      "【关联影响】权重 weight 影响路由策略（加权动态路由按 weight 比例分配流量）；costPrice 影响利润分析中的成本计算",
      "【触发条件】新增供应商后需建立模型映射关系；供应商自助提交模型变更后需管理员审核（POST /admin/vendor-models/:id/approve）",
      "【API 端点】GET/POST/PATCH/DELETE /admin/vendor-models",
    ],
    usage: "新增供应商时在此页面建立模型映射关系，配置权重控制流量分配。",
  },

  "admin/vendor-self": {
    title: "供应商自助",
    summary: "供应商自助管理入口，供应商可自行查看和管理其接入的相关配置。",
    details: [
      "供应商可以自行查看其提供的模型列表",
      "适合需要让供应商有限访问平台数据的场景",
      "【状态流转】供应商自助注册后 status=pending，需管理员审核通过（POST /admin/vendors/:id/approve）→ active",
      "【权限要求】供应商使用 vendorKey 鉴权（非管理员 JWT），permissions: ['vendor:*']",
      "【数据校验】供应商自助提交的模型变更需管理员审核通过后方生效",
      "【关联影响】供应商自助更新数据写入 vendor_models 表（status=false 待审核）",
      "【触发条件】供应商通过 vendorKey 登录后可自助管理自己的模型列表和配置",
      "【API 端点】供应商端：GET/PATCH /vendor/models, POST /vendor/models（提交变更）；管理端审核：POST /admin/vendors/:id/approve, POST /admin/vendor-models/:id/approve",
    ],
    usage: "给外部供应商提供有限的平台访问权限，用于自助查看。",
  },

  "admin/agents": {
    title: "代理商管理",
    summary: "管理代理商体系，包括代理商资料、客户关系、佣金配置和结算信息。",
    details: [
      "代理商层级：平台支持代理商发展下游客户，可设置上级代理商（parentAgentId）",
      "每个代理商有独立的佣金比例配置",
      "可查看代理商的客户列表、消费统计和佣金流水",
      "【状态流转】agent status: active ↔ disabled（PATCH /admin/agents/:id 修改 status）",
      "【权限要求】AGENT_LIST（bit 22）查看列表/详情/客户/规则/结算配置、AGENT_MANAGE（bit 23）创建/编辑/删除/绑定客户/佣金规则/上级代理、FINANCE_COMMISSION（bit 14）手动结算",
      "【数据校验】创建代理商：userId + initialSaleRate 必填；佣金规则通过 upsertCommissionRuleSchema 校验；绑定客户通过 bindAgentClientSchema 校验",
      "【关联影响】绑定客户 → 创建 agent_customer_consumption 行，该客户后续 call_logs 生成 commission_logs；设置上级代理 → 分佣层级链；删除代理商仅删除代理身份，不删除用户",
      "【触发条件】代理商入驻后在后台创建账户，分配客户关系",
      "【API 端点】GET/POST/PATCH/DELETE /admin/agents, GET/POST /admin/agents/:id/clients, GET/POST /admin/agents/:id/rules, DELETE /admin/agents/:agentId/rules/:ruleId, PATCH /admin/agents/:agentId/parent, GET/PUT /admin/agents/:id/settlement-config, POST /admin/agents/:id/settle, GET /admin/agents/settlement-history",
    ],
    usage: "招募新代理商时创建账户，定期查看代理商业绩和佣金结算。",
  },

  // ════════════════════════════════════════════
  //  💰 财务结算
  // ════════════════════════════════════════════

  "admin/finance/dashboard": {
    title: "财务工作台",
    summary: "财务核心指标总览，展示平台收入、支出、利润和资金流水概况。",
    details: [
      "核心指标：当日/当月总收入、总支出、净利润",
      "资金流水：最近的充值、消费、提现、退款等交易记录",
      "利润趋势：按日/周/月查看利润变化曲线",
      "【状态流转】N/A（只读财务聚合面板）",
      "【权限要求】FINANCE_VIEW（bit 13）",
      "【数据校验】无写入操作，查询参数支持时间范围筛选",
      "【关联影响】数据来源于 agent-finance.ts 的 getFinanceDashboard()，聚合 balance_logs/commission_logs/rechargeOrders/withdrawOrders 等多表",
      "【触发条件】页面加载时调用 API，无实时推送",
      "【API 端点】GET /admin/finance/dashboard",
    ],
    usage: "每日关注收入/支出变化，发现异常波动及时排查。",
  },

  "admin/finance/commissions": {
    title: "佣金流水",
    summary: "查看所有代理商的佣金计算明细和发放记录。",
    details: [
      "佣金来源：代理商旗下用户的消费按一定比例计算佣金",
      "每笔佣金记录包含：用户消费、佣金比例、佣金金额、结算状态",
      "支持按代理商、时间范围筛选查询",
      "【状态流转】佣金状态：pending（待结算）→ settled（已结算）→ cancelled（已作废）",
      "【权限要求】FINANCE_COMMISSION（bit 14）查看/结算/作废佣金",
      "【数据校验】批量结算时 ids 数组不能为空；自动结算支持 daysBefore 参数（默认 1 天前）",
      "【关联影响】结算佣金 → commission_logs.status 变为 settled → agent 可用佣金余额增加；作废佣金 → status 变为 cancelled；支持按筛选条件批量结算（settleCommissionsByFilters）",
      "【触发条件】代理商旗下客户每次调用 API 时 billing 引擎生成 commission_logs；支持手动结算或定时自动结算",
      "【API 端点】GET /admin/finance/commissions, GET /admin/finance/commissions/detail, POST /admin/finance/commissions/settle, POST /admin/finance/commissions/settle-by-filters, POST /admin/finance/commissions/auto-settle, POST /admin/finance/commissions/cancel",
    ],
    usage: "代理商对账时查询具体佣金明细，确认结算金额是否正确。",
  },

  "admin/finance/reconciliation": {
    title: "对账报表",
    summary: "平台内部对账工具，交叉核验财务数据的一致性和完整性。",
    details: [
      "对账范围：代理商结算数据与子表数据的交叉校验",
      "完整性检查：可用余额、冻结余额、佣金余额、提现金额等 6 项指标",
      "不一致项会高亮标出，便于定位问题",
      "【状态流转】N/A（报表查询，无状态变更）",
      "【权限要求】RECONCILIATION_VIEW（bit 26）",
      "【数据校验】查询参数：startDate/endDate 可选，granularity 仅允许 day/week/month",
      "【关联影响】对账数据来自 agent-finance.ts 的 getReconciliationReport()，交叉验证 agents 表的缓存字段与子表数据；支持 CSV 导出",
      "【触发条件】财务人员定期执行（每日/每周），也可按需查询代理商财务完整性（agent-integrity）",
      "【API 端点】GET /admin/finance/reconciliation, GET /admin/finance/reconciliation/export, GET /admin/finance/agent-integrity",
    ],
    usage: "财务人员定期执行对账（如每日/每周），确保账实相符。",
  },

  "admin/finance/code-cost": {
    title: "成本看板",
    summary: "按代码/活动维度的成本分析面板，跟踪各活动的预算执行率。",
    details: [
      "活动成本：每个营销活动或代码项目的成本消耗",
      "预算跟踪：预算额度 vs 已消耗 vs 剩余可用的对比",
      "超额预警：接近或超过预算的活动自动标红",
      "【状态流转】N/A（成本分析面板）",
      "【权限要求】FINANCE_VIEW（bit 13）",
      "【数据校验】查询参数支持时间范围和活动筛选",
      "【关联影响】数据来源于 finance_cost_records 和 redemption_logs，跟踪兑换码活动的成本消耗",
      "【触发条件】活动进行中实时更新成本数据",
      "【API 端点】GET /admin/finance/codes/reports/cost（成本报告）",
    ],
    usage: "运营活动期间关注成本消耗，避免超预算。",
  },

  "admin/finance/agent-cost": {
    title: "Agent 成本",
    summary: "按代理商维度的成本明细，查看每个代理商的成本构成。",
    details: [
      "按代理商汇总：成本 Input/Output 的详细数据",
      "支持按时间范围筛选",
      "【状态流转】N/A（只读成本分析面板）",
      "【权限要求】FINANCE_VIEW（bit 13）",
      "【数据校验】查询参数按 agentId + 时间范围筛选",
      "【关联影响】数据聚合自 commission_logs + call_logs 的代理商成本视图",
      "【触发条件】代理商代理客户的每次 API 调用产生成本记录",
      "【API 端点】GET /admin/finance/agent-cost（代理商用成本聚合）",
    ],
    usage: "分析各个代理商的成本结构，优化利润空间。",
  },

  "admin/finance/admin-cost": {
    title: "Admin 成本",
    summary: "按管理员维度的成本明细，查看运营管理的成本消耗。",
    details: [
      "按管理员/操作维度汇总成本数据",
      "支持按时间范围、活动等维度筛选",
      "【状态流转】N/A（只读分析面板）",
      "【权限要求】FINANCE_VIEW（bit 13）",
      "【数据校验】查询参数按操作人和时间范围筛选",
      "【关联影响】数据聚合自活动运营产生的成本记录",
      "【触发条件】管理员执行的营销活动操作产生成本记录",
      "【API 端点】GET /admin/finance/admin-cost（按管理员维度成本）",
    ],
    usage: "运营人员查看自己管理的活动成本情况。",
  },

  "admin/finance/settlement": {
    title: "结算对账",
    summary: "代理商的定期结算管理，生成结算单并进行财务确认。",
    details: [
      "结算周期：按设定周期（如月度）生成结算单",
      "锁定功能：确认后的结算单可锁定，防止数据被修改",
      "CSV 导出：支持导出结算明细为 CSV 文件",
      "资金流水行内展开：可直接查看结算期间的每一笔资金变动",
      "【状态流转】结算单：draft → locked（确认后锁定）",
      "【权限要求】AGENT_LIST（bit 22）查看结算配置和历史、AGENT_MANAGE（bit 23）更新结算周期、FINANCE_COMMISSION（bit 14）手动结算",
      "【数据校验】settlementCycle 必填；手动结算需 agentId 有效",
      "【关联影响】手动结算 API → 调用 settleAgentManually() → 生成结算单，锁定期间资金变动",
      "【触发条件】按设定结算周期自动生成或手动触发结算",
      "【API 端点】GET /admin/agents/:id/settlement-config, PUT /admin/agents/:id/settlement-config, POST /admin/agents/:id/settle, GET /admin/agents/settlement-history",
    ],
    usage: "每月结算日操作：生成结算单 → 审核 → 锁定 → 导出。",
  },

  "admin/finance/profit-analysis": {
    title: "利润分析",
    summary: "分析平台的整体利润构成，按模型、供应商、用户等维度拆解利润。",
    details: [
      "利润 = 售价 - 成本，按不同维度拆解分析",
      "支持按模型查看单品利润率",
      "支持按供应商对比采购成本效率",
      "【状态流转】N/A（只读分析面板）",
      "【权限要求】FINANCE_VIEW（bit 13）",
      "【数据校验】查询参数按时间范围和维度筛选",
      "【关联影响】数据来源于 profit-service.ts，按 call_logs 的 (sellPrice - costPrice) * tokens 计算利润",
      "【触发条件】页面加载时聚合计算，无实时推送",
      "【API 端点】GET /admin/profit（利润分析聚合接口）",
    ],
    usage: "定期分析利润结构，识别亏损模型或高利润模型，指导定价策略。",
  },

  "admin/finance/prices": {
    title: "价格管理",
    summary: "管理所有 AI 模型的成本价和销售价，控制平台的利润空间。",
    details: [
      "成本价：从供应商采购的单价（通常是每千 Token 的美元价格）",
      "售价：向用户收取的单价，分为 Input 和 Output 两个价格",
      "实际倍率 = 售价 / 成本，每行显示 Input/Output 两个倍率",
      "全局定价倍率：新增模型时，系统自动按 成本 * 全局倍率 生成默认售价",
      "倍率 < 1x 标红警示（售价低于成本，即亏损）",
      "【状态流转】N/A（价格配置页，修改即时生效）",
      "【权限要求】MODEL_MANAGE（bit 12）",
      "【数据校验】价格精度 DECIMAL(18,6)，截断不四舍五入；Input/Output 价格独立设置",
      "【关联影响】售价变更影响 billing charge() 公式：扣费 = (prompt_tokens * sellPriceInput + completion_tokens * sellPriceOutput) * pricingMultiplier * discountRate；全局定价倍率变更自动应用到新模型",
      "【触发条件】供应商调价后需要更新成本价；利润调整时修改售价或全局倍率",
      "【API 端点】GET /admin/prices, PATCH /admin/prices（批量更新价格）",
    ],
    usage: "供应商调价后→更新成本价；需要调整利润时→改售价或全局倍率；关注亏损模型（倍率<1）",
  },

  "admin/finance/invoices": {
    title: "发票审核",
    summary: "审核用户提交的发票申请，处理开票请求。",
    details: [
      "用户申请开票 → 管理员审核 → 实际开票 → 标记完成",
      "发票金额需在用户已消费/充值范围内",
      "【状态流转】pending → approved（审核通过）→ issued（已开票）；alternative: pending → rejected（拒绝，须填写拒绝原因）",
      "【权限要求】FINANCE_VIEW（bit 13）查看/审核/开票/拒绝",
      "【数据校验】approve 时验证发票金额 ≤ 累计已审核充值总额；reject 时 reason 不能为空；issue 时 invoiceNo 不能为空",
      "【关联影响】approve → invoice-service.ts 更新状态并通知用户；issue → 记录发票号码和文件 URL；所有操作记录 auditLogs",
      "【触发条件】用户提交发票申请后进入审核队列",
      "【API 端点】GET /admin/finance/invoices, GET /admin/finance/invoices/export, GET /admin/finance/invoices/:id, POST /:id/approve, POST /:id/reject, POST /:id/issue",
    ],
    usage: "收到开票申请后审核信息准确性，确认后开具发票并更新状态。",
  },

  "admin/finance/refunds": {
    title: "退款审核",
    summary: "处理用户提交的退款申请，审核后退还对应金额到用户余额。",
    details: [
      "退款原因：调用异常、充值错误、服务不满意等",
      "退款流程：用户提交 → 管理员审核 → 确认退款 → 余额自动返还",
      "退款金额会记录到用户的资金流水",
      "【状态流转】pending → approved（审核通过，余额自动返还）→ rejected（拒绝，须填写原因）",
      "【权限要求】FINANCE_VIEW（bit 13）查看/审核/拒绝",
      "【数据校验】approve 时验证 amount ≤ 用户余额（扣除所有已消费后）；reject 时 reason 不能为空",
      "【关联影响】approve → refund-service.ts 调 balance_logs 增加用户余额，同时调整 commission_logs（已产生的佣金需要回退）",
      "【触发条件】用户在前端提交退款申请后，管理员在后台看到",
      "【API 端点】GET /admin/finance/refunds, GET /admin/finance/refunds/:id, POST /:id/approve, POST /:id/reject",
    ],
    usage: "用户提交退款申请后审核原因，合理则确认退款。",
  },

  "admin/withdraws": {
    title: "提现管理",
    summary: "审核代理商提交的佣金提现申请，确认后发起实际打款。",
    details: [
      "提现流程：代理商申请提现 → 财务初审 → 双审确认 → 实际打款 → 更新状态",
      "双审制度：需两位财务人员审核通过才能完成提现",
      "提现金额需在代理商可用佣金范围内",
      "【状态流转】pending → first_review（初审通过）→ second_review（复审通过）→ paid（已打款）；任意阶段可 reject（拒绝，填写原因）；支持批量审核",
      "【权限要求】FINANCE_WITHDRAW（bit 15）查看/初审/复审/打款/批量审核",
      "【数据校验】初审/复审需不同 admin 操作（双审制度）；amount ≤ agent available_commission；bankCardNo/bankName 等银行信息必填；复审时可选上传 bankVoucherUrl",
      "【关联影响】paid → agent balance_logs 更新，扣除可用佣金；settlement_locks 防止并发提现竞争条件；reject → 佣金退回代理商可用余额",
      "【触发条件】代理商提交提现申请 → 管理员收到待办；支持 CSV 导出提现数据",
      "【API 端点】GET /admin/withdraws, GET /admin/withdraws/stats, GET /admin/withdraws/export, GET /admin/withdraws/:id, POST /:id/first-review, POST /:id/second-review, POST /:id/mark-paid, POST /admin/withdraws/batch-review",
    ],
    usage: "定期处理代理商提现申请，双人审核确保资金安全。",
  },

  "admin/recharge-orders": {
    title: "充值订单",
    summary: "管理用户所有充值订单，支持线下转账确认和审核。",
    details: [
      "充值方式：线上支付（自动到账）和 线下转账（需人工审核）",
      "线下充值流程：用户提交转账凭证 → 管理员审核 → 确认到账 → 余额增加",
      "审核弹窗显示：银行名称、账号、转账日期、用户备注、凭证截图",
      "【状态流转】pending → paid（线上支付自动到账）| confirmed（线下转账双审通过）；pending → cancelled（管理员取消）；线下转账：pending → first_confirm（初审）→ second_confirm（复审）→ confirmed（余额增加）",
      "【权限要求】FINANCE_RECHARGE（bit 16）查看/确认/取消/初审/复审",
      "【数据校验】线下转账仅对 channel=bank_transfer 订单可用复审流程；初审后必须复审（firstConfirmedBy 存在才允许复审）；复审时金额取订单 amount；取消时仅限 status=pending 的订单",
      "【关联影响】复审确认 → 用户 balance += amount → balance_logs 写入充值记录（type=recharge）→ 生成 voucherNo（凭证号）→ 处理续费佣金（processRenewalCommission）；取消 → status=cancelled，不退款（仅在线支付取消有退款逻辑）",
      "【触发条件】bank transfer review 仅在 channel=bank_transfer 时出现；线上支付（alipay/wechat）自动到账无需审核",
      "【API 端点】GET /admin/recharge-orders, GET /admin/recharge-orders/:id, POST /:id/confirm, POST /:id/cancel, POST /:id/first-confirm, POST /:id/second-confirm",
    ],
    usage: "每日查看线下充值订单，核对银行流水后审核确认。",
  },

  "admin/redemption-codes": {
    title: "兑换码管理",
    summary: "创建和管理充值兑换码，用于活动运营、用户拉新等场景。",
    details: [
      "兑换码可设置：面额、有效期、使用次数限制",
      "支持批量生成兑换码",
      "可查看每个兑换码的使用记录",
      "【状态流转】批次 batch: draft → active → archived；兑换码 code: unused → used（已兑换）| expired（过期）| revoked（管理员撤销）",
      "【权限要求】USER_EDIT（bit 3）批量操作/风控处置",
      "【数据校验】amount > 0；maxUses >= 1；expiresAt > now；count 范围 1-100000；生成兑换码使用 16 位随机字符（排除 0/O/1/I/L 等易混淆字符）",
      "【关联影响】code redeemed → 用户 balance 增加 amount → balance_logs 记录（type=redemption）→ redemption_logs 记录使用详情；fraud detection 检测高频/短时大量兑换等异常模式并生成 redemption_fraud_events",
      "【触发条件】运营活动前批量生成兑换码；活动结束后检查使用情况；风控系统自动标记风险行为",
      "【API 端点】POST /redemption/codes/batch（生成批次）, POST /admin/redemption/batch-action（批量启用/禁用/撤销）, GET /admin/redemption/export, POST /admin/redemption/risk-action（风控处置）, GET /admin/redemption/audit-logs",
    ],
    usage: "运营活动前批量生成兑换码，活动结束后检查使用情况。",
  },

  // ════════════════════════════════════════════
  //  🛡️ 安全风控
  // ════════════════════════════════════════════

  "admin/security": {
    title: "安全总览",
    summary: "安全态势总览，展示当前安全事件、风险分布和封禁统计数据。",
    details: [
      "关键指标：未处理高危事件数、激活熔断数、封禁 IP 数、封禁用户数",
      "风险分布：按风险等级（low/medium/high/critical）展示事件占比",
      "趋势图表：近 7 天安全事件数量的变化趋势",
      "最近事件：最新未处理的安全事件列表，可快速跳转处理",
      "【状态流转】N/A（只读安全仪表盘面板）",
      "【权限要求】SECURITY_VIEW（bit 19）",
      "【数据校验】无写入操作，数据从 securityEvents 表 + Redis bans 聚合",
      "【关联影响】统计数据包含 securityEvents（DB）+ Redis 封禁 keys（risk:ban:ip:*, risk:ban:user:*）+ 熔断器状态（circuit-breaker）三源聚合",
      "【触发条件】页面加载时并行查询 DB + Redis 实时数据",
      "【API 端点】GET /admin/security/dashboard",
    ],
    usage: "每日查看安全态势，重点处理高危和严重事件。",
  },

  "admin/security/events": {
    title: "安全事件",
    summary: "所有安全事件的完整列表和管理入口，支持筛选、确认和处理。",
    details: [
      "事件类型：brute_force（暴力破解）、unusual_location（异地登录）、new_device（新设备）、ip_banned（IP 封禁）、user_banned（用户封禁）等",
      "风险等级：low / medium / high / critical",
      "操作：标记已处理、标记为误报、查看事件详情",
      "【状态流转】unacknowledged → acknowledged（标记已确认，记录 acknowledgedBy + acknowledgedAt）",
      "【权限要求】SECURITY_VIEW（bit 19）查看列表、SECURITY_ACTION（bit 20）确认事件/批量确认",
      "【数据校验】批量确认最多 200 条/次（ids.length <= 200）；仅未确认事件可被确认（acknowledged=false 过滤）",
      "【关联影响】事件由 login-security.ts 自动触发记录（brute_force: 连续 3 次登录失败、unusual_location: 登录 IP 地理跳变、new_device: 新 User-Agent 登录）；IP bans 自动应用于 5 次失败/分钟",
      "【触发条件】login-security.ts 在各登录场景自动记录安全事件；安全配置（SECURITY_EDIT, bit 27）可调整触发阈值",
      "【API 端点】GET /admin/security/events, POST /admin/security/events/:id/ack, POST /admin/security/events/batch-ack",
    ],
    usage: "安全告警时进入查看事件详情，确认是否为真实攻击。",
  },

  "admin/security/config": {
    title: "安全配置",
    summary: "配置平台的安全策略参数，包括登录保护、风控阈值等。",
    details: [
      "登录保护：连续登录失败次数限制、验证码策略",
      "IP 风控：白名单、黑名单配置",
      "其他：密码强度要求、会话过期时间等",
      "【状态流转】N/A（配置页，修改即时生效，无需重启）",
      "【权限要求】SECURITY_VIEW（bit 19）查看配置列表/详情/历史、SECURITY_ACTION（bit 20）更新配置",
      "【数据校验】value 不能为 undefined/null；key 必须存在于 login_security_configs 表中",
      "【关联影响】配置更新后 → clearSecurityConfigCache() 清除缓存立即生效；所有变更记录 auditLogs（targetType=security_config）支持历史追溯",
      "【触发条件】初期按推荐值配置，后续根据攻击情况调整阈值",
      "【API 端点】GET /admin/security/config, GET /admin/security/config/:key, PATCH /admin/security/config/:key, GET /admin/security/config/history",
    ],
    usage: "初期按推荐值配置，后续根据实际攻击情况调整阈值。",
  },

  "admin/security/bans": {
    title: "封禁管理",
    summary: "管理被封禁的 IP 地址和用户账号，支持手动封禁/解封。",
    details: [
      "封禁类型：IP 封禁（阻止该 IP 访问 API）和 用户封禁（阻止该账户使用）",
      "封禁来源：自动触发（安全策略）和 手动操作（管理员封禁）",
      "支持设置封禁时长或永久封禁",
      "【状态流转】封禁：IP ban（duration 1-1440min，默认 60min）→ auto-expire（TTL 到期自动解封）；User ban（duration 1-43200min，默认 24h/1440min）→ auto-expire；手动解封：POST /unban/ip 或 /unban/user",
      "【权限要求】SECURITY_VIEW（bit 19）查看封禁列表、SECURITY_ACTION（bit 20）封禁/解封",
      "【数据校验】封禁 IP 时 IP 格式需合法（非空）；封禁用户时 userId 必须存在；duration minutes 在合法范围内（IP: 1-1440, User: 1-43200）",
      "【关联影响】banned IP → 所有 API 调用返回 403；banned user → 登录被拦截；封禁/解封操作 → 记录 security_events + auditLogs；封禁数据存储在 Redis（risk:ban:ip:* / risk:ban:user:*）含 TTL 自动过期",
      "【触发条件】自动触发：brute_force 检测到高频攻击；手动触发：管理员在安全事件中手动封禁",
      "【API 端点】GET /admin/security/bans, POST /admin/security/bans/ip, POST /admin/security/bans/user, POST /admin/security/unban/ip, POST /admin/security/unban/user",
    ],
    usage: "发现恶意请求/IP 时手动封禁，定期检查已封禁名单是否可解封。",
  },

  "admin/security/alerts": {
    title: "告警通知",
    summary: "配置安全通知规则，设置当异常事件发生时通知管理员。",
    details: [
      "通知渠道：支持平台内通知、邮件通知等",
      "通知条件：可按事件类型、风险等级设置哪些事件需要通知",
      "【状态流转】N/A（通知配置页）",
      "【权限要求】SECURITY_VIEW（bit 19）查看、SECURITY_ACTION（bit 20）配置",
      "【数据校验】通知规则配置存储在 notification-service.ts 管理中",
      "【关联影响】配置变更后告警通知即时生效；通知通过 email-service.ts 发送邮件，通过 user_notifications 表发送站内通知",
      "【触发条件】安全事件发生时根据告警规则匹配，符合条件的发送通知",
      "【API 端点】GET/PATCH /admin/security/alerts（告警配置接口）",
    ],
    usage: "上线初期开启所有高危事件通知，稳定后按需调整。",
  },

  // ════════════════════════════════════════════
  //  ⚙️ 运维配置
  // ════════════════════════════════════════════

  "admin/configs": {
    title: "系统配置",
    summary: "管理平台的核心系统参数和功能开关。",
    details: [
      "配置项包括：站名（site_name）、联系邮箱、注册开关、维护模式（maintenance_mode）、定价倍率（pricing_multiplier）、企业折扣率（enterprise_discount_rate）、JWT 密钥等",
      "每个配置项均有对应的 key-value 键值，按 config group 分组管理",
      "修改配置后即时生效，无需重启服务",
      "【状态流转】N/A（配置即时更新，无生命周期状态）",
      "【权限要求】CONFIG_VIEW（bit 17）查看配置列表、CONFIG_EDIT（bit 18）编辑配置/轮换密钥/安全审计",
      "【数据校验】PATCH 时 value 不能为 undefined/null；key 必须在 system_configs 表中存在（否则 404）；密钥轮换 generate 32 字节随机 hex 字符串",
      "【关联影响】pricing_multiplier 影响 billing charge() 公式全局倍率；maintenance_mode=true 时拦截所有非管理员 API；rate_limit_* 配置变更自动清除限流缓存；密钥轮换（rotate-key）生成新值并记录 auditLogs；敏感密钥审计列表：pay_sign_key/smtp_*/jwt_* 等",
      "【触发条件】业务上线前配置基本参数；运营中按需修改",
      "【API 端点】GET /admin/configs, PATCH /admin/configs/:key, POST /admin/configs/rotate-key/:keyName, GET /admin/configs/security-audit",
    ],
    usage: "业务上线前配置基本参数，日常修改如维护公告等。",
  },

  "admin/rate-limits": {
    title: "TPM/RPM 限流管理",
    summary: "管理每个模型的调用限流策略，防止单个用户或模型过度消耗资源。",
    details: [
      "限流维度：TPM（每分钟 Token 数）、RPM（每分钟请求数）",
      "支持按 API Key、用户级别设置不同的限流规则",
      "可设置自定义有效期（临时调整限流）",
      "被限流的请求会记录到调用日志，并标注 rate_limited 状态",
      "【状态流转】N/A（限流规则即时生效）",
      "【权限要求】CONFIG_VIEW（bit 17）查看规则/覆盖列表、USER_LIST（bit 1）查看覆盖、USER_EDIT（bit 3）设置/修改/删除覆盖、CONFIG_EDIT（bit 18）批量更新全局规则、LOG_VIEW（bit 24）查看限流命中事件",
      "【数据校验】RPM/TPM 值必须为正整数；at least RPM or TPM 之一必填；覆盖设置时 userId 必须存在",
      "【关联影响】限流使用 Redis 滑窗（60s 窗口）：rl:rpm:user:* / rl:tpm:user:* / rl:rpm:global:* 等；用户级覆盖（overrides）优先于全局规则；被限流请求 status='rate_limited' 记录在 call_logs；waterLevels 展示实时 Redis 计数器水位",
      "【触发条件】每次 API 代理调用前 rate-limit 中间件检查；水位超限返回 429 Too Many Requests",
      "【API 端点】GET /admin/rate-limits/rules, PATCH /admin/rate-limits/rules, GET /admin/rate-limits/overrides, POST /admin/rate-limits/overrides, PATCH /admin/rate-limits/overrides/:id, DELETE /admin/rate-limits/overrides/:id, GET /admin/rate-limits/hits",
    ],
    usage: "某模型被高频调用导致响应变慢时，适当调低限流阈值。",
  },

  "admin/email-templates": {
    title: "邮件模板",
    summary: "管理平台发送的各类通知邮件模板，包括注册验证、密码重置等。",
    details: [
      "模板变量：{{username}}、{{code}}、{{link}} 等动态参数",
      "支持编辑 HTML 模板内容（bodyHtmlZh/bodyHtmlEn）",
      "每条模板对应一种邮件类型（验证码、通知、营销等），支持中英文双语",
      "【状态流转】N/A（模板编辑即时生效）",
      "【权限要求】CONFIG_VIEW（bit 17）查看模板列表/详情、CONFIG_EDIT（bit 18）更新模板",
      "【数据校验】模板 name 作为唯一标识（URL param）；更新时至少提供一个字段（subjectZh/subjectEn/bodyHtmlZh/bodyHtmlEn 之一）",
      "【关联影响】模板变更后即时生效，新发送的邮件使用新模板；所有编辑操作记录 auditLogs（targetType=email_template）",
      "【触发条件】邮件发送时通过 email-service.ts 读取对应模板并填充变量",
      "【API 端点】GET /admin/email-templates, GET /admin/email-templates/:name, PUT /admin/email-templates/:name",
    ],
    usage: "需要修改邮件文案或样式时在此编辑。",
  },

  "admin/page-contents": {
    title: "内容管理",
    summary: "管理平台前端展示的静态页面内容，如帮助中心、隐私政策、服务条款等。",
    details: [
      "支持编辑 Markdown 格式的页面内容",
      "发布后前端页面即时更新",
      "【状态流转】page status: draft（草稿）↔ published（已发布）",
      "【权限要求】CONFIG_VIEW（bit 17）查看页面列表",
      "【数据校验】slug 唯一标识页面；内容以 Markdown 格式存储（contentMarkdownZh/contentMarkdownEn）",
      "【关联影响】发布后前端通过 slug 拉取内容渲染页面（帮助中心、隐私政策、服务条款等）",
      "【触发条件】需要更新帮助文档或修改服务条款时在此操作",
      "【API 端点】GET /admin/page-contents, GET/POST/PATCH /admin/page-contents/:slug",
    ],
    usage: "需要更新帮助文档或修改服务条款时在此操作。",
  },

  // ════════════════════════════════════════════
  //  📋 审计合规
  // ════════════════════════════════════════════

  "admin/audit-logs": {
    title: "审计日志",
    summary: "记录所有管理员在后台的敏感操作，满足合规审计要求。",
    details: [
      "记录内容：谁（管理员 operatorId）、什么时间（createdAt）、执行了什么操作（action）、操作前后的数据变化（before/after JSON）",
      "审计范围：用户管理（user_create/update/disable）、权限变更（role_change）、财务操作（withdraw_*/recharge_*/order_cancel）、系统配置修改（config_update）、厂商/模型管理（vendor_*/model_*）等",
      "日志不可删除、不可篡改",
      "【状态流转】N/A（日志只追加，不可修改或删除）",
      "【权限要求】AUDIT_VIEW（bit 21）查看列表/详情/导出 CSV",
      "【数据校验】查询参数支持 keyword/action/targetType/targetId/operatorId/startDate/endDate 多维度筛选",
      "【关联影响】每条审计日志含 operatorId（关联 users 表）和 targetType+targetId（多态关联 user/vendor/model/config/order/agent 等），支持批量解析目标名称",
      "【触发条件】各管理操作自动写入 auditLogs 表（在 transaction 中同步完成）",
      "【API 端点】GET /admin/audit-logs, GET /admin/audit-logs/:id（含 before/after diff）, GET /admin/audit-logs/export",
    ],
    usage: "安全事件发生时追溯管理员操作记录，或定期合规检查。",
  },

  "admin/operation-logs": {
    title: "操作日志",
    summary: "记录用户在前端执行的关键操作，用于用户行为分析。",
    details: [
      "记录内容：用户的操作行为（登录、注册、创建 API Key、充值、兑换、提现、申请发票等）",
      "与审计日志区别：操作日志记录用户端行为（operationLogs），审计日志记录管理端操作（auditLogs）",
      "【状态流转】N/A（日志只追加）",
      "【权限要求】AUDIT_VIEW（bit 21）查看列表/导出 CSV",
      "【数据校验】查询参数支持 keyword/category/action/userId/status/startDate/endDate 多维度筛选",
      "【关联影响】category 分类：auth（认证）、api_key（密钥）、finance（财务）、profile（账户）、agent（代理）、system（系统）；含 status 字段标识操作结果（success/failed）",
      "【触发条件】用户在各前端操作时由 operation-log.ts 服务写入",
      "【API 端点】GET /admin/operation-logs, GET /admin/operation-logs/export",
    ],
    usage: "排查用户问题时查看其操作记录，了解问题发生时的上下文。",
  },

  "admin/logs": {
    title: "调用日志",
    summary: "查看全平台所有的 API 调用记录，包括请求参数、响应结果和耗时。",
    details: [
      "每个日志条目包含：用户、模型、请求 Token 数、响应 Token 数、耗时、状态码",
      "支持按用户、模型、时间范围、状态等条件筛选",
      "异常调用（超时/失败/限流）高亮显示",
      "【状态流转】status: success / failed / rate_limited / timeout（仅记录，不可变更）",
      "【权限要求】LOG_VIEW（bit 24）查看调用日志",
      "【数据校验】查询支持 keyword（用户邮箱搜索）、modelName（模糊匹配）、status、日期范围、游标分页（cursor-based）",
      "【关联影响】call_logs 为所有聚合统计的原始数据源（dashboard/stats/profit/cost）；rate_limited 状态的记录可查询限流命中事件",
      "【触发条件】每次 /v1/chat/completions 代理调用完成后写入 call_logs",
      "【API 端点】GET /admin/logs（支持 keyword/modelName/status/startDate/endDate/cursor 筛选）",
    ],
    usage: "用户反馈调用异常时，搜索其调用记录排查问题。",
  },

  "admin/announcements": {
    title: "全站公告",
    summary: "管理向全平台用户发布的系统公告（停服通知、更新说明等）。",
    details: [
      "公告类型：maintenance（维护）、update（更新）、notice（通知）",
      "支持设置公告优先级（priority 整数，越大越优先）和有效时间",
      "发布后显示在用户端公告区域",
      "【状态流转】公告 status: true（已发布/draft 创建即发布）↔ false（下架/unpublished）；下架 → 上架时重新广播站内信",
      "【权限要求】CONFIG_VIEW（bit 17）查看/创建/编辑/删除公告",
      "【数据校验】创建时 title + content 不能为空（trim 后检查）；编辑时限制白名单字段（title/content/type/priority/status）",
      "【关联影响】创建公告 → 自动广播站内信到所有 active 用户（user_notifications 表，type=system_announcement，分块 500 条写入）；下架后重新上架时再次广播",
      "【触发条件】计划停服前发布维护公告；新功能上线时发布更新说明",
      "【API 端点】GET /admin/announcements, POST /admin/announcements, PATCH /admin/announcements/:id, DELETE /admin/announcements/:id",
    ],
    usage: "计划停服前发布维护公告，新功能上线时发布更新说明。",
  },

  "admin/campaigns": {
    title: "营销活动",
    summary: "创建和管理平台营销活动，如充值赠送、新用户福利等。",
    details: [
      "活动类型：充值赠送、消费返利、新用户福利等",
      "可设置活动时间范围、参与条件、奖励规则",
      "可查看活动参与情况和奖励发放记录",
      "【状态流转】draft（草稿，可编辑字段）→ active（进行中）→ ended（已结束）→ archived（已归档）；转换规则：draft → active → ended → archived；仅 draft 状态可编辑；仅 active 状态可分配兑换码",
      "【权限要求】USER_EDIT（bit 3）查看/创建/编辑/状态变更/分配兑换码/生成兑换码/查看效果统计",
      "【数据校验】创建时 name 必填；状态变更遵循 ALLOWED_STATUS_TRANSITIONS；分配兑换码时 count 范围 1-100000、token_amount > 0、仅 active 状态活动可操作",
      "【关联影响】活动分配兑换码 → 创建 redemption_batches + redemption_codes → 更新 campaign_codes（allocatedCount/usedCount）；活动佣金规则配置 → commission_rules（ruleType=activity）；效果统计聚合：兑换码使用率 + 佣金产生量和金额",
      "【触发条件】节假日或推广期创建限时活动；活动 end_at 到期后状态需手动变更",
      "【API 端点】GET/POST/PATCH /admin/campaigns, PATCH /admin/campaigns/:id/status, POST /admin/campaigns/:id/allocations（分配兑换码配额）, GET /admin/campaigns/:id/allocations（查看分配进度）, POST /admin/campaigns/:id/generate-codes（生成兑换码）, POST /admin/campaigns/:id/commission-rule（活动佣金规则）, GET /admin/campaigns/:id/stats（活动统计数据）",
    ],
    usage: "节假日或推广期创建限时活动，活动结束后复盘效果。",
  },

  "admin/campaigns/detail": {
    title: "活动详情",
    summary: "查看指定营销活动的完整详情，包括预算、兑换码、效果统计和代理分配。",
    details: [
      "基本信息：活动名称、预算、时间跨度、状态",
      "效果统计：参与人数、兑换量、成本消耗等指标",
      "兑换码管理：可在此页面直接为该活动生成/管理兑换码",
      "代理分配：查看和管理参与活动的代理商",
      "【状态流转】同 campaigns（draft → active → ended → archived）",
      "【权限要求】USER_EDIT（bit 3）查看详情/分配/生成兑换码/配置佣金、AGENT_MANAGE（bit 23）配置活动佣金规则",
      "【数据校验】同 campaigns，详情页加载时验证 campaignId 有效性",
      "【关联影响】详情聚合展示：campaigns 基本信息 + campaign_codes 分配进度（含代理商名称关联）+ commission_logs 活动佣金统计（total/pending/settled 金额和笔数）+ 兑换码使用率",
      "【触发条件】从活动列表点击进入详情页",
      "【API 端点】GET /admin/campaigns/:id, POST /admin/campaigns/:id/allocations, POST /admin/campaigns/:id/generate-codes, POST /admin/campaigns/:id/commission-rule, GET /admin/campaigns/:id/stats",
    ],
    usage: "活动进行中实时跟踪预算消耗和兑换进度。",
  },

  "admin/agents/detail": {
    title: "代理商详情",
    summary: "查看指定代理商的完整资料，包括客户关系、佣金配置和资金流水。",
    details: [
      "基本信息：代理商名称、联系方式、佣金比例、状态",
      "客户列表：该代理商绑定的全部下游客户及消费统计",
      "佣金配置：Input/Output 佣金比例、结算周期",
      "资金流水：提现记录、佣金结算单、余额变动",
      "上级代理：设置代理商的层级关系",
      "【状态流转】agent status: active ↔ disabled（PATCH /admin/agents/:id）；佣金规则：每次 POST 新建一条（旧规则 immutable 保留历史）",
      "【权限要求】AGENT_LIST（bit 22）查看详情/客户/规则/结算配置、AGENT_MANAGE（bit 23）编辑状态/绑定客户/佣金规则/上级代理",
      "【数据校验】佣金规则通过 upsertCommissionRuleSchema 校验；上级代理设置通过 setAgentParentSchema 校验",
      "【关联影响】佣金规则 POST（upsertCommissionRule）总是创建新规则，旧规则保留不可变（审计追溯）；设置 parentAgentId 形成代理商层级链；客户绑定（POST /admin/agents/:id/clients）创建 agent_customer_consumption，后续 call_logs 产生 commission_logs",
      "【触发条件】从代理商列表点击进入详情页",
      "【API 端点】GET/PATCH /admin/agents/:id, GET/POST /admin/agents/:id/rules, DELETE /admin/agents/:agentId/rules/:ruleId, PATCH /admin/agents/:agentId/parent, GET/POST /admin/agents/:id/clients, GET/PUT /admin/agents/:id/settlement-config, POST /admin/agents/:id/settle",
    ],
    usage: "代理商入驻后查看其基本资料，日常管理佣金和客户关系。",
  },

  "admin/agents/clients": {
    title: "代理商客户管理",
    summary: "管理指定代理商的下游客户，包括绑定和解绑操作。",
    details: [
      "客户列表：已绑定客户的基本信息和消费摘要",
      "绑定新客户：按邮箱或用户 ID 搜索并绑定到当前代理商",
      "解绑操作：解除客户与代理商的关联关系",
      "【状态流转】客户绑定关系：active（已绑定）→ unbound（解除绑定，保留历史记录）",
      "【权限要求】AGENT_LIST（bit 22）查看客户列表、AGENT_MANAGE（bit 23）绑定/解绑客户",
      "【数据校验】绑定客户时通过 bindAgentClientSchema 校验；agentId + clientUserId 联合唯一约束",
      "【关联影响】绑定 → 创建 agent_customer_consumption 行，后续该客户 call_logs 生成 commission_logs 归属于对应代理商；解绑 → 移除绑定关系但保留历史消费和佣金记录（不可逆）",
      "【触发条件】代理商发展新客户时管理员在此页面绑定；客户转出时在此解绑",
      "【API 端点】GET /admin/agents/:agentId/clients, POST /admin/agents/:agentId/clients（bind）, DELETE /admin/agents/:agentId/clients/:userId（unbind）",
    ],
    usage: "代理商发展新客户后在此页面绑定，客户转出时解绑。",
  },

  // ════════════════════════════════════════════
  //  🤖 资源管理（续）
  // ════════════════════════════════════════════

  "admin/vendor-key-groups": {
    title: "Key 分组管理",
    summary: "管理供应商 API Key 的资源分组，支持策略配置、Key 级价格覆盖和批量连通性测试。",
    details: [
      "分组策略：weight（权重轮询）、priority（优先级优先）、fallback（故障转移）三种路由策略",
      "Key 管理：每个分组下的 API Key 列表，支持查看状态（活跃/宕机/禁用）、权重、优先级",
      "价格覆盖：可为单个 Key 单独设置 Input/Output 售价和成本价",
      "连通性测试：支持对分组下的 Key 进行批量连通性测试",
      "通道管理：查看 Key 关联的通道（Channel Ref），了解哪些模型使用了该 Key",
      "【状态流转】group status: true（启用）↔ false（禁用）；Key status: true（活跃）↔ false（禁用）；连通性测试不修改状态，仅记录测试结果",
      "【权限要求】MODEL_MANAGE（bit 12）管理分组/Key",
      "【数据校验】创建分组时 vendorId + name 必填，name 在同一供应商下唯一；Key 创建时 apiKey 必填（AES-256-GCM 加密存储）；售卖价按 DECIMAL(18,6) 精度",
      "【关联影响】分组启用状态变更影响路由引擎的 Key 选择范围；Key 禁用后通过该 Key 的调用返回 401；Priority 策略的分组中 Key 的 priority 字段影响调度顺序",
      "【触发条件】供应商接入后需在分组中配置 Key 才能实际使用",
      "【API 端点】GET /admin/vendor-key-groups, POST /admin/vendor-key-groups, GET /admin/vendor-key-groups/:groupId/keys, POST /admin/vendor-key-groups/:groupId/keys, PATCH/DELETE /admin/vendor-key-groups/:id, PATCH /admin/vendor-key-groups/:groupId/keys/:keyId, DELETE /admin/vendor-key-groups/:groupId/keys/:keyId, POST /admin/vendor-key-groups/:groupId/test-all, POST /admin/vendor-key-groups/:groupId/keys/:keyId/test, GET /admin/vendor-key-groups/:groupId/channels",
    ],
    usage: "新增供应商 Key 后在此页面创建 Key 分组，配置价格覆盖和路由策略。",
  },

  // ════════════════════════════════════════════
  //  🛡️ 安全风控（续）
  // ════════════════════════════════════════════

  "admin/security/auto-rules": {
    title: "自动处置规则",
    summary: "配置安全事件的自动响应规则，当特定安全事件达到阈值时自动执行封禁/通知等操作。",
    details: [
      "规则要素：事件类型（eventType）、触发阈值（countThreshold + timeWindowSeconds）、执行动作（action）",
      "支持的动作：ban_ip（封禁 IP）、ban_user（封禁用户）、notify（发送通知）",
      "规则状态：可启用/禁用，灵活的规则管理",
      "【状态流转】rule status: true（启用）↔ false（禁用）；规则触发后按 action 类型执行拦截/通知",
      "【权限要求】SECURITY_VIEW（bit 19）查看规则列表、SECURITY_ACTION（bit 20）创建/编辑/删除规则",
      "【数据校验】eventType 必须为合法事件类型（brute_force/unusual_location/new_device 等）；countThreshold ≥ 1（正整数）；timeWindowSeconds ≥ 60；action 必须为 ban_ip/ban_user/notify 之一",
      "【关联影响】自动规则触发时自动执行 ban_ip 或 ban_user，与手动封禁共享同一底层 Redis 封禁存储",
      "【触发条件】安全事件发生时，自动规则引擎按顺序匹配规则，满足条件即执行",
      "【API 端点】GET /admin/security/auto-rules, POST /admin/security/auto-rules, PUT /admin/security/auto-rules/:id, PATCH /admin/security/auto-rules/:id/status, DELETE /admin/security/auto-rules/:id",
    ],
    usage: "上线初期配置暴力破解自动封禁规则，减少人工干预。",
  },

  // ════════════════════════════════════════════
  //  🛠️ 调试工具
  // ════════════════════════════════════════════

  "admin/playground": {
    title: "在线调试",
    summary: "管理员在线测试模型转发连通性，展示链路追踪（_chain）和调试信息。",
    details: [
      "调试模式：请求不计费，可验证模型路由和供应商连通性",
      "链路追踪（_chain）：展示请求经过的路由步骤、供应商选择、熔断状态等",
      "支持 System Prompt 设置，模拟真实调用场景",
      "展示详细的 Usage 统计和响应延迟",
      "【状态流转】N/A（调试工具，无状态变更）",
      "【权限要求】仅管理员（admin/super_admin）可见",
      "【数据校验】model 必填，messages 至少含一条 user 消息",
      "【关联影响】调试请求不计费，不会写入 call_logs",
      "【API 端点】POST /api/v1/playground/chat/completions",
    ],
    usage: "新增供应商或模型后在此测试连通性；排查调用异常时验证请求链路。",
  },

  // ════════════════════════════════════════════
  //  ⚙️ 运维配置（续）
  // ════════════════════════════════════════════

  "admin/site-settings": {
    title: "站点设置",
    summary: "集中管理平台各项系统配置，包括基本设置、邮件配置、安全参数、API 参数和计费配置。",
    details: [
      "基本设置：站点名称、联系邮箱、注册开关、维护模式等",
      "邮件配置：SMTP 服务器、发件人地址、邮件发送参数",
      "安全参数：密码策略、登录保护、会话超时等",
      "API 参数：API 调用限制、超时时间、Token 上限等",
      "计费配置：定价倍率、默认折扣率、企业折扣率等",
      "【状态流转】N/A（配置即时生效，无状态流转）",
      "【权限要求】CONFIG_VIEW（bit 17）查看配置、CONFIG_EDIT（bit 18）编辑配置",
      "【数据校验】各配置项按 key 类型进行格式校验（邮箱、URL、数字范围等）",
      "【关联影响】维护模式影响全站 API 访问；定价倍率影响所有模型的售价计算",
      "【触发条件】系统上线前配置基本参数，日常按需修改",
      "【API 端点】GET /admin/configs, PATCH /admin/configs/:key（通过系统配置 API 管理）",
    ],
    usage: "系统上线前逐项配置基本参数，日常维护时调整邮件和安全策略。",
  },
}

// 自动注册到全局
registerFeatureDescriptions(FEATURE_DESCRIPTIONS)
