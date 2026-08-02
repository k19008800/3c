# 3cloud 项目文档

> **最后更新**: 2026-08-02
> **项目定位**: AI Token 聚合平台
> **当前状态**: 重构进行中（本地），生产服保留旧代码运行

---

## 项目概述

3Cloud (3C) 是一款 AI API 聚合平台，对接 DeepSeek、OpenAI、Anthropic、枭毅(OspreyAI)、LLMRouter、天翼云等多家模型供应商，为下游开发者/企业/代理商提供统一的 API 接入、Token 计费、智能路由和全链路运营管理能力。

---

## 项目架构

### 生产服（运行中）

| 项目 | 说明 |
|------|------|
| 生产服1（主） | 117.78.2.66 — 华为云 Ubuntu 22.04, 2C/1.7G/40G |
| 生产服2（备） | 123.60.55.62 — 华为云 |
| 阿里云 | 8.149.140.186（3cloud 实例 + iRedMail + TeslaMate）|
| 域名 | unmisa.com / api.unmisa.com / tokens.unmisa.com |
| Web 服务器 | Nginx 1.30（宝塔面板 :8888）|
| 数据库 | PostgreSQL 17 — `threecloud` |
| 缓存 | Redis 6 |
| 进程管理 | PM2 cluster |
| 证书 | HTTPS 已配置（至 2026-10-14）|

### 重构项目（本地开发中）

| 子系统 | 路径 | 端口 | 框架 |
|--------|------|------|------|
| 后端 API | `3cloud/api/` | `:3000` | Fastify 5 + DrizzleORM + BullMQ |
| 前端 Console | `3cloud/web-console/` | `:5175` | Vite 6 + React 19 (脚手架阶段) |
| 前端 Portal | `3cloud/web-portal/` | `:3100` | Next.js 15 App Router + SSR |
| 共享包 | `3cloud/packages/shared/` | — | 类型/枚举/常量 |
| E2E 测试 | `3cloud/e2e/` | — | Playwright |

**Git**: `git@github.com-3cloud:k19008800/3c.git` (133 commits, HEAD=438dbcb)
**数据库**: `threecloud_v2`（重构库）+ `threecloud`（旧生产库持续运行）
**CI**: GitHub Actions (test+lint+build+E2E)

---

## 功能完成度总览

### 生产服（旧版）— 可运行版本

> 旧代码已删除（2026-07-31），备份在 `3cloud-backup/`。生产服上保留旧代码和数据库继续运行。

**完整业务功能清单见**: `3cloud/docs/业务功能归总.md`

| 维度 | 数值 |
|------|------|
| 总功能模块 | 36 个子模块（§1~§33 + 辅助规范）|
| 总功能点 | ~550+ |
| 需求文档 | 140+ 文件（PRD/SPEC/ref/泳道图/手册）|
| 生产服 API 路由 | ~250+ |
| 生产服前端页面 | ~80+（用户端25 + 管理端43 + Portal 8 + 供应商5）|
| 生产服 DB 表 | ~70+（`threecloud` 库）|
| 泳道图（核心流程）| 6 份（充值/提现/实名/供应商/对账/晋升）|

### 重构项目 — 当前进展

**后端 Route 文件**: 38+ 文件（含 admin-*, me-*, auth, engine, proxy, vendor-self 等）
**已注册 route**: 7 个（health/engine/proxy/admin-monitoring/admin-rate-limit/auth/public）
**后端未注册 route**: 31+ `routes/*.ts` 文件存在但未挂载到 `index.ts`
**前端 Console**: 脚手架阶段（无 src/ 目录，无 UI 页面）
**前端 Portal**: 初始 SSR scaffold（首页/定价/模型/状态）

**详细缺口分析**: `3cloud/docs/gap/重构缺口分析.md`

---

## 需求文档体系

| 类型 | 数量 | 位置 |
|------|------|------|
| PRD 主文档 | 19 份 | `docs/PRD-*.md` |
| SPEC 规格文档 | 16 份 | `docs/SPEC-§*.md` |
| 深化参考文档 | 40+ 份 | `docs/ref-*.md` |
| 泳道图 | 6 份 | `docs/flowcharts/` |
| 运营手册 | 3 份 | `docs/ops-guide.md` / `ops-manual.md` |
| 数据字典 | 1 份 | `docs/data-dictionary.md` |
| API 参考 | 1 份 | `docs/api-reference.md` |
| 前端路由 | 1 份 | `docs/frontend-routes.md` |
| 测试用例 | 1 份 | `docs/test-cases.md`（180+ 用例）|
| Gap 分析 | 2 份 | `docs/gap/gap-analysis-report.md` + `重构缺口分析.md` |
| 边界条件 | 1 份 | `docs/boundary-supplement.md`（130 场景）|

---

## 常用路径

| 用途 | 路径 |
|------|------|
| 业务功能归总 | `3cloud/docs/业务功能归总.md` |
| 重构缺口分析 | `3cloud/docs/gap/重构缺口分析.md` |
| 架构方案 | `3cloud/docs/architecture.md` |
| 部署手册 | `3cloud/docs/ops-guide.md` |
| 运营手册 | `3cloud/docs/ops-manual.md` |
| API 参考 | `3cloud/docs/api-reference.md` |
| 知识库 | `3cloud/kb/` |
| 路由配置 | `3cloud/routing/routing-config.json` |
| 旧代码备份 | `3cloud-backup/` |

---

## 关键决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-07-31 | 删除全部旧代码，从零重构 | 代码腐烂严重，schema 不一致，编译错误多 |
| 2026-08-01 | 分阶段开发，生产服保留旧代码 | Phase 0-2 先本地验证，线上不影响 |
| 2026-08-02 | 确认 `threecloud` 旧数据库未删除 | 实测两个数据库并存 |
| 2026-08-02 | 业务功能归总完成 | `docs/业务功能归总.md` — 36 模块 ~550 功能点全覆盖 |
