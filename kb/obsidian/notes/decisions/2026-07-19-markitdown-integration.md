---
title: "MarkItDown 接入为文档转换工具"
date: 2026-07-19
tags: [arch-decision, tooling, document-processing]
aliases: [markitdown决策]
---

# MarkItDown 接入

## 背景

泥鳅的 `read` 工具只能处理纯文本文件（.txt、.md、源码），无法读取 PDF、Office 文档、EPUB、图片中的文字等二进制格式。

## 决策

集成 Microsoft MarkItDown 填补文档处理能力空白。

### 接入方式
- Python 库 `markitdown` 安装于系统 Python 3.14
- 自定义 wrapper 脚本 `bin/markitdown-wrapper.py`
- magika（文件类型检测 ML 模型）替换为轻量 mock：基于 mimetypes + 扩展名识别，避免安装 30MB+ onnxruntime

### 支持的格式（16 种）
PDF、DOCX、XLSX、PPTX、HTML、CSV、JSON、XML、EPUB、MSG、图片（OCR）、ZIP（递归）、Jupyter Notebook、RSS、Wikipedia、YouTube 转录

### 安装的依赖
pypdf / lxml / python-docx / openpyxl / python-pptx / Pillow / ebooklib / olefile / beautifulsoup4 / markdownify

### 所属 Skill
`skills/markitdown/SKILL.md`

## 使用方式

```powershell
python bin/markitdown-wrapper.py <文件路径>
# 输出：Markdown 文本到 stdout
```

## 影响
- 泥鳅现在可以处理任何格式的文档
- 可在 exec 工具调用中直接使用，输出结果直接喂给 LLM
- 对 BOSS 透明：以后发 PDF/Excel/Word 文件时，泥鳅可以直接读内容
