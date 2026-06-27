#!/usr/bin/env tsx
// ============================================================
//  3cloud (3C) — 入口文件
//  开发：npx tsx watch src/index.ts
//  生产：tsc && node dist/index.js
// ============================================================

import { startServer } from "./app.js";

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
