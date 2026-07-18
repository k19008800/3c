import os

files = [
    'src/routes/redemption/agent.ts',
    'src/routes/redemption/query.ts',
    'src/routes/redemption/redeem.ts',
    'src/routes/auth/realname.ts',
    'src/routes/auth/register.ts',
    'src/routes/vendor-self/profile.ts',
    'src/routes/admin/campaigns/detail.ts',
    'src/routes/admin/campaigns/redemption.ts',
    'src/routes/admin/finance/codes/handlers/agent-settlement.ts',
    'src/routes/admin/finance/codes/handlers/cost-detail.ts',
    'src/routes/admin/finance/codes/handlers/cost-overview.ts',
    'src/routes/admin/redemption-enhanced/audit-logs.ts',
    'src/routes/admin/redemption-enhanced/batch-action.ts',
    'src/routes/admin/redemption-enhanced/export.ts',
    'src/routes/admin/redemption-enhanced/reports.ts',
    'src/routes/admin/redemption-enhanced/risk-action.ts',
    'src/routes/proxy/forward.ts',
]

code_keywords = ['const ', 'let ', 'var ', 'function ', 'async function', 'await db', 'import {', 'app.', 'export ']

for rel in files:
    full = os.path.join(os.getcwd(), rel)
    if not os.path.exists(full):
        continue
    with open(full, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8', errors='replace')
    lines = text.split('\n')
    
    fixed_count = 0
    for i in range(len(lines)):
        s = lines[i].strip()
        if not s.startswith('//') and not s.startswith('//') and s[:2] != '//':
            # Check if line starts with // (possibly after whitespace)
            stripped = lines[i].lstrip()
            if len(stripped) < 2 or stripped[:2] != '//':
                continue
        
        # It's a comment line
        # Find // position
        cpos = lines[i].index('//')
        after_c = lines[i][cpos+2:].strip()
        
        for kw in code_keywords:
            if kw in after_c:
                # Find where the keyword starts
                kidx = after_c.index(kw)
                comment_text = after_c[:kidx].strip()
                code_part = after_c[kidx:]
                indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
                
                # Remove the code part from the comment line
                lines[i] = indent + '// ' + comment_text
                # Insert code on next line (only if it's not already there)
                if i+1 < len(lines) and code_part in lines[i+1]:
                    continue  # Already has the code on next line
                lines.insert(i+1, indent + code_part)
                fixed_count += 1
                break
    
    if fixed_count > 0:
        result = '\n'.join(lines)
        try:
            result.encode('utf-8')
            with open(full, 'w', encoding='utf-8') as f:
                f.write(result)
            print(f'[OK] {rel}: fixed {fixed_count} merged lines')
        except:
            print(f'[FAIL] {rel}: result invalid')
    else:
        print(f'[SAME] {rel}')
