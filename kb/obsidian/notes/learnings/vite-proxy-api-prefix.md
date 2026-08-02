---
title: "Vite Proxy Api Prefix"
date: 2026-07-25
tags: [learning]
---
# Vite proxy `/api` 前缀误拦截 `/api-keys` SPA 路由

**日期：** 2026-07-12

---

## 问题

Vite 配置了 proxy 将 `/api` 开头的请求转发到后端 `localhost:3000`：

```ts
proxy: {
  '/api': {           // ← 问题在这
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
},
```

但 Vite 的 `picomatch` 模式匹配中，`/api` 前缀匹配包括 `/api`、`/api/xxx`、**`/api-keys`** 等所有以 `/api` 开头的路径。

导致：
- SPA 路由 `/api-keys` 的页面请求被 Vite 抓去转发到 API 后端
- API 后端返回 `404 Route GET:/api-keys not found`
- 页面显示为 JSON 文本而不是 SPA HTML

## 修复

将 proxy 前缀从 `/api` 改为 `/api/`：

```ts
proxy: {
  '/api/': {          // ← 仅匹配 /api/xxx，不匹配 /api-keys
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
},
```

## 受影响

- `/api-keys` 页面
- 理论上任何以 `/api` 开头的 SPA 路由（但目前只有 `/api-keys`）

## 教训

Vite proxy 的字符串前缀匹配过于宽泛。如果希望只匹配 `/api/*` 路径，必须在规则中使用 `/api/`（带斜杠后缀），而不是 `/api`。
