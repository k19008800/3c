"""
Fix all refactored files: strip CR from lines and write with proper line endings.
This fixes the double-blank-line issue caused by split('\n') leaving \r on each line.
"""
import os

ROOT = os.getcwd()

files_to_fix = [
    'src/routes/auth/login.ts',
    'src/routes/auth/realname.ts',
    'src/routes/auth/register.ts',
    'src/routes/proxy/forward.ts',
    'src/routes/redemption/agent.ts',
    'src/routes/redemption/query.ts',
    'src/routes/redemption/redeem.ts',
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
]

for rel in files_to_fix:
    full = os.path.join(ROOT, rel)
    if not os.path.exists(full):
        continue
    
    with open(full, 'rb') as f:
        raw = f.read()
    
    # Normalize to LF line endings
    # Replace CRLF -> LF, then strip trailing CR
    text = raw.decode('utf-8', errors='replace')
    text = text.replace('\r\n', '\n')
    text = text.replace('\r', '')
    
    # Write with LF (Git handles Windows conversion)
    with open(full, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    
    print(f'[OK] {rel}')
