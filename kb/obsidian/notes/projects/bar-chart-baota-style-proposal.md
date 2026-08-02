---
title: "Bar Chart Baota Style Proposal"
date: 2026-07-25
tags: [project]
---
# 柱形图宝塔风格改造方案

## 当前现状

项目中有 **14 个 `<BarChart>` 实例**，分布在 6 个文件中：

| 文件 | 实例数 | 当前样式 |
|:-----|:------:|:---------|
| Dashboard.tsx | 2 | `fill="#3B82F6"`, `radius={[3,3,0,0]}` |
| EnterpriseAnalysis.tsx | 3 | `fill="#0984e3"/"#00b894"/"#6c5ce7"`, `radius={[0,4,4,0]}` |
| FinanceDashboard.tsx | 1 | `fill="#10b981"`, `radius={[4,4,0,0]}` |
| Stats.tsx | 5 | `fill="#8B5CF6"/"#3B82F6"/"#10B981"`, `radius={[0,4,4,0]}` |
| TrendsCharts.tsx | 1 | 动态颜色, `radius={[3,3,0,0]}` |
| Agent 页面 | 2 | (非 BarChart，图标引用，忽略)|

---

## 宝塔风格 → 改动点

### 1. 渐变填充（核心差异）

当前：`fill="#3B82F6"` (纯色)

宝塔风格：`fill="url(#gradBlue)"` 搭配 `<defs>` 定义：

```tsx
// 每个颜色对应一个渐变
<defs>
  <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.9} />
    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.25} />
  </linearGradient>
  <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
    <stop offset="100%" stopColor="#10B981" stopOpacity={0.25} />
  </linearGradient>
  <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9} />
    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.25} />
  </linearGradient>
</defs>
```

效果：柱子底部半透明 → 顶部实色，类似宝塔面板的「透明玻璃柱」

### 2. 圆角调整

| 方向 | 当前 | 宝塔风格 |
|:----|:----:|:--------:|
| 纵向柱 | `radius={[3,3,0,0]}` | **`radius={[6,6,0,0]}`** |
| 横向柱 | `radius={[0,4,4,0]}` | **`radius={[0,6,6,0]}`** |

### 3. 柱子宽度

增加 `barSize={24}` 或 `maxBarSize={40}` 让柱子更饱满

### 4. 背景网格

```
<CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" strokeWidth={0.5} />
```

### 5. 去除柱边框

确保没有配置 `stroke` 属性。（当前所有 Bar 均无 stroke，无需修改）

---

## 改造后效果对比例子

**Dashboard.tsx 营收趋势图** — 当前:
```tsx
<Bar yAxisId="left" dataKey="calls" fill="#3B82F6" radius={[3, 3, 0, 0]} />
```

— 改造后:
```tsx
<Bar yAxisId="left" dataKey="calls" fill="url(#gradBlue)" radius={[6, 6, 0, 0]} maxBarSize={32} />
```

**Stats.tsx 按用户排行** — 当前（横向）:
```tsx
<Bar dataKey="totalTokens" fill="#3B82F6" name="Token" radius={[0, 4, 4, 0]} />
```

— 改造后:
```tsx
<Bar dataKey="totalTokens" fill="url(#gradBlue)" name="Token" radius={[0, 6, 6, 0]} maxBarSize={20} />
```

---

## 涉及修改的文件清单

| 文件 | 改动内容 |
|:-----|:---------|
| `admin/Dashboard.tsx` | 2 处 Bar + 添加 `<defs>` |
| `admin/EnterpriseAnalysis.tsx` | 3 处 Bar + 添加 `<defs>` |
| `admin/FinanceDashboard.tsx` | 1 处 Bar + 添加 `<defs>` |
| `admin/Stats.tsx` | 5 处 Bar + 添加 `<defs>` |
| `admin/TrendsCharts.tsx` | 1 处 Bar（动态颜色需特殊处理渐变）|

**预计总代码变动**：约 +80 行（<defs> 定义 + fill/radius 参数微调）

---

要确认的话，我就直接改代码。
