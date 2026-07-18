#!/usr/bin/env python3
"""
Final fix: repair remaining U+FFFD corruption in refactored files
by cross-referencing against the git HEAD original source.
"""
import os, subprocess, re

ROOT = os.getcwd()

SOURCE_MAP = {
    'src/routes/admin/campaigns/detail.ts': 'api/src/routes/admin/campaigns.ts',
    'src/routes/admin/campaigns/redemption.ts': 'api/src/routes/admin/campaigns.ts',
    'src/routes/admin/finance/codes/handlers/agent-settlement.ts': 'api/src/routes/admin/finance/codes.ts',
    'src/routes/admin/finance/codes/handlers/cost-detail.ts': 'api/src/routes/admin/finance/codes.ts',
    'src/routes/admin/finance/codes/handlers/cost-overview.ts': 'api/src/routes/admin/finance/codes.ts',
    'src/routes/admin/redemption-enhanced/audit-logs.ts': 'api/src/routes/admin/redemption-enhanced.ts',
    'src/routes/admin/redemption-enhanced/batch-action.ts': 'api/src/routes/admin/redemption-enhanced.ts',
    'src/routes/admin/redemption-enhanced/export.ts': 'api/src/routes/admin/redemption-enhanced.ts',
    'src/routes/admin/redemption-enhanced/reports.ts': 'api/src/routes/admin/redemption-enhanced.ts',
    'src/routes/admin/redemption-enhanced/risk-action.ts': 'api/src/routes/admin/redemption-enhanced.ts',
    'src/routes/redemption/agent.ts': 'api/src/routes/redemption.ts',
    'src/routes/redemption/query.ts': 'api/src/routes/redemption.ts',
    'src/routes/redemption/redeem.ts': 'api/src/routes/redemption.ts',
}

for cr_path, orig_git in SOURCE_MAP.items():
    full = os.path.join(ROOT, cr_path)
    
    # Read current file
    with open(full, 'rb') as f:
        curr = f.read()
    
    text = curr.decode('utf-8', errors='replace')
    
    if '\ufffd' not in text:
        print(f'[CLEAN] {cr_path}')
        continue
    
    # Get original   
    res = subprocess.run(['git', 'show', f'HEAD:{orig_git}'], capture_output=True)
    if res.returncode != 0:
        print(f'[SKIP] {cr_path}: cannot get original')
        continue
    orig = res.stdout.decode('utf-8')
    orig_lines = orig.split('\n')
    
    lines = text.split('\n')
    fixed = []
    fix_count = 0
    unfixed = 0
    
    for li, line in enumerate(lines):
        if '\ufffd' not in line:
            fixed.append(line)
            continue
        
        # Get the clean part of this line
        # Remove U+FFFD to get the "skeleton"
        skeleton = line.replace('\ufffd', '')
        
        # Try same line number
        if li < len(orig_lines):
            ol = orig_lines[li]
            # Check if skeleton matches original's skeleton
            if skeleton == ol.replace('\ufffd', ''):
                fixed.append(ol)
                fix_count += 1
                continue
        
        # Try finding by significant substrings
        # Extract ASCII parts (identifiers, operators, etc.)
        ascii_parts = re.findall(r'[\x20-\x7e]{6,}', skeleton)
        found = False
        for part in sorted(ascii_parts, key=len, reverse=True):
            if len(part) < 10:
                continue
            for ol in orig_lines:
                if part in ol and '\ufffd' not in ol:
                    fixed.append(ol)
                    found = True
                    fix_count += 1
                    break
            if found:
                break
        
        if not found:
            fixed.append(line)
            unfixed += 1
    
    result = '\n'.join(fixed)
    
    # Verify it's valid UTF-8
    try:
        result.encode('utf-8').decode('utf-8')
        with open(full, 'w', encoding='utf-8') as f:
            f.write(result)
        print(f'[OK] {cr_path}: fixed {fix_count}, unfixed {unfixed}')
    except:
        print(f'[FAIL] {cr_path}: result not valid UTF-8')
