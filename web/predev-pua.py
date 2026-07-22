#!/usr/bin/env python3
"""Vite predev 检查：检测 PUA 字符腐烂"""
import os
import sys
import re

pua_pattern = re.compile(r'[\ue000-\uf8ff\ufffd\uff1f]')

errors = []
scanned = 0

for root, dirs, files in os.walk('src'):
    dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.git']]
    
    for f in files:
        if f.endswith(('.tsx', '.ts', '.jsx', '.js')):
            path = os.path.join(root, f)
            scanned += 1
            try:
                with open(path, 'r', encoding='utf-8') as fp:
                    content = fp.read()
                    matches = pua_pattern.findall(content)
                    if matches:
                        from collections import Counter
                        chars = Counter(matches)
                        errors.append(f"{path}: {len(matches)} PUA chars")
            except Exception as e:
                errors.append(f"{path}: read error")

if errors:
    print("\n[predev] PUA 字符检测失败:\n")
    for e in errors[:10]:  # 只显示前 10 个
        print(f"  {e}")
    if len(errors) > 10:
        print(f"  ... 还有 {len(errors) - 10} 个文件")
    print(f"\n扫描文件: {scanned}")
    print(f"问题文件: {len(errors)}")
    print("\n请运行: python ../fix-pua.py --fix")
    sys.exit(1)

print(f"[predev] PUA 检测通过 ({scanned} files)")
sys.exit(0)
