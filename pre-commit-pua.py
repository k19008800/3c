#!/usr/bin/env python3
"""pre-commit hook: 检测 PUA 字符腐烂"""
import sys
import re

pua_pattern = re.compile(r'[\ue000-\uf8ff\ufffd]')

errors = []
for path in sys.argv[1:]:
    if path.endswith(('.tsx', '.ts', '.jsx', '.js')):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                matches = pua_pattern.findall(content)
                if matches:
                    from collections import Counter
                    chars = Counter(matches)
                    errors.append(f"{path}: {len(matches)} PUA chars {dict(chars)}")
        except Exception as e:
            errors.append(f"{path}: read error - {e}")

if errors:
    print("\n[ERROR] PUA 字符检测失败:\n")
    for e in errors:
        print(f"  {e}")
    print("\n请运行: python fix-pua.py --fix")
    sys.exit(1)

sys.exit(0)
