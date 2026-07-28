# 边界条件 + 定时任务 + 安全审计 + QA 测试用例

> **所属 Sprint**：Sprint 1 | **优先级**：P0 | **版本**：V1.5

---

## 一、账号注销 — 异常场景（14 项）

| # | 场景 | 触发方式 | 预期 HTTP | 预期 error_code | 预期 message | 预期处理 | 前端展示 |
|---|------|---------|-----------|----------------|-------------|---------|---------|
| E01 | 已有 cooling 申请再提交 | POST /me/deletion | 409 | ACTIVE_DELETION_EXISTS | "您已提交过注销申请，当前处于冷静期。如需修改请先撤销" | 不创建新记录 | toast 提示 + 自动刷新 |
| E02 | 余额 > 0（有充值余额） | POST /me/deletion | 400 | DELETION_CHECKS_FAILED | "注销条件未满足" | 返回失败清单 | 展示清单：balance_cleared=false |
| E03 | 余额 < 0（欠费状态） | POST /me/deletion | 400 | DELETION_CHECKS_FAILED | 同上 | 同上 | "当前欠费 ¥X.XX，请先结清欠费" |
| E04 | 有活跃 Key（2 个） | POST /me/deletion | 400 | DELETION_CHECKS_FAILED | 同上 | 同上 | "存在 2 个活跃的 API Key" + [管理 API Key] 链接 |
| E05 | 有进行中发票 | POST /me/deletion | 400 | DELETION_CHECKS_FAILED | 同上 | 同上 | "存在 N 笔进行中的发票" + [查看发票] |
| E06 | 有进行中提现 | POST /me/deletion | 400 | DELETION_CHECKS_FAILED | 同上 | 同上 | "存在 N 笔进行中的提现" + [查看提现] |
| E07 | 有未完成充值 | POST /me/deletion | 400 | DELETION_CHECKS_FAILED | 同上 | 同上 | "存在 N 笔未完成的充值" + [查看充值] |
| E08 | 代理有绑定客户 | POST /me/deletion | 400 | DELETION_CHECKS_FAILED | 同上 | 同上 | "名下有 N 个绑定客户" + [管理客户] |
| E09 | 并发两次提交(<100ms) | POST × 2 | 第1:200/第2:409 | ACTIVE_DELETION_EXISTS | — | DB 唯一约束拦截 | 第1成功进入冷却期 |
| E10 | cooling 期 API 调用 | auth 中间件 | 403 | ACCOUNT_DELETING | "账号正在注销中，当前操作已被限制" | 拒绝请求 | 前端入口已隐藏；如调用则 toast |
| E11 | cooling 期充值/新建 Key | 前端隐藏+后端校验 | 403 | ACCOUNT_DELETING | 同上 | 用户看不到入口 | 前端入口隐藏 |
| E12 | 已注销用户登录 | POST /auth/login | 403 | ACCOUNT_DELETED | "账号已注销，如有疑问请联系客服" | 拒绝登入 | 登录页红色提示 |
| E13 | 撤销已完成注销 | DELETE /me/deletion | 400 | NO_ACTIVE_DELETION | "当前没有可撤销的注销申请" | 不执行 | toast 提示 |
| E14 | 驳回原因为空/过短 | POST reject | 400 | VALIDATION_ERROR | "驳回原因最少 5 个字符" | 不执行 | 表单下方红色提示 |

### 1.1 冷却期权限控制矩阵

| 功能 | 正常用户 | cooling 中 | deleted |
|------|---------|-----------|---------|
| 登录 | ✅ | ✅（仅查看历史 + 撤销注销） | ❌ 403 ACCOUNT_DELETED |
| GET /me/deletion | ✅ | ✅（显示倒计时） | ✅（显示已完成） |
| DELETE /me/deletion | ✅ | ✅（撤销） | ❌ 400 NO_ACTIVE_DELETION |
| 普通 API 调用（消费/调用） | ✅ | ❌ 403 ACCOUNT_DELETING | ❌ 403 |
| 充值页面 | ✅ | ❌ 隐藏 | ❌ 隐藏 |
| 新建 Key 页面 | ✅ | ❌ 隐藏 | ❌ 隐藏 |
| 提现/发票/退款页面 | ✅ | ❌ 隐藏 + 403 | ❌ |
| 消费记录下载 | ✅ | ✅ | ❌ |
| 修改个人信息 | ✅ | ❌ | ❌ |
| GET /me/profile | ✅ | ✅（只读） | ❌ |

