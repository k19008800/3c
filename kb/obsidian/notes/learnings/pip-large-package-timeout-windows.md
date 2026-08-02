---
title: "Windows pip 下载大包容易超时断连"
date: 2026-07-19
tags: [learning, windows, pip]
---

# pip 大包下载超时

## 场景
安装 `onnxruntime`（13.7MB wheel）、`lxml`（4.1MB wheel）、`Pillow`（7.2MB wheel）时，`pip install` 多次被 SIGKILL。

## 原因
- 某些网络环境下，pip 下载大文件容易因超时断连（`yieldMs` 默认 10s 不够）
- 多个包一次性安装时，总下载量 > 30MB，`timeout` 参数需要给够

## 解决方案
1. **分包安装**：一次只装一个包，避免多个大包并发下载
   ```powershell
   pip install pypdf          # OK
   pip install lxml           # 大包，单装
   pip install python-docx    # 依赖 lxml，需先装好
   ```
2. **避免 onnxruntime**：`magika` 依赖 onnxruntime（~30MB），用 mock 替代
   - 创建一个简单 Magika 类，基于 `mimetypes.guess_type()` 识别文件
   - 足够 markitdown 日常使用
3. **如确需大包**：用 `--timeout 300` 或换个下载源
