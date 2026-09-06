# 财务文档逻辑一致性只读审计

- 审计范围：PRD/ARCH R1–R7、`ref-4.4-finance.md`、`ref-5.2-billing.md`、`api-reference.md`、`api-contract.md`，并以 routes/schema 做事实核对。
- 结论：发现 8 条需要裁决/修订的问题。本文仅记录审计，不修改业务源码或需求文档。

## 发现清单

### FIN-DOC-001：R5 人工上账单笔上限在同一 ARCH 内互相冲突

- **文件/行号**：`docs/ARCH-整改R5-R7-资金风控.md:209`、`:660`、`:744`、`:759`、`:798`、`:809`
- **原文摘录 A**：`209 | 金额上限 ... 保持 ≤ 50,000（B3 裁决）`；`660 | 人工上账创建上限 ... 保持 50,000（B3）`
- **原文摘录 B**：`744 | B3 终裁 ... 人工上账创建上限 50,000 → 1,000,000`；`759 | B20 终裁 ... 用户端单笔充值上限保持 1,000,000`；`798 ... 人工上账创建上限 50,000 → 1,000,000`。
- **矛盾说明**：同一 ARCH 同时把 B3 解释为“保持 50,000”和“终裁放开至 1,000,000”；总结表 `809` 又回到 50,000。实现章节、测试门禁及前端提示无法确定应拒绝还是允许大额人工上账。
- **严重度**：P0
- **建议裁决**：以文档中日期较新的“B3 终裁”作为唯一规则，统一为人工上账 ≤1,000,000、>10,000 进入双人、>100,000 进入终审；同步删除/改写 `209/660/809` 及测试“>50,000 必须 400”的旧口径。若产品实际仍需 50,000，则反向删除所有“50,000→1,000,000”终裁段，不能两套并存。

### FIN-DOC-002：PRD R5 与 ARCH R5 对人工上账上限的裁决不一致

- **文件/行号**：`docs/PRD-整改R5-R7-资金风控.md:346`、`:561`；`docs/ARCH-整改R5-R7-资金风控.md:744`
- **原文摘录 A**：PRD `E11 ... 金额 > ¥50,000 ... 创建拒绝`；PRD `B3 ... 保持 ¥50,000`。
- **原文摘录 B**：ARCH `B3 终裁 ... 人工上账创建上限 50,000 → 1,000,000`。
- **矛盾说明**：ARCH 声称 PRD 为业务权威，但其“终裁”实际推翻了 PRD 的 E11/B3；R5 的人工上账是否允许终审档、测试边界和 API 校验均因此矛盾。
- **严重度**：P0
- **建议裁决**：产品负责人明确“R5 终裁是否覆盖 PRD”。裁决后同批修订 PRD E11/B3、ARCH 的实现/测试和前端文案，并在两份文档顶部注明生效版本/日期。

### FIN-DOC-003：限额配置键名与实际方案键名不一致

- **文件/行号**：`docs/PRD-整改R5-R7-资金风控.md:197-202`；`docs/ARCH-整改R5-R7-资金风控.md:121-126`
- **原文摘录 A**：PRD 配置表使用 `limits.operator_24h`、`limits.recipient_24h`，并定义 `count_refund_review`。
- **原文摘录 B**：ARCH `123` 声明实现统一为 `limits.soft_limit=50000`、`limits.hard_limit=100000`，并称 `operator_24h/recipient_24h` 已退役；同时 `124` 定义 `exceed_action`，`126` 仍列旧/不同字段。
- **矛盾说明**：API 配置读写到底接受哪组键名不明确；且 PRD 的超限默认“升级”为主，ARCH 新增 hard 429 拒绝线，改变了超限语义。按旧键写入可能被忽略，按新键则无法满足 PRD 字段契约。
- **严重度**：P1
- **建议裁决**：选择一套规范键名（推荐 `operator_24h`/`recipient_24h` 或明确映射到 soft/hard 两阶段），给出兼容读取和写回规则；明确 soft/hard 与 `exceed_action` 的优先级、tier3 是否豁免 hard，并同步配置 API schema、示例和验收用例。

