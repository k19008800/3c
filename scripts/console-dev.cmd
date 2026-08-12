@echo off
rem 单起 web-console dev server（5175）；api(3000)/portal(5177) 已由 dev-stack 运行
cd /d "%~dp0..\web-console"
pnpm dev
