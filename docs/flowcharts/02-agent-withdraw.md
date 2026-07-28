# 泳道图 2：代理提现双审流程

> **对应章节**：PRD-README.md §3 代理商体系 — 提现管理
> **涉及角色**：代理 / 系统 / 财务初审 / 复审审核员(角色可配置) / 支付平台
> **复审角色配置**：由 `site_configs.withdraw_second_review_role` 决定，可选 `agent_mgr`(代理管理岗) 或 `operator`(运营岗)
> **状态机**：`pending → pending_first_review → pending_second_review → processing → completed / rejected`

```mermaid
sequenceDiagram
    participant A as 代理商
    participant S as 系统
    participant R1 as 财务初审
    participant R2 as 复审审核员
    participant P as 支付平台

    A->>S: ① 提交提现申请（金额、收款账号）
    S->>S: ② 校验：可提现余额 ≥ 申请金额
    S->>S: ③ 冻结申请金额（pending_balance）
    S->>S: ④ 创建提现记录（status=pending_first_review）
    S->>A: ⑤ 返回提现申请提交成功
    S-->>R1: ⑥ [后台] 提现待审列表出现新条目

    Note over R1,R2: 双审流程（先初审、后复审）

    R1->>S: ⑦ 查看提现详情（金额、收款人、历史记录）
    R1->>S: ⑧ 提交审核意见

    alt 初审通过
        S->>S: ⑨ 更新状态（status=pending_second_review）
        S-->>R2: ⑩ [后台] 复审待审列表出现
    else 初审拒绝
        S->>S: ⑨' 解冻金额（pending_balance → 0）
        S->>S: ⑩' 更新状态（status=rejected, reject_reason）
        S->>A: ⑪' 通知提现申请被拒绝 + 原因
    end

    R2->>S: ⑫ 查看复审详情（含初审意见）
    R2->>S: ⑬ 提交复审意见

    alt 复审通过
        S->>S: ⑭ 更新状态（status=processing）
        S->>P: ⑮ 发起打款（转账接口）
        
        alt 打款成功
            P->>S: ⑯ 回调通知打款成功
            S->>S: ⑰ 更新状态（status=completed, completed_at）
            S->>S: ⑱ 扣除实际冻结金额（balance_logs）
            S->>A: ⑲ 通知提现到账
        else 打款失败
            P->>S: ⑯' 回调通知打款失败
            S->>S: ⑰' 解冻金额（pending_balance → 0）
            S->>S: ⑱' 更新状态（status=transfer_failed）
            S->>A: ⑲' 通知提现失败，请重新申请
        end
    else 复审拒绝
        S->>S: ⑭' 解冻金额（pending_balance → 0）
        S->>S: ⑮' 更新状态（status=rejected, reject_reason）
        S->>A: ⑯' 通知提现申请被拒绝 + 原因
    end
```

## 关键决策点

| 步骤 | 决策 | 分支 | 说明 |
|------|------|------|------|
| ② | 可提现余额充足？ | 是/否 | 不足直接拒绝 |
| ⑧ | 初审通过？ | 通过/拒绝 | 初审检查金额合理性、收款账号 |
| ⑬ | 复审通过？ | 通过/拒绝 | 复审核心检查（合规、风控），复审角色按系统配置 |
| ⑮ | 打款成功？ | 成功/失败 | 依赖支付平台回调 |

## 可能的异常场景

1. **初审通过后复审长时间未处理** → 超时告警（24h 未处理）
2. **打款回调超时** → 标记为 "打款中"，自动轮询（3 次/5 分钟）
3. **打款金额与申请金额不一致** → 紧急告警，需人工介入
4. **同一用户重复提现** → 限制最小间隔（24h cooldown）