### FIN-DOC-004：充值/人工上账多阶段状态在 PRD 与 ARCH 的存储及 API 语义不一致

- **文件/行号**：`docs/PRD-整改R5-R7-资金风控.md:115-120`、`:126-139`；`docs/ARCH-整改R5-R7-资金风控.md:158-161`、`:163-182`
- **原文摘录 A**：PRD 要求人工上账/充值订单 `status` 扩展 `pending_level2`、`pending_super`，并在状态机中直接流转 `pending → pending_level2 → pending_super → paid`。
- **原文摘录 B**：ARCH 明确 `recharge_orders` DB `status` 保持 `pending` 直至最终 `paid`，审批阶段放在 `metadata.approval.phase`，并称这是与 PRD 的“存储层差异”。
- **矛盾说明**：这不仅是内部存储差异：PRD/API 消费者会读取 `status` 判断当前审批环节，而 ARCH 要求读取 metadata；列表、详情、用户端以及错误重试的状态契约没有统一字段。阶段一 ARCH 还声称“状态契约不变”，阶段二验收却要求 `pending_level2` 可见。
- **严重度**：P1
- **建议裁决**：保留 DB `status=pending` 可作为内部实现，但必须定义统一管理端响应字段（例如 `approval_phase` 为唯一审批态，`status` 仅订单业务态），并明确用户端只见 `pending/paid/failed`；禁止 PRD 用“status 扩展”表述，或改为实际 enum 迁移。

### FIN-DOC-005：退款状态机/API 与实现事实不一致，且“原路退回+余额回滚”方向未定义

- **文件/行号**：`docs/ref-4.4-finance.md:534-541`、`:551-569`；`docs/ARCH-整改R5-R7-资金风控.md:34`；事实核对 `api/src/routes/admin-finance-stats.ts:508-593`
- **原文摘录 A**：ref 定义 `pending → reviewing → approved → completed`，另有 `POST /admin/refunds/:id/execute`；`order_refund` 为“原路退回（通道）+ 余额回滚”。
- **原文摘录 B**：ARCH 记录实际审核端点为 `POST /admin/refunds/:id/review`，approve 走 `addBalance(type='refund')`；代码事实为 review 内 `pending` 原子更新并直接写余额流水，响应 `approved/rejected`，没有 execute 状态流转。
- **矛盾说明**：文档描述“两步审核→执行”，实现是“一步审核即余额增加”；ref 的 order_refund 还同时写原路退款和余额回滚，存在双重退款风险。退款方向（余额增加还是扣减/充值订单通道退款）及幂等边界不一致。
- **严重度**：P0
- **建议裁决**：按退款类型分别定义唯一资金方向和执行时点：余额退费/API 失败计费只能“用户余额增加一次”；充值订单退款必须明确是通道原路退款还是余额回滚，禁止两者无条件并行。随后统一为单步 review 或 review+execute，并补充 `pending → approved/rejected → completed` 的原子守卫、重复请求码和通道失败补偿。

### FIN-DOC-006：计费预扣对象/流水表与当前财务文档互相矛盾