### 1.2 注销脱敏字段映射

| 数据库字段 | 原值示例 | 脱敏后 | 说明 |
|-----------|---------|--------|------|
| users.nickname | "张三" | "已注销用户_101" | 格式：已注销用户_{id} |
| users.email | "zhangsan@example.com" | "deleted_101@local" | 格式：deleted_{id}@local |
| users.phone | "13800138000" | NULL | 直接置空 |
| users.avatar_url | "https://…" | NULL | 直接置空 |
| users.password_hash | "$2a$…" | "DISABLED" | 禁止登录 |
| users.status | "deleting" | "deleted" | 状态变更 |

**保留不变**：users.id, users.balance(=0), users.created_at, 消费记录, 调用日志, 结算记录

---

## 二、结算对账 — 异常场景（16 项）

| # | 场景 | 触发方式 | 预期 HTTP | 预期 error_code | 预期 message | 预期处理 |
|---|------|---------|-----------|----------------|-------------|---------|
| S01 | 代理期内零佣金 | generate 自动 | — | — | — | 跳过该代理，不生成账单 |
| S02 | 周期已关账再触发 | POST generate | 409 | CYCLE_ALREADY_CLOSED | "结算周期 X~Y 已关账" | 不执行 |
| S03 | periodEnd ≤ periodStart | POST generate | 400 | VALIDATION_ERROR | "结束日期必须大于开始日期" | schema 校验 |
| S04 | 周期跨度 > 366 天 | POST generate | 400 | VALIDATION_ERROR | "结算周期不能超过 366 天" | — |
| S05 | 已 settled 再确认 | POST confirm | 400 | SETTLEMENT_STATUS_MISMATCH | "结算单状态为 settled，无法确认" | — |
| S06 | 调整后金额为负 | POST adjust | 400 | SETTLEMENT_AMOUNT_NEGATIVE | "调整后金额 ¥X 不能为负数" | — |
| S07 | 调整已 settled | POST adjust | 400 | SETTLEMENT_STATUS_MISMATCH | "仅待确认状态的结算单可调整" | — |
| S08 | 代理看他人结算单 | GET /:id | 404 | SETTLEMENT_NOT_FOUND | "结算单不存在" | 不暴露信息 |
| S09 | 非代理访问代理接口 | GET /agent/settlements | 403 | AGENT_REQUIRED | "仅代理可访问" | — |
| S10 | 结算期间代理等级变更 | 关账自动处理 | — | — | — | 每笔按原佣金率算，不受影响 |
| S11 | 结算期间发生退款 | — | — | — | — | 已生成佣金保留，管理员 adjust 扣回 |
| S12 | 代理被禁用后有 pending | 自动确认 cron | — | — | — | 照常自动确认入账 |
| S13 | 200+ 代理同时结算 | generate 关账 | — | — | — | 分批 50 个/事务 |
| S14 | 调整原因 > 500 字 | POST adjust | 400 | VALIDATION_ERROR | "调整原因不能超过 500 字符" | — |
| S15 | 调整金额精度过多 | POST adjust | — | — | — | 后端 round 到 4 位小数 |
| S16 | 导出 > 10000 行 | GET export | — | — | — | 全量写入 CSV，不分页（单次最多约 500KB） |

### 2.1 结算状态转换矩阵

| 当前状态 | 可执行操作 | 目标状态 | 触发者 |
|---------|-----------|---------|--------|
| pending | 代理确认 | settled | 代理 |
| pending | 3 天自动确认 | settled | 系统(cron) |
| pending | 管理员调整金额 | pending（金额变更） | 管理员 |
| settled | （无） | （终态） | — |

**不可逆**：settled 是终态，不可回退到 pending

### 2.2 余额账本写入规则

| 操作 | changeType | changeAmount | balanceAfter | description |
|------|-----------|-------------|-------------|-------------|
| 代理确认 | commission_settlement | +结算金额 | 更新后余额 | "结算单 #X 手动确认入账" |
| 自动确认 | commission_settlement | +结算金额 | 更新后余额 | "结算单 #X 自动确认入账" |

**注意**：adjust 操作不写账本，只更新 settlement 的 settledAmount。实际余额变动在确认时一次性发生。

---

## 三、定时任务规格

### 3.1 冷却到期自动注销

