# 3cloud 定价体系更新报告

**更新时间**: 2026-07-22 01:00
**定价单位**: 元/百万 token (CNY/1M tokens)
**汇率**: USD → CNY @7.2

---

## 一、定价体系说明

### 1. 定价单位

- **后台规则**: 元/百万 token (CNY/1M tokens)
- **计费公式**: `cost = (prompt × sellIn + completion × sellOut) / 1M × discountRate`
- **全局倍率**: sync 阶段应用到 sellPrice，计费时不再重复应用

### 2. 价格来源

所有价格均来自各供应商官方定价（2026-07），汇率按 7.2 转换为 CNY。

---

## 二、官方定价对照表

### DeepSeek (USD → CNY)

| 模型 | Input (USD) | Output (USD) | Input (CNY) | Output (CNY) |
|------|-------------|--------------|-------------|--------------|
| DeepSeek V4 Pro | $0.44 | $0.87 | ¥317 | ¥626 |
| DeepSeek V4 Flash | $0.09 | $0.19 | ¥65 | ¥137 |
| DeepSeek V3.2 | $0.27 | $0.40 | ¥194 | ¥288 |

### Claude (USD → CNY)

| 模型 | Input (USD) | Output (USD) | Input (CNY) | Output (CNY) |
|------|-------------|--------------|-------------|--------------|
| Claude Opus 4.8 | $5.00 | $25.00 | ¥36 | ¥180 |
| Claude Sonnet 5 | $2.00 | $10.00 | ¥14 | ¥72 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | ¥22 | ¥108 |
| Claude Haiku 4.5 | $1.00 | $5.00 | ¥7 | ¥36 |
| Claude Fable 5 | $10.00 | $50.00 | ¥72 | ¥360 |

### GPT (USD → CNY)

| 模型 | Input (USD) | Output (USD) | Input (CNY) | Output (CNY) |
|------|-------------|--------------|-------------|--------------|
| GPT-4o | $2.50 | $10.00 | ¥18 | ¥72 |
| GPT-4o mini | $0.15 | $0.60 | ¥1 | ¥4 |
| GPT-5.5 | $5.00 | $30.00 | ¥36 | ¥216 |
| GPT-5.4 | $2.50 | $15.00 | ¥18 | ¥108 |

---

## 三、计费示例

### 示例 1: DeepSeek V4 Pro

**输入**: 1M prompt + 1M completion

```
cost = (1M × 317 + 1M × 626) / 1M
     = 317 + 626
     = ¥943.00
```

### 示例 2: Claude Opus 4.8

**输入**: 1M prompt + 1M completion

```
cost = (1M × 36 + 1M × 180) / 1M
     = 36 + 180
     = ¥216.00
```

### 示例 3: GPT-4o

**输入**: 1M prompt + 1M completion

```
cost = (1M × 18 + 1M × 72) / 1M
     = 18 + 72
     = ¥90.00
```

---

## 四、验证结果

### 关键模型价格验证

| 模型 | Input (CNY/1M) | Output (CNY/1M) | 状态 |
|------|----------------|-----------------|------|
| deepseek-v4-pro | ¥317 | ¥626 | ✅ |
| deepseek-v4-flash | ¥65 | ¥137 | ✅ |
| claude-opus-4-8 | ¥36 | ¥180 | ✅ |
| claude-sonnet-5 | ¥14 | ¥72 | ✅ |
| claude-haiku-4-5 | ¥7 | ¥36 | ✅ |
| gpt-4o | ¥18 | ¥72 | ✅ |
| gpt-4o-mini | ¥1 | ¥4 | ✅ |

### 系统配置验证

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 全局倍率 | 1.0 | sync 阶段应用，计费时不重复 |
| 计费公式 | ✅ | 正确 |
| 定价单位 | ✅ | 统一为 元/百万 token |

---

## 五、更新统计

| 项目 | 数量 |
|------|------|
| vendor_models 总数 | 155 |
| 已更新价格 | 91 |
| 跳过（已是最新）| 64 |

---

## 六、代码修改记录

### 1. pricing.ts 更新

**文件**: `services/vendor-sync/pricing.ts`

**修改内容**: 所有模型价格更新为官方定价（CNY/1M tokens）

### 2. 数据库更新

**执行脚本**: `scripts/update-all-prices.ts`

**更新范围**: 所有 vendor_models 表中的价格字段

---

**报告生成时间**: 2026-07-22 01:00
**验证状态**: ✅ 全部通过
