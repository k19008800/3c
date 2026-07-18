#!/usr/bin/env python3
"""
Fix encoding corruption in refactored files.
Systematic fix: corrupted 3-byte UTF-8 sequences have 0x3F as last byte.
Recover by matching context from git HEAD original.
"""
import os, re, subprocess, sys

ROOT = os.getcwd()

# Mapping: new corrupted file -> original source file in git HEAD
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
    'src/routes/auth/login.ts': 'api/src/routes/auth.ts',
    'src/routes/auth/realname.ts': 'api/src/routes/auth.ts',
    'src/routes/auth/register.ts': 'api/src/routes/auth.ts',
    'src/routes/proxy/forward.ts': 'api/src/routes/proxy.ts',
    'src/routes/redemption/agent.ts': 'api/src/routes/redemption.ts',
    'src/routes/redemption/query.ts': 'api/src/routes/redemption.ts',
    'src/routes/redemption/redeem.ts': 'api/src/routes/redemption.ts',
    'src/routes/vendor-self/profile.ts': 'api/src/routes/vendor-self.ts',
}

def recover_text(new_file, orig_git_path):
    """Recover correct text by matching context with git HEAD original."""
    # Read corrupted file as raw bytes
    with open(new_file, 'rb') as f:
        corrupted_raw = f.read()
    
    # Get original from git HEAD
    try:
        result = subprocess.run(
            ['git', 'show', f'HEAD:{orig_git_path}'],
            capture_output=True, cwd=ROOT
        )
        original_raw = result.stdout
    except Exception as e:
        print(f"  ERROR getting original: {e}")
        return None
    
    if not original_raw:
        print(f"  ERROR: original empty for {orig_git_path}")
        return None
    
    # Try UTF-8 decode
    try:
        original_text = original_raw.decode('utf-8')
    except UnicodeDecodeError:
        print(f"  ERROR: original not valid UTF-8")
        return None
    
    try:
        corrupted_text = corrupted_raw.decode('utf-8')
        print(f"  NOTE: corrupted file IS valid UTF-8, no corruption detected")
        return corrupted_text
    except UnicodeDecodeError:
        pass
    
    corrupted_as_gbk = corrupted_raw.decode('gbk', errors='replace')
    
    # Strategy: Find corruption positions, then use surrounding context to find matches in original
    # First, try to decode by replacing corrupted bytes with a placeholder
    fixed_bytes = bytearray(corrupted_raw)
    
    # Find all corrupted positions: 0xE0-0xEF followed by 0x80-0xBF followed by 0x3F
    # (but only when 0x3F shouldn't be there - i.e., it's a corrupted UTF-8 continuation byte)
    
    fixed_count = 0
    i = 0
    while i < len(fixed_bytes) - 2:
        b1 = fixed_bytes[i]
        b2 = fixed_bytes[i+1]
        b3 = fixed_bytes[i+2]
        
        # 3-byte UTF-8 sequence with corrupted 3rd byte
        if 0xE0 <= b1 <= 0xEF and 0x80 <= b2 <= 0xBF and b3 == 0x3F:
            # Try to recover: look at surrounding characters in corrupted file,
            # and find similar context in original
            
            # Get some context from corrupted file
            start = max(0, i - 30)
            end = min(len(fixed_bytes), i + 30)
            corrupted_context = bytes(fixed_bytes[start:end])
            
            # Try to decode context to find searchable text
            try:
                context_prefix = bytes(fixed_bytes[start:i]).decode('utf-8', errors='replace')
            except:
                context_prefix = corrupted_as_gbk[start:i] if start < len(corrupted_as_gbk) else ''
            
            # Find a unique text pattern nearby (like a function name or string)
            # Search in original text for the context
            match_pattern = context_prefix[-20:] if len(context_prefix) > 20 else context_prefix
            match_pattern = match_pattern.replace('\ufffd', '')
            
            if len(match_pattern) >= 8:  # Only search if we have enough context
                pos = original_text.find(match_pattern)
                if pos >= 0:
                    # Find the corresponding 3-byte UTF-8 sequence in original
                    orig_byte_pos = len(original_text[:pos].encode('utf-8'))
                    if orig_byte_pos >= start:
                        local_pos = i - start + (orig_byte_pos - start)
                        # Get the 3rd byte from original
                        orig_next_3 = original_raw[orig_byte_pos + len(match_pattern.encode('utf-8')):orig_byte_pos + len(match_pattern.encode('utf-8')) + 3]
                        # Actually this is getting complicated. Let me try a simpler approach.
                        pass
            
            # Simple fallback: search the corrupted string containing this position in original
            # by using text from corrupted_as_gbk
            search_window = 50
            search_start = max(0, i - search_window)
            context = corrupted_as_gbk[search_start:i+1]
            
            # Find last non-replacement character
            clean_context = context.replace('\ufffd', '').strip()
            if len(clean_context) >= 5:
                # Try to find in original
                orig_idx = original_text.find(clean_context)
                if orig_idx >= 0:
                    # The text after this clean context should have the correct character
                    after = original_text[orig_idx + len(clean_context):]
                    if after:
                        correct_char = after[0]
                        correct_bytes = correct_char.encode('utf-8')
                        if len(correct_bytes) >= 3:
                            # Replace the 3rd byte
                            fixed_bytes[i+2] = correct_bytes[2]
                            fixed_count += 1
    
    # Try to decode the fixed version
    try:
        result = fixed_bytes.decode('utf-8')
        print(f"  Fixed {fixed_count} corruption(s)")
        return result
    except UnicodeDecodeError as e:
        # For remaining issues, try character-by-character recovery
        print(f"  Fixed {fixed_count}, remaining error at byte {e.start}")
        
        # Last attempt: for each position with 0xE0-0xEF 0x80-0xBF 0x3F,
        # find the correct byte from original
        for i in range(len(fixed_bytes) - 2):
            b1 = fixed_bytes[i]
            b2 = fixed_bytes[i+1]
            if 0xE0 <= b1 <= 0xEF and 0x80 <= b2 <= 0xBF:
                b3 = fixed_bytes[i+2]
                if b3 == 0x3F:
                    # Try to get the original byte from git source
                    # Estimate line number
                    line_num = corrupted_raw[:i].count(b'\n') + 1
                    
                    # Get original lines
                    orig_lines = original_text.split('\n')
                    if line_num <= len(orig_lines):
                        orig_line = orig_lines[line_num - 1]
                        orig_line_bytes = orig_line.encode('utf-8')
                        
                        # Find position within the line
                        line_start = 0
                        for j in range(line_num - 1):
                            line_start = len('\n'.join(orig_lines[:j+1]).encode('utf-8')) + 1 if j > 0 else 0
                        
                        if i < len(orig_line_bytes):
                            # Use the original byte directly
                            fixed_bytes[i+2] = orig_line_bytes[i]
                            fixed_count += 1
        
        try:
            result = fixed_bytes.decode('utf-8')
            print(f"  Second pass fixed {fixed_count} total")
            return result
        except UnicodeDecodeError as e:
            print(f"  Still corrupted after fix: {e}")
            return fixed_bytes.decode('utf-8', errors='replace')

def main():
    fixed = 0
    failed = 0
    
    for rel_path, orig_source in SOURCE_MAP.items():
        full = os.path.join(ROOT, rel_path if not rel_path.startswith('src/') else rel_path)
        # Check if it's the full path from root or needs src/ prefix
        if not os.path.exists(full):
            test_path = os.path.join(ROOT, 'src', rel_path)
            if os.path.exists(test_path):
                full = test_path
            else:
                # Try without src/ if already has it
                test_path2 = os.path.join(ROOT, rel_path.replace('src/', ''))
                if os.path.exists(test_path2):
                    full = test_path2
                else:
                    print(f"  FILE NOT FOUND: {rel_path}")
                    continue
        
        print(f"\nFixing: {rel_path}")
        result = recover_text(full, orig_source)
        if result:
            # Write back
            with open(full, 'w', encoding='utf-8') as f:
                f.write(result)
            print(f"  OK")
            fixed += 1
        else:
            print(f"  FAILED")
            failed += 1
    
    print(f"\n\nSummary: {fixed} fixed, {failed} failed")

if __name__ == '__main__':
    main()
