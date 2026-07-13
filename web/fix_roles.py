import os

path = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\Roles.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix: title with mojibake - the '?' replaces closing "
# Original: title="绉婚櫎姝よ鑹?
c = c.replace('title="\u7ee1\u5a5a\u6b66\u3088\u9453?', 'title="移除该角色"')
if 'title="绉婚櫎姝よ鑹?' in c:
    c = c.replace('title="绉婚櫎姝よ鑹?', 'title="移除该角色"')

# Fix: 路 and 鍒嗛厤 in date display
# Pattern: ` 路 ${...} 鍒嗛厤`
c = c.replace('\u8def ${ru.assignedAt', '路 ${ru.assignedAt')
c = c.replace('\u92cd\u5206\u914d', '分配')
c = c.replace(' 鍒嗛厤`', ' 分配`')

# Fix: half-width box-drawing chars in comments
c = c.replace('\u9479\u20ac\u9479\u20ac', '──')
c = c.replace('\u2534', '──')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Roles.tsx fixed')
