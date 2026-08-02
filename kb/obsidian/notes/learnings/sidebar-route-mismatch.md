---
title: "Sidebar Route Mismatch"
date: 2026-07-25
tags: [learning]
---
# 侧边栏链接与路由不匹配 Bug 记录

> 记录时间：2026-07-09
> 触发场景：访问 `/agent/notifications` 页面空白

## Bug 现象

访问 `http://localhost:5175/agent/notifications` 时，页面显示空白（只渲染了 `<div id="root"></div>`，无子组件）。

## 根因分析

**侧边栏（`Sidebar.tsx`）新增了链接，但 `App.tsx` 中忘记添加对应的 `<Route>`。**

具体链路：

1. `Sidebar.tsx` 第 109 行定义了 agent 侧边栏菜单项：
   ```
   { to: '/agent/notifications', icon: Bell, label: '通知中心', roles: ['agent'] }
   ```
2. `App.tsx` 中已存在通用的通知路由：
   ```
   <Route path="notifications" element={<Notifications />} />
   ```
3. 但 **agent 路由区域缺少**对应的 `agent/notifications` 路由配置。

React Router 找不到匹配路由 → Outlet 渲染空内容 → 页面空白。

## 根本模式

**每次在 `Sidebar.tsx` 中新增一个 `to: '/xxx'` 链接，都必须在 `App.tsx` 中添加对应的 `<Route>`，两者必须成对出现。**

侧边栏是"导航入口"，路由是"目的地"，遗漏任何一处都会导致该导航项点击后页面空白。

## 修复方法

在 `App.tsx` 的 agent 路由区域添加：

```tsx
<Route path="agent/notifications" element={<Notifications />} />
```

`Notifications` 组件本身是通用组件（调用 `/api/v1/auth/notifications` 接口），所有角色共用，无需新建页面。

## 预防措施

1. **习惯建立**：每次新增/修改 `Sidebar.tsx -> to` 路径后，立即在 `App.tsx` 中确认存在对应的 `<Route>`
2. **同一 PR/提交中完成**：侧边栏 + 路由 + 页面组件三者不可分割，禁止分多次提交
3. **快速验证**：新增路由后，直接在浏览器访问该路径确认页面正常渲染

## 全量检查（2026-07-09）

已逐行核对 `Sidebar.tsx` 中所有 70+ 个导航链接 vs `App.tsx` 中所有路由：

| 分组 | 侧边栏链接数 | 路由定义数 | 差异 |
|------|------------|-----------|------|
| 消费者 | 14 | 14 | ✅ 全部匹配 |
| 管理端 | 28 | 28 | ✅ 全部匹配 |
| 代理商 | 7 | 7（修复后）| ✅ 已修复 |

仅发现 `/agent/notifications` 一处遗漏。
