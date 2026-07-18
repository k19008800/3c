"""
Find all dangling .select({ patterns (missing 'const [xxx] = await db' header)
in refactored files, and fix them using the original git source.
"""
import os, subprocess, re

ROOT = os.getcwd()

FILES = [
    'src/routes/auth/realname.ts',
    'src/routes/auth/register.ts',
    'src/routes/vendor-self/profile.ts',
    'src/routes/redemption/redeem.ts',
    'src/routes/redemption/query.ts',
    'src/routes/admin/campaigns/detail.ts',
    'src/routes/admin/campaigns/redemption.ts',
    'src/routes/admin/finance/codes/handlers/agent-settlement.ts',
    'src/routes/admin/finance/codes/handlers/cost-detail.ts',
    'src/routes/admin/finance/codes/handlers/cost-overview.ts',
    'src/routes/admin/redemption-enhanced/batch-action.ts',
    'src/routes/admin/redemption-enhanced/export.ts',
]

for rel in FILES:
    full = os.path.join(ROOT, rel)
    if not os.path.exists(full):
        print(f'[MISS] {rel}')
        continue
    
    with open(full, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8', errors='replace')
    lines = text.split('\n')
    
    # Find dangling .select({ (preceded by comment or nothing, not by db or await db)
    fixes = []
    for i, line in enumerate(lines):
        s = line.strip()
        if not (s.startswith('.select({') or s.startswith('.select(')):
            continue
        
        prev = i - 1
        while prev >= 0 and lines[prev].strip() == '':
            prev -= 1
        
        prev_s = lines[prev].strip() if prev >= 0 else ''
        prev2 = prev - 1
        while prev2 >= 0 and lines[prev2].strip() == '':
            prev2 -= 1
        prev2_s = lines[prev2].strip() if prev2 >= 0 else ''
        
        is_valid = (
            prev_s.endswith('await db') or 
            prev_s.endswith('await db;') or 
            prev_s.endswith('= db') or 
            (prev_s.endswith('db') and '= db' not in prev_s and prev_s != 'db') or
            prev_s.startswith('.from(') or
            prev_s.startswith('.leftJoin(') or
            prev_s.startswith('.where(') or
            prev_s.startswith('.orderBy(') or
            prev_s.startswith('.limit(') or
            prev_s.startswith('.offset(') or
            prev_s.startswith('.groupBy(') or
            prev_s.startswith('.having(') or
            prev_s.endswith(',')  # continuation of a select chain
        )
        
        if not is_valid and not prev_s.startswith('//'):
            # Might have a comment that should be followed by code
            pass
        
        if not is_valid:
            print(f'{rel}: L{i+1}: dangling .select, prev: \"{prev_s[:60]}\"')
    
    print()
