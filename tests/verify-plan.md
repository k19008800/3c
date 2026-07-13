# 3cloud (3C) 全链路业务验证计划
## 时间：2026-07-02 00:02 CST

### 验证范围：25个功能模块 × 80+ 业务检查点

---

## 测试数据概览（已就绪）

| 模块 | 数据量 | 说明 |
|------|--------|------|
| 用户 | 28 | 含 super_admin/admin/agent/user/finance_ops/ops/support/auditor |
| API Key | （待查） | SHA-256 哈希存储 |
| 供应商 | 4 | OpenAI/Anthropic/DeepSeek/天翼云 均 active |
| 模型 | 6 | chat 类型 |
| 厂商-模型映射 | 8 | 含定价/权重配置 |
| 代理商 | 3 | 含巨量佣金数据 |
| 代理商客户 | 14 | 客户分配关系 |
| 调用日志 | 246 | 全 success |
| 余额流水 | 14,220 | 完整记账 |
| 佣金流水 | 10,011 | 含已结算/待结算 |
| 充值订单 | 19 | 含在线支付+对公转账 |
| 提现订单 | 10 | 含多状态 |
| 安全事件 | 12 | 多种告警类型 |
| 审计日志 | 116 | 管理员操作记录 |
| 实名审核 | 22 | 待审核/已通过/已驳回 |
| 系统配置 | 35 | 限流/定价/折扣/支付等 |
| 佣金规则 | 6 | 代理分佣规则 |

---

## 验证矩阵

### 模块 1: 系统基础设施 ✅
- [x] GET /health → {"status":"ok"}
- [x] GET /ready → {"status":"ready", checks: {"database":true,"redis":true}}
- [x] PostgreSQL 17 可连接 (49 表)
- [x] Memurai/Redis 可连接
- [x] Web 前端构建通过 (:5175)