- **文件/行号**：`docs/ref-4.4-finance.md:95-105`；`docs/ref-5.2-billing.md:103-114`、`:326-337`、`:521-535`；事实核对 `api/src/db/schema/customer-balances.ts`、`balance-transactions.ts`
- **原文摘录 A**：ref-4.4 写“预扣余额（转余额表 `balance_logs`, type=`pre_charge`）”，并以 `balance_logs` 的 `charge_adjust` 表述多退少补。
- **原文摘录 B**：ref-5.2 一处写“实时扣费（直接扣减余额，允许余额为负）”，另一处又写预扣为 `UPDATE users SET balance = ...`、写 `billing_logs`；当前 schema 实际存在 `customer_balances` 与 `balance_transactions`，并非文档所称 `balance_logs`/`billing_logs`。
- **矛盾说明**：预扣是保留/扣减/结算哪一个账户字段、哪张流水表为权威，文档没有单一答案；“预扣后转发”与“先实际扣费再转发”顺序也冲突，影响余额并发、回滚和对账。
- **严重度**：P0
- **建议裁决**：以实际 schema/计费服务为准重新绘制唯一时序：明确 `available_balance` 的预扣、实际扣费、差额返还/追扣各自流水类型及同一事务边界；若 `balance_logs`/`billing_logs` 为历史名称，全部标注废弃并给出映射。禁止文档同时宣称允许负余额和 `balance >= amount` 拒绝，除非明确两种策略的适用账户/阶段。

### FIN-DOC-007：余额不足退款的“允许负余额”与退款实现的账户约束矛盾

- **文件/行号**：`docs/ref-4.4-finance.md:965-966`；事实核对 `api/src/routes/admin-finance-stats.ts:553-581`
- **原文摘录 A**：ref-4.4 FIN-005 要求“支持负余额退款（平台先行垫付）……用户下次充值时优先抵扣”。
- **原文摘录 B**：同文件 `965` 又要求扣减若余额为负则事务回滚；代码 `admin-finance-stats.ts` 的退款 approve 通过 `UPDATE customer_balances SET available_balance = available_balance + amount`，无余额行时失败回滚，未实现平台运营账户/负余额标记/下次充值优先抵扣。
- **矛盾说明**：一个规则允许退款造成负余额，另一个规则要求负余额时回滚；代码也没有实现所述垫付账务。退款成功/失败和用户后续充值行为不可据此确定。
- **严重度**：P1
- **建议裁决**：明确退款是否允许负余额。若允许，新增负余额状态/平台垫付科目/后续充值抵扣及对账规则，并在同一事务落账；若不允许，删除 FIN-005 的负余额方案并规定余额不足返回业务错误，不能保留两种相反策略。

### FIN-DOC-008：充值订单管理 API 路径与状态码/实现清单未对齐

- **文件/行号**：`docs/ref-4.4-finance.md:293-305`、`:557-569`；`docs/ARCH-整改R1-R4-技术方案.md:49`、`:406-418`；`docs/api-contract.md:140`
- **原文摘录 A**：ref-4.4 使用 `/admin/recharge-orders/:id/first-confirm`、`/second-confirm`、`/force-complete`，退款另有 `/execute`。
- **原文摘录 B**：ARCH 使用 `/admin/recharge-orders/:id/audit`、`/reject`，并统一到 `finance.topup`；`api-contract` 仍把 `/admin/finance/*`、`/admin/manual-topup` 等财务域列为 `⬜` 未实现。
- **矛盾说明**：同一充值业务存在 first/second-confirm 与 audit/reject 两套路径；contract 的“未实现”状态又与 ARCH/代码已存在的人工上账及充值审核事实冲突。客户端无法知道应调用哪条路径，也无法判断旧路径是否兼容/废弃。
- **严重度**：P1
- **建议裁决**：确定一套公开 API（推荐 `audit/reject` 与 R5 `approval_phase`），对旧路径给出 301/兼容窗口或明确废弃；统一成功状态码、重复审批 409 错误码、响应 envelope 和权限点。更新 `api-contract` 的实现状态，并增加路径级回归矩阵。

## 未发现/需后续专项

- 本次未将单纯“建议/待裁决”当作矛盾；但金额终裁、限额键名、退款一步/两步属于必须先冻结的发布阻塞项。
- `api-reference.md` 对本范围内充值金额字段仅有通用示例，未定义 R1/R5 人工上账端点及审批状态，属于契约缺口，建议随 FIN-DOC-001/008 一并补齐。
