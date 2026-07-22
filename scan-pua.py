#!/usr/bin/env python3
"""扫描 TSX/TS 文件中的 PUA 字符和编码腐烂"""
import os
import re
from collections import Counter

# PUA 字符范围 + 常见腐烂字符
# U+E000-U+F8FF：私用区
# U+FFFD：替换字符（�）
# U+FF1F：全角问号（？）
pua_pattern = re.compile(r'[\ue000-\uf8ff\ufffd\uff1f]')

# 中文 PUA 映射（常见腐烂模式）
pua_chinese_map = {
    '\ue17b': '的',  # 常见替换
    '\ue17c': '是',
    '\ue17d': '在',
    '\ue17e': '了',
    '\ue17f': '和',
}

results = []
scanned = 0

for root, dirs, files in os.walk('.'):
    # 跳过无关目录
    dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.git', '.vite', '__pycache__']]
    
    for f in files:
        if f.endswith(('.tsx', '.ts', '.jsx', '.js')):
            path = os.path.join(root, f)
            scanned += 1
            try:
                with open(path, 'r', encoding='utf-8') as fp:
                    content = fp.read()
                    matches = pua_pattern.findall(content)
                    if matches:
                        char_counts = Counter(matches)
                        first_match = pua_pattern.search(content)
                        line_num = content[:first_match.start()].count('\n') + 1
                        col_num = first_match.start() - content[:first_match.start()].rfind('\n')
                        
                        # 提取上下文（只保留 ASCII）
                        lines = content.split('\n')
                        context = lines[line_num - 1] if line_num <= len(lines) else ''
                        # 只保留 ASCII 可打印字符
                        context_clean = ''.join(c if 32 <= ord(c) < 127 else '?' for c in context[:100])
                        
                        results.append({
                            'path': path,
                            'count': len(matches),
                            'chars': dict(char_counts),
                            'line': line_num,
                            'col': col_num,
                            'context': context_clean
                        })
            except UnicodeDecodeError:
                # 二进制文件或编码问题
                pass
            except Exception as e:
                print(f"Error reading {path}: {e}")

# 输出结果
print(f"扫描文件: {scanned}")
print(f"发现问题文件: {len(results)}\n")
print("=" * 80)

if results:
    for r in sorted(results, key=lambda x: -x['count']):
        print(f"\n文件: {r['path']}")
        print(f"  PUA 字符数: {r['count']}")
        print(f"  首次出现: L{r['line']}C{r['col']}")
        # 字符代码点显示
        chars_display = {f"U+{ord(k):04X}": v for k, v in r['chars'].items()}
        print(f"  字符分布: {chars_display}")
        print(f"  上下文: {r['context'][:80]}")
else:
    print("\n✅ 未发现 PUA/腐烂字符")

# 输出汇总
if results:
    print("\n" + "=" * 80)
    print("\n汇总统计:")
    total_chars = Counter()
    for r in results:
        total_chars.update(r['chars'])
    print(f"  总 PUA 字符数: {sum(total_chars.values())}")
    print(f"  字符分布: {dict(total_chars)}")
