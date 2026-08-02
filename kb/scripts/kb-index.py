#!/usr/bin/env python3
"""
KB Vector Indexer — 知识库向量索引构建

使用 ChromaDB 将 kb/ 和 memory/ 的 Markdown 文件构建向量索引。
支持增量更新和全文搜索。

用法:
  python kb/scripts/kb-index.py              # 全量索引
  python kb/scripts/kb-index.py --update     # 增量更新
  python kb/scripts/kb-index.py --query "xxx" # 搜索
  python kb/scripts/kb-index.py --stats      # 索引统计
"""

import os
import sys
import re
import json
import time
import hashlib
from pathlib import Path
from datetime import datetime

WORKSPACE = Path(__file__).resolve().parent.parent.parent
KB_DIR = WORKSPACE / "kb"
MEMORY_DIR = WORKSPACE / "memory"
DB_DIR = WORKSPACE / "kb" / ".vector_index"
STATE_FILE = DB_DIR / "index_state.json"


def get_chunks(text: str, source_path: str, max_chars: int = 800) -> list:
    """将 Markdown 文本分块，按标题切割，每块不超过 max_chars"""
    lines = text.split("\n")
    chunks = []
    current_section = "(前言)"
    current_lines = []
    current_chars = 0

    def flush():
        nonlocal current_lines, current_chars
        if current_lines:
            content = "\n".join(current_lines).strip()
            if len(content) > 20:  # 忽略过短的块
                chunk_id = hashlib.md5(f"{source_path}:{current_section}:{content[:50]}".encode()).hexdigest()[:12]
                chunks.append({
                    "id": chunk_id,
                    "content": content,
                    "source": str(source_path),
                    "section": current_section,
                    "chars": len(content)
                })
            current_lines = []
            current_chars = 0

    for line in lines:
        if line.startswith("## ") or line.startswith("### "):
            flush()
            current_section = line.replace("#", "").strip()
            current_lines.append(line)
            current_chars += len(line)
        elif line.startswith("---"):
            flush()
        else:
            current_lines.append(line)
            current_chars += len(line)
            if current_chars >= max_chars and not line.strip():
                flush()

    flush()
    return chunks


def scan_md_files(dirs, max_files=500):
    """扫描目录获取所有 md 文件"""
    files = []
    for d in dirs:
        if not d.exists():
            continue
        for f in sorted(d.rglob("*.md")):
            # 只跳过文件名或直接父目录以点开头的（隐藏文件/目录）
            if f.name.startswith("."):
                continue
            # 跳过 .vector_index 等点开头的目录
            if any(p.startswith(".") and p != "." for p in f.relative_to(d).parts):
                continue
            files.append(f)
            if len(files) >= max_files:
                break
    return files


def get_file_hash(path: Path) -> str:
    """获取文件内容的快速哈希"""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
        return hashlib.md5(content.encode()).hexdigest()
    except Exception as e:
        print(f"  ⚠️  无法读取 {path.name}: {e}")
        return None


