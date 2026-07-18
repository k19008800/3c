import os

files = [
    'src/routes/redemption/agent.ts',
    'src/routes/redemption/query.ts',
    'src/routes/auth/realname.ts',
    'src/routes/vendor-self/profile.ts',
    'src/routes/admin/campaigns/detail.ts',
    'src/routes/proxy/forward.ts',
]

for rel in files:
    full = os.path.join(os.getcwd(), rel)
    with open(full, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8', errors='replace')
    count = 0
    for li, line in enumerate(text.split('\n')):
        stripped = line.strip()
        if '//' in stripped:
            idx = stripped.index('//')
            after = stripped[idx+2:].strip()
            code_keywords = ['import ', 'const ', 'let ', 'var ', 'export ', 'function ', 'return ', 'async ', 'await db']
            for kw in code_keywords:
                if kw in after:
                    safe = stripped.encode('ascii', errors='replace').decode('ascii')
                    print(f'{rel}: L{li+1}: {safe[:100]}')
                    count += 1
                    break
    print(f'  Total: {count}')
