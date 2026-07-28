# 泳道图 3：实名审核流程

> **对应章节**：PRD-README.md §4.6 安全风控 — 实名认证
> **涉及角色**：用户 / 系统（自动校验） / 安全/运营审核
> **状态机**：`unverified → pending_review → approved / rejected`

```mermaid
sequenceDiagram
    participant U as 用户
    participant S as 系统
    participant A as 安全/运营审核员

    Note over U: 用户未实名（realNameStatus=unverified）
    Note over U: 未实名用户无法使用 API 调度

    U->>S: ① 提交实名认证信息（姓名、身份证/企业信息）

    alt 管理员手动确认（后台操作）
        A->>S: ①' 在用户详情页手动发起实名确认
        S->>S: ② 直接设置 realNameStatus=approved
        S->>U: ③ 通知实名已通过
        Note over U,S: 绕过用户主动提交，后台直接审批
    else 用户主动申请
        U->>S: ① 提交实名信息
        S->>S: ② 基础校验（身份证格式、姓名非空）
        
        alt 基础校验失败
            S->>U: ③' 返回校验失败提示
        else 校验通过
            S->>S: ③ 更新状态（realNameStatus=pending_review）
            S->>U: ④ 返回提交成功，等待审核
            S-->>A: ⑤ [后台] 实名审核待审列表
        end
    end

    A->>S: ⑥ 查看待审列表（筛选/搜索/排序）
    A->>S: ⑦ 打开详情页（查看提交信息）
    A->>S: ⑧ 提交审核意见

    alt 审核通过
        S->>S: ⑨ 更新状态（realNameStatus=approved）
        S->>U: ⑩ 通知实名已通过
        Note over U: 用户可正常使用 API 调度
    else 审核拒绝
        S->>S: ⑨' 更新状态（realNameStatus=rejected）
        S->>S: ⑩' 记录拒绝原因（reject_reason）
        S->>U: ⑪' 通知实名未通过 + 原因
        
        Note over U: 用户可修改后重新提交
        U->>S: ⑫' 修改信息后重新提交
        S->>S: ⑬' 状态重置为 pending_review
    end
```

## 关键决策点

| 步骤 | 决策 | 分支 | 说明 |
|------|------|------|------|
| ② | 基础校验通过？ | 通过/失败 | 身份证格式、信息准确性 |
| ⑧ | 审核通过？ | 通过/拒绝 | 人工核对身份证/企业信息真实性 |
| ⑪' | 重新提交？ | 允许重新提交 | 仅 rejected 状态可重新提交 |

## 可能的异常场景

1. **身份证照片与信息不符** → 拒绝并说明原因
2. **企业认证资料不完整** → 拒绝并提示补充材料
3. **重复提交** → 拒绝后重新提交，防止无限循环
4. **管理员绕过审核直接确认** → 操作日志记录，需审计追踪