| 属性 | 值 |
|------|-----|
| 名称 | auto-deletion-cron |
| Cron | `0 * * * *`（每小时第 0 分钟） |
| 查询 SQL | `WHERE status='cooling' AND cooling_deadline <= NOW() AND cooling_deadline IS NOT NULL` |
| 批处理 | 全量查出 → for 循环逐个处理（单次最多约 10 条） |
| 事务 | 每个用户一个事务：脱敏 + UPDATE status |
| 幂等 | status=cooling 的记录处理完变 completed，不再被查到 |
| 失败处理 | 单个失败不影响其他（try/catch 继续） |
| 日志 | `[DeletionCron] {ISO} \| scanned={N} processed={N} failed={N} duration={ms}` |

### 3.2 每月自动关账

| 属性 | 值 |
|------|-----|
| 名称 | auto-settle-cycle-cron |
| Cron | `0 2 1 * *`（每月 1 日 02:00） |
| 开关 | system_configs.key='settlement_auto_enabled', value='true' 才执行 |
| 周期计算 | 上月 1 日 ~ 上月最后一天 |
| 幂等 | 周期已 closed → generateSettlementCycle 抛 409 → catch 跳过 |
| 分批 | 50 个代理/事务 |
| 日志 | `[SettlementCycleCron] {ISO} \| period={start}~{end} \| agents={N} \| bills={M} \| duration={ms}` |

### 3.3 每日自动确认

| 属性 | 值 |
|------|-----|
| 名称 | auto-confirm-settlements-cron |
| Cron | `0 3 * * *`（每日 03:00） |
| 查询 SQL | `WHERE s.status='pending' AND sc.status='closed' AND s.created_at < (NOW() - INTERVAL '3 days')` |
| 处理 | 逐条调用 confirmSettlement(id, 0, true) |
| 幂等 | pending 的处理完变 settled，不再被查到 |
| 失败处理 | 单个失败记日志，继续下一个 |
| 日志 | `[SettlementCron] {ISO} \| scanned={N} confirmed={M} errors={K} duration={ms}` |
| 日志（单条失败） | `[SettlementCron] #{id} 确认失败: {errorMessage}` |

### 3.4 注册到 app/index.ts

```typescript
// 在 app.ready() 中注册
import { autoDeletionCron } from './cron/auto-deletion';
import { autoSettlementCycleCron } from './cron/auto-settle-cycle';
import { autoConfirmSettlementsCron } from './cron/auto-confirm-settlements';

app.ready(() => {
  // 开发环境：手动触发需加锁
  // 生产环境：使用 node-cron 或外部调度器

  // 每小时：注销到期
  // 每月 1 日 02:00：自动关账
  // 每日 03:00：自动确认
});
```

---

## 四、安全与审计

### 4.1 权限矩阵

| API | super_admin | admin | finance | agent | user |
|-----|-------------|-------|---------|-------|------|
| POST /me/deletion | — | — | — | — | ✅ |
| GET /me/deletion | — | — | — | — | ✅ |
| DELETE /me/deletion | — | — | — | — | ✅ |
| GET /admin/deletion | ✅ | ✅ | ❌ | ❌ | ❌ |
| GET /admin/users/:id/deletion | ✅ | ✅ | ❌ | ❌ | ❌ |
| POST /admin/users/:id/deletion/reject | ✅ | ✅ | ❌ | ❌ | ❌ |
| POST /admin/users/:id/deletion/force | ✅ | ✅ | ❌ | ❌ | ❌ |
| GET /admin/finance/settlement-cycles | ✅ | ✅ | ✅ | ❌ | ❌ |
| POST /admin/finance/settlement-cycles/generate | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /admin/finance/settlements | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /admin/finance/settlements/:id | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /admin/finance/settlements/:id/details | ✅ | ✅ | ✅ | ❌ | ❌ |
| POST /admin/finance/settlements/:id/adjust | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /admin/finance/settlements/:id/export | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /agent/settlements | ❌ | ❌ | ❌ | ✅ | ❌ |
| GET /agent/settlements/:id | ❌ | ❌ | ❌ | ✅ | ❌ |
| POST /agent/settlements/:id/confirm | ❌ | ❌ | ❌ | ✅ | ❌ |
| GET /agent/settlements/:id/export-csv | ❌ | ❌ | ❌ | ✅ | ❌ |

### 4.2 数据合规

