import subprocess, os

ROOT = os.getcwd()

# Check login.ts at line 63
f = os.path.join(ROOT, 'src/routes/auth/login.ts')
with open(f, 'rb') as fh:
    data = fh.read()

# Find "继续登录"
idx = data.find('继续登录'.encode('utf-8'))
if idx >= 0:
    print(f'Found "继续登录" at byte {idx}')
    # Show bytes around it
    start = max(0, idx - 20)
    end = min(len(data), idx + 50)
    print(f'Bytes: {data[start:end].hex(" ")}')
    print(f'Hex: {" ".join(f"{b:02x}" for b in data[start:end])}')
    print(f'GBK: {data[start:end].decode("gbk", errors="replace")}')

# Find all unterminated string patterns
text = data.decode('utf-8', errors='replace')
lines = text.split('\n')
for li, line in enumerate(lines):
    # Check if message: or similar has opening but no closing quote
    for kw in ['message:', 'detail:', 'note:', 'error:']:
        if kw in line:
            # Count quotes
            q_count = line.count('"')
            if q_count % 2 != 0:
                print(f'Line {li+1}: unbalanced quotes ({q_count})')
                print(f'  Raw: {repr(line[:120])}')
