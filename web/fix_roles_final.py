path = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\Roles.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix L52: 妯″瀷渚涘簲鍟 -> 模型供应商
content = content.replace('\u5ae0\u2033\u7058\u6e1a\u6fbc\u5e62\u935f', '\u6a21\u578b\u4f9b\u5e94\u5546')

# Fix L253: 用户?${ -> 用户"${
content = content.replace('\u7528\u6237\uff1f${', '\u7528\u6237"${')

# Scan for any other \uff1f characters that shouldn't be there
# A \uff1f before ${ is almost certainly wrong
import re
# Find all \uff1f that appears right before ${
matches = [(m.start(), m.group()) for m in re.finditer('\uff1f', content)]
for pos, m in matches:
    context_start = max(0, pos-40)
    context_end = min(len(content), pos+40)
    ctx = content[context_start:context_end]
    print(f"Pos {pos}: ...{repr(ctx)}...")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
