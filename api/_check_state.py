import os

files = [
    'src/routes/redemption/agent.ts',
    'src/routes/redemption/query.ts',
    'src/routes/auth/realname.ts',
    'src/routes/vendor-self/profile.ts',
]

for f in files:
    full = os.path.join(os.getcwd(), f)
    with open(full, 'rb') as fh:
        raw = fh.read()
    
    try:
        text = raw.decode('utf-8')
        ok = True
    except UnicodeDecodeError as e:
        print(f'{f}: INVALID UTF-8 at byte {e.start}')
        continue
    
    ffd_count = text.count('\ufffd')
    print(f'{f}: valid UTF-8, {ffd_count} U+FFFD chars')
    
    # Find unbalanced double quotes
    for li, line in enumerate(text.split('\n')):
        q = line.count('"')
        if q % 2 != 0:
            print(f'  L{li+1}: unbalanced " ({q}): {line.strip()[:80]}')
        
        bt = line.count('`')
        if bt % 2 != 0:
            print(f'  L{li+1}: unbalanced ` ({bt}): {line.strip()[:80]}')
