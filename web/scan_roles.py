import re

path = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\Roles.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

moji_patterns = ['鑹', '鍒', '鏂', '鏃', '缁', '鎴', '鏉', '鐩', '绉', '鎾', '閿', '闂', '渚', '畾', '涔', '寋', '寮', '屽', '簲', '亼', '劧']

for i, line in enumerate(lines, 1):
    s = line.strip()
    found = False
    for pat in moji_patterns:
        if pat in s:
            if not found:
                print(f'L{i} [MOJI]: {s[:120]}')
                found = True
    if '\uff1f' in s:
        print(f'L{i} [FF1F]: {s[:120]}')
    if '\ufffd' in s:
        print(f'L{i} [REPLACEMENT]: {s[:120]}')

print('=== Scan complete ===')
