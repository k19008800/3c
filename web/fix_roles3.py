import sys

path = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\Roles.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Find all occurrences of FULLWIDTH QUESTION MARK (U+FF1F) used as apostrophe
# Pattern: 'mojibake?' where ?(U+FF1F) should be '(U+0027)
count = c.count('\uff1f')
print(f"Found {count} U+FF1F characters")

# Scan context around each U+FF1F
idx = 0
fixes = []
while True:
    idx = c.find('\uff1f', idx)
    if idx == -1:
        break
    start = max(0, idx-30)
    end = min(len(c), idx+10)
    snippet = c[start:end]
    fixes.append((idx, repr(snippet)))
    idx += 1

for pos, snippet in fixes:
    print(f"  Pos {pos}: {snippet}")

# Fix specific known issues by context
# 1. '鍒涘缓鏂拌鑹? : '编辑角色'  ->  '创建新角色' : '编辑角色'
# 2. '请输入搜索条件? : '无匹配用户'  ->  '请输入搜索条件' : '无匹配用户'
c = c.replace("'鍒涘缓鏂拌", "'创建新角")
c = c.replace("繖? : '编辑角色'", "色' : '编辑角色'")

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
