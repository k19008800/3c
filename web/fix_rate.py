import os

base = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin'
fn = 'RateLimits.tsx'
fpath = os.path.join(base, fn)

with open(fpath, 'rb') as f:
    data = f.read()

# Additional fixes for RateLimits.tsx
more_fixes = {
    # unit="Token/鍒? should be unit="Token/分"
    '鍏ㄥ眬 TPM'.encode('utf-8'): '全局 TPM'.encode('utf-8'),
    '鍒?'.encode('utf-8'): '分"'.encode('utf-8'),  # ?=FF1F replacing closing "
}

for old_bytes, new_bytes in more_fixes.items():
    if old_bytes in data:
        data = data.replace(old_bytes, new_bytes)
        print(f'Fixed: {old_bytes.decode("utf-8", errors="replace")[:20]}')

with open(fpath, 'wb') as f:
    f.write(data)
print('Done')
