import os

# Find all remaining lines with U+FFFD in the error files
files = [
    'src/routes/redemption/query.ts',
    'src/routes/auth/realname.ts',
    'src/routes/vendor-self/profile.ts',
    'src/routes/redemption/redeem.ts',
    'src/routes/admin/campaigns/redemption.ts',
]

for rel in files:
    full = os.path.join(os.getcwd(), rel)
    with open(full, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8', errors='replace')
    
    ffd_count = text.count('\ufffd')
    
    if ffd_count == 0:
        print(f'{rel}: clean')
        continue
    
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if '\ufffd' in line:
            safe = line.strip().encode('ascii', errors='replace').decode('ascii')
            print(f'{rel}: L{i+1}: {safe[:100]}')
    print(f'  Total: {ffd_count} U+FFFD chars\n')
