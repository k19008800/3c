---
title: "Obsidian 知识库同步制度"
date: 2026-07-19
tags: [arch-decision, obsidian, workflow]
aliases: [obsidian制度, kb同步策略]
---

# Obsidian 知识库同步制度

## 背景

`kb/obsidian/` 初始化后断更，源文件 `kb/` 与 Obsidian vault 内容脱节。需要建立一套可持续的同步和使用机制。

## 决策

**主从制度：`kb/` 为源，单向同步到 Obsidian vault**

### 源 vs 输出
- **`kb/`** — 源文件主仓库。泥鳅在此读写，长期维护
- **`kb/obsidian/`** — Obsidian vault 输出。自动同步，不直接编辑

### 同步机制
- 自动：每日凌晨 2:00 cron 执行 `sync-obsidian.py`
- 手动：随时可运行 `python bin/sync-obsidian.py`
- 同步方向：单向 `kb/ → obsidian/`

### 日常使用制度

| 角色 | 职责 | 频率 |
|------|------|------|
| BOSS | 日常聊天，回应"记？/不记？" | ~3分钟/天 |
| 泥鳅 | 自动沉淀决策/踩坑/待办/小结 | 实时 + 每日 |

### 沉淀触发规则
- 决策性对话 → 问"记决策？" → 写 `notes/decisions/`
- 踩坑修复 → 问"记经验？" → 写 `notes/learnings/`
- "记一下/别忘了/记住" → 直接写 `inbox/`
- 每日凌晨 → 自动生成 `daily/YYYY-MM-DD.md`

### Obsidian vault 目录结构
```
obsidian/
├── .obsidian/           ← 配置（自动维护）
├── notes/               ← 知识主库（只读同步）
│   ├── decisions/       ← 决策记录
│   ├── designs/         ← 设计方案
│   ├── infrastructure/  ← 基础设施
│   ├── learnings/       ← 踩坑经验
│   ├── profile/         ← 个人档案
│   ├── projects/        ← 项目文档
│   └── templates/       ← 模板
├── daily/               ← 每日小结（自动生成）
├── inbox/               ← BOSS 草稿入口
└── assets/              ← 附件
```

## 影响
- BOSS 无需主动维护知识库
- 所有沉淀通过聊天自然完成
- 想回顾时打开 Obsidian，所有内容已就绪
