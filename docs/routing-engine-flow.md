# Token 代理路由引擎 — 流程图

> 文件：`3cloud/docs/routing-engine-flow.md`
> 关联实现：`api/src/services/router.ts`

```mermaid
flowchart TD
    A["请求接入\nPOST /v1/chat/completions"] --> B["鉴权\n提取 Bearer Token\n查询 API Key (SHA-256)"]
    B --> C{"API Key 有效？"}
    C -->|"无效/禁用"| Z1["40101\nAPI Key 无效"]
    C -->|"有效"| D["余额检查\nusers.balance > 0？"]
    D -->|"余额 ≤ 0"| Z2["40200\n余额不足"]
    D -->|"余额 > 0"| E["模型解析\n提取 model 字段\n查询 models 表"]

    E --> F["限流检查\nKey 级 / 用户级 / 全局\nRedis 滑动窗口"]
    F -->|"超限"| Z3["429xx\nRetry-After"]
    F -->|"通过"| G{"路由策略选择"}

    G -->|"自动最低价（默认）"| H1["按模型查询全部\n可用厂商-模型关联\n筛选 isDown=false"]
    G -->|"手动指定"| H2["查询该用户绑定的\n指定厂商-模型关联"]
    G -->|"加权动态"| H3["按 weight 加权随机\n筛选 isDown=false"]

    H1 --> I1["排序：sellPriceInput + sellPriceOutput\n选最低价厂商"]
    H3 --> I2["随机权重选择\n高 weight 高概率"]

    H2 --> J{"厂商可用？"}
    I1 --> J
    I2 --> J

    J -->|"不可用\n(已 down / 余额不足)"| K["降级检查\n有备用厂商？"]
    K -->|"是"| L["切到下一个\n次低价 / 次高权重"]
    K -->|"否"| Z4["50002\n无可用厂商"]
    L --> J

    J -->|"可用"| M["多 Key 分摊\n该厂商下多密钥\n轮询或按剩余容量分配"]

    M --> N["替换请求\nmodel → upstreamModelName\nauth → 厂商 API Key"]
    N --> O["转发请求\n向上游发起 HTTP 请求"]

    O --> P{"响应类型？"}
    P -->|"非流式"| Q1["等待完整响应\n解析 usage"]
    P -->|"流式 (SSE)"| Q2["建立 SSE 连接\n逐块转发给客户端\n累加 token 计数"]

    Q1 --> R["计费\nusage × 售价 × 折扣"]
    Q2 --> S{"流式结束？"}
    S -->|"正常结束"| T["计算总 usage\n统—扣费"]
    S -->|"余额耗尽"| U["允许走完当前流\n余额可为负值"]
    S -->|"客户端断连"| V["丢弃已消费部分\n**不计费**"]
    S -->|"上游异常"| W["切换备用厂商？\n触发被动健康检测"]

    U --> R
    T --> R
    V --> X["返回已发送内容\n日志记录 cancelled"]
    W --> K

    R --> Y["记录 call_logs\n生成 balance_logs"]
    Y --> AA{"归属代理商？"}
    AA -->|"是"| AB["计算分佣\n生成 commission_logs"]
    AA -->|"否"| AC["结束"]

    AB --> AC
    X --> AC
```

## 状态说明

| 状态 | 含义 |
|---|---|
| `active` | 厂商正常 |
| `degraded` | 降级（近 50 次成功率 < 70%，权重降至 50%） |
| `down` | 宕机（近 50 次成功率 < 30%，权重归零） |

## 健康检查

### 被动检查（主要）
- 每次调用后更新 `healthSamples` 和 `healthScore`
- 近 50 次采样：成功率 < 70% → 降级；< 30% → 宕机

### 主动检查（辅助）
- 每 5 分钟对 `isDown=true` 的厂商发轻量请求
- 连续成功 3 次 → 恢复 `active`

## 超时策略

| 场景 | 处理 |
|---|---|
| 上游响应 > 10s | AbortController.timeout 中断 → 告警 + 切备用 |
| 上游 HTTP 429 / 5xx | 触发被动检测 → 切备用 |
| 流式响应中途超时 | 中断流 → 不计费 → 切备用 |
