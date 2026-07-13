#!/usr/bin/env python3
"""Fix mojibake in Stats.tsx - UTF-8 bytes misinterpreted as GBK then saved as UTF-8"""

import re, sys

INPUT = r'C:/Users/ZH/.openclaw/workspace/3cloud/web/src/pages/admin/Stats.tsx'

with open(INPUT, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

def try_gbk_fix(text):
    """Try to fix mojibake by encoding as GBK and decoding as UTF-8.
    Returns fixed text if successful, or original if it fails."""
    try:
        raw = text.encode('gbk')
        return raw.decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return None

def fix_corrupted_line(line):
    """Fix a line that has corrupted Chinese text."""
    # Strategy 1: try fixing the whole line as GBK roundtrip
    # This works when all chars in the line are GBK-encodable
    fixed = try_gbk_fix(line)
    if fixed and fixed != line:
        # Check if the fix actually produced valid-looking Chinese
        # by looking for common CJK characters
        cjk_count = sum(1 for ch in fixed if '\u4e00' <= ch <= '\u9fff')
        if cjk_count > 0:
            return fixed
    
    # Strategy 2: fix segments separated by non-mojibake chars
    # Find contiguous sequences of GBK-encodable chars and try to fix each
    result = []
    i = 0
    while i < len(line):
        ch = line[i]
        try:
            ch.encode('gbk')
            # This char can be part of a GBK-fixable segment
            # Collect contiguous GBK-encodable chars
            seg_start = i
            while i < len(line):
                try:
                    line[i].encode('gbk')
                    i += 1
                except UnicodeEncodeError:
                    break
            segment = line[seg_start:i]
            # Try to fix this segment
            fixed_seg = try_gbk_fix(segment)
            if fixed_seg and fixed_seg != segment:
                result.append(fixed_seg)
            else:
                result.append(segment)
        except UnicodeEncodeError:
            # Character can't be encoded in GBK - keep as-is
            result.append(ch)
            i += 1
    
    return ''.join(result)

# Manual replacements for box-drawing chars and special cases
# These can't be auto-fixed via GBK roundtrip
manual_replacements = {
    # Box-drawing line decorations
    '鈹€鈹€ Types 鈹€鈹€': '──── Types ────',
    '鈹€鈹€ Stat Card 鈹€鈹€': '──── Stat Card ────',
    '鈹€鈹€ Custom Tooltips 鈹€鈹€': '──── Custom Tooltips ────',
    '鈹€鈹€ Page 鈹€鈹€': '──── Page ────',
    # Unicode box drawing continued chars series
    '鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲': '',
}

# Process ALL lines
fixed_lines = []
for i, line in enumerate(lines):
    # Check if this line has potential mojibake
    # (Lines with high Unicode chars in the 0x9000-0x9FFF range)
    needs_fix = any(0x9000 <= ord(ch) <= 0x9FFF for ch in line)
    
    if not needs_fix:
        fixed_lines.append(line)
        continue
    
    # Try auto-fix first
    fixed = fix_corrupted_line(line)
    
    # Then apply manual replacements for anything remaining
    for old, new in manual_replacements.items():
        if old in fixed:
            fixed = fixed.replace(old, new)
    
    fixed_lines.append(fixed)
    
    if fixed != line:
        print(f'  L{i+1}: FIXED')
    else:
        print(f'  L{i+1}: UNCHANGED')

output = '\n'.join(fixed_lines)
with open(INPUT, 'w', encoding='utf-8') as f:
    f.write(output)

print(f'\nDone. Processed {len(lines)} lines.')