| 数据类型 | 保留策略 | 脱敏方式 | 法律依据 |
|---------|---------|---------|---------|
| 用户个人信息（昵称/邮箱/手机/头像） | 注销后永久脱敏 | 替换为占位符 | 用户注销权 |
| 消费/调用日志 | 永久保留 | user_id 保留，关联不可反查 | 财务审计 |
| 结算数据（账单/明细/日志） | 永久保留 | 不删不改 | 财务审计 |
| API Key | 注销时禁用（不删除） | status→disabled | 可追溯 |
| 充值/提现记录 | 永久保留 | 不删 | 财务审计 |

### 4.3 防止信息泄露

| 场景 | 措施 |
|------|------|
| 代理查看他人结算单 | WHERE agent_id = 当前代理 ID，不匹配返回 404（非 403） |
| 用户查看他人注销记录 | GET /me/deletion 只查当前 user_id |
| 已注销用户数据 | 脱敏后昵称/邮箱不含原信息，无法反查 |
| 管理端强制注销 | 需输入"确认注销" + 5 秒倒计时双保险 |

---

## 五、QA 测试用例（33 TC）

### 5.1 账号注销（15 TC）

| TC# | 名称 | 前置条件 | 步骤 | 预期结果 | 类型 |
|-----|------|---------|------|---------|------|
| TC01 | 全通过注销 | balance=0, 无 Key, 无发票, 非代理 | POST /me/deletion | 200, status=cooling, Key 全部禁用 | 正常 |
| TC02 | 余额 > 0 | balance=100 | POST /me/deletion | 400, balance_cleared=false, "当前余额 ¥100.00" | 异常 |
| TC03 | 有活跃 Key | 2 个 active Key | POST /me/deletion | 400, no_active_keys=false, "存在 2 个活跃的 API Key" | 异常 |
| TC04 | 有进行中发票 | invoice status=pending | POST /me/deletion | 400, no_pending_invoices=false | 异常 |
| TC05 | 有进行中提现 | withdraw status=pending | POST /me/deletion | 400, no_pending_withdraw=false | 异常 |
| TC06 | 有未完成充值 | recharge status=pending | POST /me/deletion | 400, no_unsettled_bills=false | 异常 |
| TC07 | 代理有客户 | agent_clients 有绑定 | POST /me/deletion | 400, no_active_agent=false, "名下有 N 个绑定客户" | 异常 |
| TC08 | 重复提交 | 已有 cooling 申请 | POST /me/deletion | 409 ACTIVE_DELETION_EXISTS | 异常 |
| TC09 | 冷却期撤销 | status=cooling | DELETE /me/deletion | 200, status=cancelled | 正常 |
| TC10 | 到期自动注销 | deadline < NOW() | 触发 cron | nickname/email 脱敏, status=completed | 正常 |
| TC11 | cooling 期 API | status=cooling | 调用 GET /api/v1/me/keys | 403 ACCOUNT_DELETING | 权限 |
| TC12 | 管理端驳回 | 有 cooling 申请 | POST reject(reason="经核实有未结清费用") | 200, status=rejected | 正常 |
| TC13 | 驳回原因空 | cooling 申请 | POST reject(reason="") | 400 VALIDATION_ERROR | 异常 |
| TC14 | 强制注销 | cooling 申请 | POST force | 200, 脱敏, status=completed | 正常 |
| TC15 | 已注销登录 | status=deleted | POST /auth/login | 403 ACCOUNT_DELETED | 权限 |

### 5.2 结算对账（18 TC）

