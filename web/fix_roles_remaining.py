import re

path = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\Roles.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Known mojibake strings and their fixes (context-based)
fixes = [
    # L243
    ("'鍒嗛厤澶辫触'", "'分配失败'"),
    ("绉婚櫎姝よ鑹诧紵", "移除该角色？"),
    # L264
    ("'绉婚櫎澶辫触'", "'移除失败'"),
    # L348
    ("'璇疯緭鍏ヨ鑹叉爣璇'", "'请输入角色标签'"),
    # L368
    ("'角色宸叉洿鏂'", "'角色已更新'"),
    # L750 (分配 text)
    ("鍒嗛厤", "分配"),
]

count = 0
for old, new in fixes:
    if old in c:
        c = c.replace(old, new)
        count += 1
        print(f"Fixed: {old[:30]}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print(f"Total fixes: {count}")
