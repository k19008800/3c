# ADR-0002：金额精度与舍入

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-002
- 影响范围：计费、财务、价格、佣金、数据库、API、测试、对账

## 决策
- 余额与 Token 消费内部统一使用 `numeric(18,8)`。
- 充值、人工上账、调账、退款、红冲输入最多 2 位小数。
- 用户展示金额固定 2 位小数。
- 代理佣金使用 `numeric(18,4)`。
- Token 最终结算按 8 位小数舍入。
- 禁止 JavaScript `Number` 作为金融最终计算依据，使用 Decimal 或数据库 numeric 运算。
- 价格字段统一为 `numeric(18,8)`，输入价与输出价分开保存。

## 影响与迁移
盘点 schema/migrations 的金额字段，定义展示、尾差、对账和迁移策略后同步正式章节。

## 关联
`audit/08-deployment/document-decision-log.md#dec-002`
