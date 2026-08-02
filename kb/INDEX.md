# 📚 知识库索引

> 最后更新：2026-07-12

---

## 目录结构

```
kb/
├── INDEX.md           ← 本文件：目录索引
├── profile/
│   └── boss.md        ← BOSS 全景画像
├── projects/
│   └── 3cloud.md      ← 3cloud 项目完整文档
├── decisions/          ← 重大决策记录
│   └── YYYY-MM-DD-*.md
├── infrastructure/     ← 基础设施
│   ├── credentials.md ← 🔐 密钥/凭据总表（单一速查入口）
│   ├── servers.md     ← 服务器清单
│   └── baota.md       ← 宝塔面板配置
├── learnings/          ← 踩坑和解决方案
│   └── YYYY-MM-DD-*.md
├── templates/          ← 常用文档模板
│   ├── decision.md     ← 决策记录模板
│   └── project.md      ← 项目记录模板
└── obsidian/           ← Obsidian 知识库
    ├── inbox/          ← 待整理
    ├── daily/          ← 日记
    ├── notes/          ← 笔记
    └── assets/         ← 附件
```

---

## 内容速览

| 文件 | 内容概要 | 敏感度 |
|------|----------|--------|
| `profile/boss.md` | BOSS 个人属性、技能、偏好、习惯 | 🔵 低 |
| `projects/3cloud.md` | 项目架构、模块清单（28+项）、部署、编码腐烂修复记录 | 🟡 中 |
| `infrastructure/credentials.md` | **所有密钥/密码/Token 总表** | 🔴 **高** |
| `infrastructure/servers.md` | 服务器 IP、SSH、域名 | 🔴 **高（含密钥路径）** |
| `infrastructure/baota.md` | 宝塔面板地址/账号 | 🔴 **高** |
| `learnings/sidebar-route-mismatch.md` | Sidebar 链接/路由成对出现规则 | 🟡 中 |
| `learnings/llmrouter-proxy-config.md` | LLMRouter 代理配置踩坑 | 🟡 中 |
| `learnings/ollama-distilled-models-no-fc.md` | Ollama 蒸馏小模型不支持 Function Calling | 🟡 中 |
