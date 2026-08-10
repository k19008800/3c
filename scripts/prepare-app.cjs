#!/usr/bin/env node
/**
 * prepare-app — 把 web-console 构建产物部署到 web-portal 静态托管
 *
 * 背景：前端收敛后 web-portal(5177) 直接静态托管 web-console（不再依赖 Vite dev server 5175）。
 * 本脚本：build web-console → 拷贝 dist → web-portal/public/app/
 *
 * 用法：node scripts/prepare-app.cjs（pnpm dev 的 predev 会自动调用）
 * 说明：web-portal 的 next.config.mjs 对 /app/* 做了 SPA fallback（→/app/index.html），
 *       静态文件（public/）优先于 rewrite 命中，assets 走真实文件。
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const consoleDist = path.join(root, "web-console", "dist");
const portalPublicApp = path.join(root, "web-portal", "public", "app");

function main() {
  console.log("🔨 [prepare-app] 构建 web-console...");
  execSync("pnpm --filter web-console build", { cwd: root, stdio: "inherit" });

  console.log("📦 [prepare-app] 拷贝 dist → web-portal/public/app/ ...");
  fs.rmSync(portalPublicApp, { recursive: true, force: true });
  fs.mkdirSync(portalPublicApp, { recursive: true });
  fs.cpSync(consoleDist, portalPublicApp, { recursive: true });

  console.log(`✅ [prepare-app] 完成 → ${path.relative(root, portalPublicApp)}`);
}

main();
