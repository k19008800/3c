INPUT = r'C:/Users/ZH/.openclaw/workspace/3cloud/web/src/pages/admin/Stats.tsx'
with open(INPUT, 'r', encoding='utf-8') as f:
    content = f.read()

# Known corrupt character set from GBK mojibake  
moji_chars = '鎴愬姛澶辫触鎬昏皟鐢ㄦ鎺掕閰嶇疆鍒楄〃璁＄畻鏈嶅姟宸ヨ繘搴﹀彉鎴忓叧寮傚寲鏁扮粺璁℃帓鏃堕棿涓㈤樀鍒楀㈡埛寤惰繜'
lines = content.split('\n')
remaining = []
for i, line in enumerate(lines, 1):
    for ch in line:
        if ch in moji_chars:
            remaining.append(i)
            break

print(f'Remaining corrupted lines: {len(remaining)}')
out_lines = []
for ln in remaining:
    out_lines.append(f'L{ln}: {lines[ln-1][:130]}')

# Write to a file for inspection
with open('remaining2.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out_lines))
print('Written to remaining2.txt')