| TC# | 名称 | 前置条件 | 步骤 | 预期结果 | 类型 |
|-----|------|---------|------|---------|------|
| TC20 | 创建结算周期 | 有正式代理有佣金 | POST generate(2026-07-01, 2026-07-31) | 200, cycle.status=closed, 生成账单 | 正常 |
| TC21 | 重复创建 | 周期已 closed | POST generate(同期) | 409 CYCLE_ALREADY_CLOSED | 异常 |
| TC22 | 零佣金跳过 | 代理期内无可结算佣金 | generate 后检查 | 该代理无结算单 | 正常 |
| TC23 | 代理确认 | pending 结算单 | POST confirm | 200, status=settled, 代理 settled_commission 增加 | 正常 |
| TC24 | 已结算再确认 | status=settled | POST confirm | 400 SETTLEMENT_STATUS_MISMATCH | 异常 |
| TC25 | 3 天自动确认 | pending + created > 3 天 | 触发 cron | status=settled, log.action=auto_confirm | 正常 |
| TC26 | 调减金额 | pending, total=100 | POST adjust(-50, "退款扣除") | 200, settledAmount=50 | 正常 |
| TC27 | 调增金额 | pending, total=100 | POST adjust(+20, "补差") | 200, settledAmount=120 | 正常 |
| TC28 | 调整后 < 0 | total=100 | POST adjust(-200) | 400 SETTLEMENT_AMOUNT_NEGATIVE | 异常 |
| TC29 | 调整已 settled | status=settled | POST adjust | 400 SETTLEMENT_STATUS_MISMATCH | 异常 |
| TC30 | 代理看他人 | agent A | GET agent B 的 settlement ID | 404 SETTLEMENT_NOT_FOUND | 权限 |
| TC31 | CSV 导出（管理端） | 有明细 | GET /admin/finance/settlements/:id/export | CSV 下载, 含 BOM, 含客户姓名列 | 正常 |
| TC32 | CSV 导出（代理端） | 代理有结算单 | GET /agent/settlements/:id/export-csv | CSV 下载, 无客户姓名列 | 正常 |
| TC33 | 日志完整性 | 经多步操作 | 查 settlement_confirm_logs | generate→adjust→confirm 每步有记录 | 审计 |
| TC34 | 余额账本 | 确认后 | 查 agent_balance_ledger | changeType=commission_settlement, balanceAfter 正确 | 审计 |
| TC35 | 周期标记 settled | 所有代理确认 | 查 cycle | status=settled, settledAt 非 null | 自动 |
| TC36 | 等级变更不影响 | 期内升级（formal→senior） | 关账后查明细 | 按原佣金率计算 | 边界 |
| TC37 | CSV 含标题头 | 有明细 | 导出检查 | 包含"日期,客户ID,模型,Token数,佣金金额(元),佣金率"行 | 正常 |

---

## 六、部署检查清单

### 6.1 数据库迁移

- [ ] `migrations/2026-07-27-account-deletion.sql` 已执行（2 张表 + 2 索引）
- [ ] `migrations/2026-07-27-agent-settlement.sql` 已执行（4 张表 + 7 索引）
- [ ] 索引验证：
  ```sql
  SELECT indexname, tablename FROM pg_indexes
  WHERE tablename IN ('account_deletion_requests', 'deletion_checklist',
    'settlement_cycles', 'agent_settlements', 'settlement_details', 'settlement_confirm_logs');
  ```
- [ ] 表结构验证：`\d account_deletion_requests` / `\d agent_settlements`
- [ ] 外键验证：
  ```sql
  SELECT conname, conrelid::regclass FROM pg_constraint WHERE contype = 'f'
  AND conrelid::regclass IN ('account_deletion_requests','deletion_checklist',
    'agent_settlements','settlement_details','settlement_confirm_logs');
  ```

### 6.2 后端

- [ ] `app/routes.ts` 已注册 4 个路由文件
  - meDeletionRoutes
  - adminDeletionRoutes
  - adminSettlementRoutes
  - agentSettlementRoutes
- [ ] `app/index.ts` 已注册 3 个定时任务
  - autoDeletionCron
  - autoSettlementCycleCron
  - autoConfirmSettlementsCron
- [ ] auth middleware 已增加 status 拦截（'deleting' / 'deleted'）
- [ ] `npx tsc --noEmit` 编译通过
- [ ] 至少启动一次 `npm run dev`，无启动报错
- [ ] 手动调用 `GET /health` 返回 `{"status":"ok"}`

### 6.3 前端

- [ ] 新路由 `/admin/deletion` 已在 App.tsx 注册
- [ ] 管理端侧边栏已添加"注销审核"入口（含动态角标）
- [ ] Finance.tsx 已添加 `settlement` Tab
- [ ] agent/Finance.tsx 已添加 `settlements` Tab
- [ ] `web/src/types/deletion.ts` 已创建
- [ ] `web/src/types/settlement.ts` 已创建
- [ ] `npm run build` 编译通过
- [ ] 浏览器手动验证：管理端 → 注销审核 → 空表格正常显示
- [ ] 浏览器手动验证：管理端 → 财务管理 → 结算管理 Tab 显示

### 6.4 验证

- [ ] QA TC01-TC15 账号注销全部通过
- [ ] QA TC20-TC37 结算对账全部通过
- [ ] 定时任务手动触发 1 次验证日志输出
- [ ] 权限矩阵逐条验证（至少验证 5 条关键路径）
- [ ] CSV 导出文件用 Excel 打开验证中文不乱码