### 模块 2: 用户认证 (8 检查点)
- [ ] 2.1 POST /api/v1/auth/register — 注册新用户
- [ ] 2.2 POST /api/v1/auth/login — 管理员登录
- [ ] 2.3 POST /api/v1/auth/login — 普通用户登录
- [ ] 2.4 POST /api/v1/auth/login — 验证码流（失败N次后触发）
- [ ] 2.5 POST /api/v1/auth/refresh — Token 刷新
- [ ] 2.6 GET /api/v1/auth/me — 获取用户信息
- [ ] 2.7 POST /api/v1/auth/change-password — 修改密码
- [ ] 2.8 POST /api/v1/auth/real-name/* — 实名提交流程

### 模块 3: 用户管理（管理员）(8 检查点)
- [ ] 3.1 GET /api/v1/admin/users — 用户列表（含搜索/筛选）
- [ ] 3.2 GET /api/v1/admin/users/:id — 用户详情
- [ ] 3.3 PATCH /api/v1/admin/users/:id — 更新用户
- [ ] 3.4 POST /api/v1/admin/users/:id/disable — 禁用用户
- [ ] 3.5 POST /api/v1/admin/users/:id/enable — 启用用户
- [ ] 3.6 POST /api/v1/admin/users/:id/recharge — 手动调余额
- [ ] 3.7 POST /api/v1/admin/users/:id/change-role — 角色变更
- [ ] 3.8 POST /api/v1/admin/users/impersonate — 模拟登录

### 模块 4: 实名审核 (4 检查点)
- [ ] 4.1 GET /api/v1/admin/reviews — 待审核列表
- [ ] 4.2 POST /api/v1/admin/reviews/:id/approve — 审核通过
- [ ] 4.3 POST /api/v1/admin/reviews/:id/reject — 审核驳回
- [ ] 4.4 GET /api/v1/auth/real-name/status — 状态查询

### 模块 5: API Key 管理 (4 检查点)
- [ ] 5.1 GET /api/v1/keys — Key 列表
- [ ] 5.2 POST /api/v1/keys — 创建 Key
- [ ] 5.3 PUT /api/v1/keys/:id/toggle — 启用/禁用 Key
- [ ] 5.4 DELETE /api/v1/keys/:id — 删除 Key

### 模块 6: 厂商管理 (4 检查点)
- [ ] 6.1 GET /api/v1/admin/vendors — 厂商列表
- [ ] 6.2 POST /api/v1/admin/vendors — 新增厂商
- [ ] 6.3 PUT /api/v1/admin/vendors/:id — 更新厂商
- [ ] 6.4 厂商健康状态检查

### 模块 7: 模型管理 (4 检查点)
- [ ] 7.1 GET /api/v1/admin/models — 模型列表
- [ ] 7.2 POST /api/v1/admin/models — 新增模型
- [ ] 7.3 GET /api/v1/models — 用户端模型列表
- [ ] 7.4 模型状态切换

### 模块 8: 厂商-模型映射 (3 检查点)
- [ ] 8.1 GET /api/v1/admin/vendor-models — 映射列表
- [ ] 8.2 POST /api/v1/admin/vendor-models — 新建映射
- [ ] 8.3 PUT /api/v1/admin/vendor-models/:id — 更新定价/权重

### 模块 9: 充值系统 (4 检查点)
- [ ] 9.1 POST /api/v1/billing/recharge — 创建充值订单
- [ ] 9.2 GET /api/v1/admin/finance/recharge-orders — 充值订单列表
- [ ] 9.3 POST /api/v1/admin/finance/recharge-orders/:id — 审核入账
- [ ] 9.4 GET /api/v1/billing/balance — 余额查询

### 模块 10: 代理商体系 (7 检查点)
- [ ] 10.1 GET /api/v1/agent/dashboard — 代理商面板
- [ ] 10.2 GET /api/v1/agent/clients — 客户列表
- [ ] 10.3 GET /api/v1/agent/commissions — 佣金历史
- [ ] 10.4 POST /api/v1/agent/withdraw — 提现申请
- [ ] 10.5 GET /api/v1/agent/withdraws — 提现记录
- [ ] 10.6 GET /api/v1/admin/agents — 管理端代理商列表
- [ ] 10.7 POST /api/v1/admin/agents — 创建代理商

### 模块 11: 财务管理 (4 检查点)
- [ ] 11.1 GET /api/v1/admin/finance/balance-logs — 余额流水
- [ ] 11.2 GET /api/v1/admin/finance/dashboard — 财务面板
- [ ] 11.3 GET /api/v1/admin/finance/withdraw-orders — 提现审核
- [ ] 11.4 POST /api/v1/admin/finance/withdraw-orders/:id — 审核提现

### 模块 12: 安全事件 (4 检查点)
- [ ] 12.1 GET /api/v1/admin/security/events — 安全事件列表
- [ ] 12.2 GET /api/v1/admin/security/bans — 封禁列表
- [ ] 12.3 GET /api/v1/admin/security/config — 安全配置
- [ ] 12.4 GET /api/v1/admin/security/dashboard — 安全面板

### 模块 13: 审计日志 (2 检查点)
- [ ] 13.1 GET /api/v1/admin/audit-logs — 审计日志列表
- [ ] 13.2 审计日志筛选（操作人/操作类型/时间范围）

### 模块 14: 仪表盘 (4 检查点)
- [ ] 14.1 GET /api/v1/admin/dashboard — 管理后台面板
- [ ] 14.2 KPI 卡片数据（用户数/调用量/收入/健康状态）
- [ ] 14.3 趋势数据
- [ ] 14.4 待处理列表

### 模块 15: 调用日志 (3 检查点)
- [ ] 15.1 GET /api/v1/logs/calls — 用户端调用日志
- [ ] 15.2 GET /api/v1/admin/logs/calls — 管理端调用日志
- [ ] 15.3 日志筛选（时间/模型/状态/用户）

### 模块 16: Token 代理 (3 检查点)
- [ ] 16.1 GET /v1/models — 模型列表（OpenAI 兼容）
- [ ] 16.2 POST /v1/chat/completions — Chat 补全
- [ ] 16.3 限流引擎验证

### 模块 17: 系统配置 (3 检查点)
- [ ] 17.1 GET /api/v1/admin/system/configs — 配置列表
- [ ] 17.2 PUT /api/v1/admin/system/configs — 更新配置
- [ ] 17.3 邮件模板编辑/预览

### 模块 18: 团队管理 (3 检查点)
- [ ] 18.1 GET /api/v1/team — 团队信息
- [ ] 18.2 POST /api/v1/team/invite — 生成邀请
- [ ] 18.3 团队成员管理

### 模块 19: 通知系统 (2 检查点)
- [ ] 19.1 GET /api/v1/notifications — 通知列表
- [ ] 19.2 通知已读/未读操作

### 模块 20: 用户端前端页面 (Web) (7 检查点)
- [ ] 20.1 Login 页面加载
- [ ] 20.2 Dashboard 页面
- [ ] 20.3 API Key 管理页面
- [ ] 20.4 调用日志页面
- [ ] 20.5 充值页面
- [ ] 20.6 Agent Dashboard（代理商视角）
- [ ] 20.7 管理后台 Dashboard

### 模块 21: 定时任务 (4 检查点)
- [ ] 21.1 佣金自动结算（配置模式）
- [ ] 21.2 日汇总预计算（04:00）
- [ ] 21.3 安全日报邮件（09:00）
- [ ] 21.4 佣金日汇总（00:30）

---

## 执行顺序
1. 先执行所有 API 验证（脚本执行）
2. 再验证前端页面可访问
3. 最后生成汇总报告

## 风险
- 定时任务需等触发时间或手动触发
- 支付回调需要测试工具模拟
- 厂商 API Key 加密需确认环境变量
