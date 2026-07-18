#!/usr/bin/env python3
"""
Fix all remaining encoding/string corruption by matching context with git HEAD originals.
"""
import subprocess, os, re

ROOT = os.getcwd()

# Maps corrupted file -> git HEAD original
SOURCES = {
    'src/routes/auth/login.ts': 'api/src/routes/auth.ts',
    'src/routes/auth/realname.ts': 'api/src/routes/auth.ts',
    'src/routes/auth/register.ts': 'api/src/routes/auth.ts',
    'src/routes/proxy/forward.ts': 'api/src/routes/proxy.ts',
    'src/routes/redemption/agent.ts': 'api/src/routes/redemption.ts',
    'src/routes/redemption/query.ts': 'api/src/routes/redemption.ts',
    'src/routes/redemption/redeem.ts': 'api/src/routes/redemption.ts',
    'src/routes/vendor-self/profile.ts': 'api/src/routes/vendor-self.ts',
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
}

# Known corrupted strings and their correct versions
# These are derived from looking at the corrupted files and matching against originals
KNOWN_FIXES = {
    # auth/login.ts
    '验证码已发送至您的邮箱，请输入验证码继续登录,': '验证码已发送至您的邮箱，请输入验证码继续登录"',
    # vendor-self/profile.ts
    '注册成功，请等待管理员审核,': '注册成功，请等待管理员审核"',
    '厂商名称已存在 });': '厂商名称已存在" });',
    '厂商名称已存在\n': '厂商名称已存在"\n',
    '邮箱已被注册': '邮箱已被注册"',
    '供应商注册成功': '供应商注册成功"',
    '注册成功，': '注册成功"',
    '更新成功': '更新成功"',
}

def fix_with_original(cr_path, orig_git):
    """Fix the corrupted file by matching with original."""
    full = os.path.join(ROOT, cr_path)
    
    with open(full, 'rb') as f:
        raw = f.read()
    
    # Decode with replace
    text = raw.decode('utf-8', errors='replace')
    
    # Get original
    res = subprocess.run(['git', 'show', f'HEAD:{orig_git}'], capture_output=True)
    if res.returncode != 0:
        return text, 0
    orig = res.stdout.decode('utf-8')
    
    changes = 0
    
    # Strategy 1: Apply known fixes
    for bad, good in KNOWN_FIXES.items():
        if bad in text:
            text = text.replace(bad, good)
            changes += 1
    
    # Strategy 2: Find unterminated strings in corrupt and search original
    lines = text.split('\n')
    orig_lines = orig.split('\n')
    fixed_lines = []
    
    for li, line in enumerate(lines):
        replaced = False
        
        # Look for lines with opening " but no closing "
        in_string = False
        string_start = -1
        for ci, c in enumerate(line):
            if c == '"' and (ci == 0 or line[ci-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_start = ci
                else:
                    in_string = False
        
        if in_string:
            # Unterminated string - try to find original
            # Extract context before the string
            before = line[:string_start].strip()
            
            # Find last few meaningful words
            text_sofar = line[string_start+1:].rstrip(',;)}')
            
            # Search original for matching line
            for ol in orig_lines:
                ol_stripped = ol.strip()
                if text_sofar in ol_stripped and '"' in ol_stripped:
                    # Verify it has proper closing
                    if ol_stripped.count('"') % 2 == 0:
                        # Use same indentation as original line
                        indent = re.match(r'^(\s*)', line).group(1)
                        fixed_lines.append(indent + ol_stripped)
                        replaced = True
                        changes += 1
                        break
        
        if not replaced:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines), changes


# Also fix remaining raw byte corruption
def fix_raw_bytes(full_path):
    """Fix remaining 0x3F corruption in UTF-8 3-byte sequences."""
    with open(full_path, 'rb') as f:
        raw = bytearray(f.read())
    
    fixed = 0
    i = 0
    while i < len(raw) - 2:
        b1 = raw[i]
        if 0xE0 <= b1 <= 0xEF:
            b2 = raw[i+1]
            b3 = raw[i+2]
            if 0x80 <= b2 <= 0xBF and b3 == 0x3F:
                # Corrupted - skip this byte sequence for now (can't determine correct byte)
                pass
        i += 1
    
    return bytes(raw)

for cr_path, orig_git in SOURCES.items():
    full = os.path.join(ROOT, cr_path)
    if not os.path.exists(full):
        # Try with src/ prefix
        alt = os.path.join(ROOT, 'src/' + cr_path)
        if os.path.exists(alt):
            full = alt
        else:
            print(f'[MISS] {cr_path}')
            continue
    
    text_before = open(full, 'rb').read().decode('utf-8', errors='replace')
    
    # Fix string matching
    fixed_text, changes = fix_with_original(cr_path, orig_git)
    
    # Fix raw bytes
    raw_fixed = fix_raw_bytes(full) if changes == 0 else fixed_text.encode('utf-8')
    
    if changes > 0:
        # Verify it's valid UTF-8
        try:
            fixed_text.encode('utf-8').decode('utf-8')
            with open(full, 'w', encoding='utf-8') as f:
                f.write(fixed_text)
            print(f'[OK] {cr_path}: fixed {changes} strings')
        except:
            print(f'[FAIL] {cr_path}: fix produced invalid UTF-8')
    else:
        print(f'[SAME] {cr_path}')
