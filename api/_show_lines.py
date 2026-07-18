import os

f = os.path.join(os.getcwd(), 'src/routes/admin/campaigns/detail.ts')
with open(f, 'rb') as fh:
    raw = fh.read()

try:
    text = raw.decode('utf-8')
    lines = text.split('\n')
    for i in range(139, min(155, len(lines))):
        line = lines[i]
        # Clean for display
        safe = line.encode('ascii', errors='replace').decode('ascii')
        print(f'L{i+1}: {safe[:80]}')
except UnicodeDecodeError as e:
    print(f'UTF-8 error at byte {e.start}')