def cmd_index(update=False):
    """构建或更新向量索引"""
    print(f"\n{'='*50}")
    print(f"  📚 知识库向量索引")
    print(f"  模式: {'增量更新' if update else '全量重建'}")
    print(f"{'='*50}\n")

    # 加载状态
    state = {"files": {}, "chunks": 0, "last_index": None}
    if update and STATE_FILE.exists():
        try:
            state = json.loads(STATE_FILE.read_text())
        except:
            pass

    # 扫描文件
    files = scan_md_files([KB_DIR, MEMORY_DIR])
    print(f"  发现 {len(files)} 个 Markdown 文件")

    # 检查变更
    changed_files = []
    new_files = []
    for f in files:
        rel = f.relative_to(WORKSPACE)
        fhash = get_file_hash(f)
        if fhash is None:
            continue
        if str(rel) not in state["files"]:
            new_files.append(f)
        elif state["files"][str(rel)] != fhash:
            changed_files.append(f)

    if not new_files and not changed_files:
        print(f"  ✅ 无需更新，所有文件索引已是最新")
        print(f"  索引统计: {state.get('chunks', 0)} 个分块")
        return state

    total = len(new_files) + len(changed_files)
    print(f"  待处理: 新增 {len(new_files)} 个, 变更 {len(changed_files)} 个")

    # 分块处理
    all_chunks = []
    for f in new_files + changed_files:
        rel = f.relative_to(WORKSPACE)
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
            chunks = get_chunks(text, str(rel))
            all_chunks.extend(chunks)
            state["files"][str(rel)] = get_file_hash(f)
        except Exception as e:
            print(f"  ⚠️  分块失败 {rel}: {e}")

    # 保存索引
    DB_DIR.mkdir(parents=True, exist_ok=True)
    
    # 保存为 JSON（ChromaDB 就绪后迁移到向量库）
    index_file = DB_DIR / "chunks.json"
    
    # 合并已有数据
    existing_chunks = []
    if update and index_file.exists():
        try:
            existing = json.loads(index_file.read_text(encoding="utf-8"))
            # 去掉已变更文件的旧块
            changed_keys = {str(f.relative_to(WORKSPACE)) for f in changed_files}
            existing_chunks = [c for c in existing if c["source"] not in changed_keys]
        except:
            pass

    # 更新状态
    if update:
        # 移除已删除的文件
        current_files = {str(f.relative_to(WORKSPACE)) for f in files}
        state["files"] = {k: v for k, v in state["files"].items() if k in current_files}

    state["chunks"] = len(existing_chunks) + len(all_chunks)
    state["last_index"] = datetime.now().isoformat()

    # 写入
    all_final = existing_chunks + all_chunks
    index_file.write_text(
        json.dumps(all_final, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\n  ✅ 索引完成!")
    print(f"  总文件: {len(state['files'])}")
    print(f"  总分块: {state['chunks']}")
    print(f"  索引文件: {index_file}")
    print()

    return state


def cmd_query(query: str):
    """搜索知识库（关键词搜索）"""
    index_file = DB_DIR / "chunks.json"
    if not index_file.exists():
        print("❌ 索引不存在，请先运行 kb-index.py")
        return

    chunks = json.loads(index_file.read_text(encoding="utf-8"))
    print(f"\n{'='*50}")
    print(f"  🔍 搜索: {query}")
    print(f"  索引大小: {len(chunks)} 个分块")
    print(f"{'='*50}\n")

    # 简单关键词搜索（后续可升级为向量搜索）
    query_lower = query.lower()
    query_words = query_lower.split()

    results = []
    for chunk in chunks:
        content_lower = chunk["content"].lower()
        # 匹配所有关键词
        matches = sum(1 for w in query_words if w in content_lower)
        if matches > 0:
            # 提取匹配上下文
            score = matches / len(query_words)
            results.append({
                "score": score,
                "source": chunk["source"],
                "section": chunk["section"],
                "snippet": chunk["content"][:200].replace("\n", " ").strip()
            })

    # 排序
    results.sort(key=lambda r: r["score"], reverse=True)
    results = results[:10]

    if not results:
        print("  📭 未找到匹配结果\n")
        return

    print(f"  找到 {len(results)} 条结果:\n")
    for i, r in enumerate(results, 1):
        print(f"  [{i}] 📄 {r['source']}  →  {r['section']}")
        print(f"      匹配度: {r['score']:.0%}")
        print(f"      {r['snippet'][:120]}...")
        print()


def cmd_stats():
    """索引统计"""
    index_file = DB_DIR / "chunks.json"
    state_file = STATE_FILE

    print(f"\n{'='*50}")
    print(f"  📊 索引统计")
    print(f"{'='*50}\n")

    if state_file.exists():
        state = json.loads(state_file.read_text())
        print(f"  最后索引: {state.get('last_index', 'N/A')}")
        print(f"  文件数:   {len(state.get('files', {}))}")
        print(f"  分块数:   {state.get('chunks', 0)}")
    else:
        print(f"  📭 无索引状态")

    if index_file.exists():
        chunks = json.loads(index_file.read_text(encoding="utf-8"))
        total_chars = sum(c["chars"] for c in chunks)
        print(f"  总字符:   {total_chars:,}")
        
        # 按来源分类
        from collections import Counter
        sources = Counter(c["source"] for c in chunks)
        print(f"\n  按来源:")
        for src, count in sources.most_common(10):
            print(f"    {src}: {count} 块")
    else:
        print(f"  📭 无索引数据")

    print()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "--index"
    
    if cmd == "--index":
        cmd_index(update=False)
    elif cmd == "--update":
        cmd_index(update=True)
    elif cmd == "--query":
        if len(sys.argv) < 3:
            print("用法: kb-index.py --query '搜索词'")
            sys.exit(1)
        cmd_query(" ".join(sys.argv[2:]))
    elif cmd == "--stats":
        cmd_stats()
    elif cmd == "--help":
        print(__doc__)
    else:
        print(f"未知命令: {cmd}")
        print(__doc__)
