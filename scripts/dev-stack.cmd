@echo off
rem 强制 api 使用 3000（preview 工具会注入 PORT=5177，dotenv 不覆盖已存在变量导致 api 撞端口）
set PORT=3000
pnpm dev
