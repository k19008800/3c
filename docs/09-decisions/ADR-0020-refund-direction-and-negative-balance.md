# ADR-0020：退款类型、资金方向与负余额规则

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 1 的确认
- 关联 ADR：ADR-0002、ADR-0003、ADR-0006、ADR-0009、ADR-0010、ADR-0012

## 背景
既有资料同时存在“原路退款+余额回滚”“审核即入账/审核后执行”和“允许负余额/禁止负余额”等冲突口径。

## 决策
- 消费/API 失败退款：退回用户余额，余额只增加一次。
- 充值订单退款：执行支付渠道原路退款，不同时执行余额回滚。
- 调账或人工上账纠错：不使用“退款”语义，统一通过红冲创建独立反向资金记录。
- 同一业务事件不得同时执行原路退款和余额回滚。
- 当前版本不允许因退款或红冲写入负余额；不引入平台垫付账户和下次充值优先抵扣机制。
- 需要扣减余额的纠错/冲销操作在余额不足时返回受控业务错误，不得强行写入负余额。
- 退款状态：`pending → approved → processing → completed`；审核驳回为 `rejected`，执行异常为 `failed`。
- `approved` 表示审核通过、尚未完成执行；退款成功后才进入 `completed`；`failed` 可按幂等规则重试。
- 每类退款必须有独立业务唯一键和退款金额上限；原单金额不可修改、不可删除。

## 影响与迁移
更新退款/红冲 PRD、SPEC、状态机、API、数据字典、测试和对账文档；将旧的“原路退款+余额回滚”和“允许负余额”口径标记为 superseded；补充重复退款、渠道失败、余额边界和重试测试。

## 关联文件
- `docs/02-requirements/03-billing-and-finance/refund-and-reversal.md`
- `docs/03-functional-spec/03-billing-and-finance/refund-and-reversal.md`
- `docs/06-data-and-architecture/state-machines/refund.md`
- `audit/08-deployment/document-decision-log.md#dec-020`
