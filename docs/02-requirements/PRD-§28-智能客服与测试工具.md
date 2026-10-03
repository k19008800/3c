# §28 智能客服与测试工具

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/routes/{admin-support-extra,admin-customers}.ts`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 28.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 28.1.1 | 用户意图识别 | `POST /api/v1/admin/support/assist/intent` | ✅ | 客服工作台侧调用 |
| 28.1.2 | 用户异常自动诊断 | `GET /api/v1/admin/support/assist/diagnose/:id` | ✅ | 聚合余额/Key/消费异常 |
| 28.1.3 | 知识推荐自动回复（置信度 >95% 自动发送） | 依赖 intent 端点 | 🟡 | intent 已有；无自动回复发送链路与知识库命中度评分 |
| 28.1.4 | 余额不足主动预警 | diagnose 内联 | 🟡 | 诊断面板含余额视图；无独立预警标注/推送给客服 |
| 28.2.1 | 临时测试 Key（列表/生成/撤销） | `admin-support-extra.ts`：`GET /support/test-keys`、`POST /support/test-key`、`POST /:id/revoke` | ✅ | |
| 28.2.2 | 模拟用户调用（simulate-call） | — | ❌ | 无 `POST /admin/support/simulate-call` |
| 28.2.3 | 进入/退出用户视角 | `admin-customers.ts`：`POST /admin/customers/:id/impersonate`、`/impersonate/exit` | ✅ | 旧文档 user-perspective 路径已被 impersonate 取代（语义等价），签发带 impersonateBy 的 token，操作留痕 |

## 28.2 关键架构

- 智能客服定位为**客服工作台增效工具**（客服端调用），不直接面向用户自动应答；自动回复闭环（28.1.3）依赖 §27 客服消息通道先建。
- impersonate 有独立鉴权语义与审计留痕，禁止用于资金类操作（与操作级 2FA 互斥校验）。

## 28.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 知识推荐自动回复发送链路 |
| P2 | 模拟用户调用 simulate-call、余额预警主动推送 |
