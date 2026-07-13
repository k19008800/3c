import re

path = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\Roles.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

replacements = [
    # '鍒涘缓鏂拌鑹? : ' should be '创建新角色' : '
    ("'鍒涘缓鏂拌鑹? : '编辑角色'", "'创建新角色' : '编辑角色'"),
    # Fix remaining ? -> ' patterns (fullwidth question mark used as apostrophe)
]

for old, new in replacements:
    if old in c:
        c = c.replace(old, new)
        print(f'Fixed: {old[:20]}...')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
