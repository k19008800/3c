import os

base = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin'

# Read Announcements.tsx
fn = 'Announcements.tsx'
with open(os.path.join(base, fn), 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    # Find all positions of the byte sequences that look like mojibake
    # by checking for non-standard CJK combinations
    for j, ch in enumerate(line):
        if ord(ch) > 0x4E00 and ord(ch) < 0x9FFF:
            pass  # Normal CJK
        elif ord(ch) > 0x3000 and ord(ch) < 0x303F:
            pass  # CJK punctuation
        elif ord(ch) in range(0xE000, 0xF900):
            pass  # PUA
        else:
            continue
