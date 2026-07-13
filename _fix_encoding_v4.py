import os

def fix_garbled(s):
    """Fix UTF-8 bytes misinterpreted as Latin-1."""
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s

def is_garbled_chinese(s):
    """Check if a string likely contains garbled Chinese."""
    if len(s) < 2:
        return False
    try:
        encoded = s.encode('latin-1')
        fixed = encoded.decode('utf-8')
        # If we got different text with CJK chars, it was garbled
        if fixed == s:
            return False
        has_cjk = any('一' <= c <= '鿿' or '㐀' <= c <= '䶿' for c in fixed)
        return has_cjk
    except:
        return False

def fix_file(filepath):
    """Fix all garbled strings in a TSX/JSX file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    result = []
    i = 0
    n = len(content)

    while i < n:
        c = content[i]

        # Handle single-quoted strings
        if c == "'":
            j = i + 1
            while j < n:
                if content[j] == '\\':
                    j += 2  # skip escaped char
                    continue
                if content[j] == "'":
                    break
                j += 1
            if j < n:
                inner = content[i+1:j]
                if is_garbled_chinese(inner):
                    inner = fix_garbled(inner)
                result.append("'" + inner + "'")
                i = j + 1
                continue

        # Handle double-quoted strings
        elif c == '"':
            j = i + 1
            while j < n:
                if content[j] == '\\':
                    j += 2
                    continue
                if content[j] == '"':
                    break
                j += 1
            if j < n:
                inner = content[i+1:j]
                if is_garbled_chinese(inner):
                    inner = fix_garbled(inner)
                result.append('"' + inner + '"')
                i = j + 1
                continue

        # Handle backtick template strings
        elif c == '`':
            j = i + 1
            while j < n:
                if content[j] == '\\':
                    j += 2
                    continue
                if content[j] == '`':
                    break
                j += 1
            if j < n:
                inner = content[i+1:j]
                if is_garbled_chinese(inner):
                    inner = fix_garbled(inner)
                result.append('`' + inner + '`')
                i = j + 1
                continue

        # Handle line comments // ... to end of line
        elif c == '/' and i+1 < n and content[i+1] == '/':
            j = content.index('\n', i) if '\n' in content[i:] else n
            comment = content[i:j]
            if is_garbled_chinese(comment):
                comment = fix_garbled(comment)
            result.append(comment)
            i = j
            continue

        # Handle block comments /* ... */
        elif c == '/' and i+1 < n and content[i+1] == '*':
            j = content.index('*/', i+2) + 2 if '*/' in content[i+2:] else n
            comment = content[i:j]
            if is_garbled_chinese(comment):
                comment = fix_garbled(comment)
            result.append(comment)
            i = j
            continue

        # Handle JSX text content (between > and <)
        elif c == '>':
            result.append(c)
            i += 1
            # Look ahead for text content
            text_start = i
            while i < n and content[i] not in '<{':
                i += 1
            if i > text_start:
                text = content[text_start:i]
                if is_garbled_chinese(text):
                    text = fix_garbled(text)
                result.append(text)
            continue

        result.append(c)
        i += 1

    fixed_content = ''.join(result)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(fixed_content)

    return True

files = [
    r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\RedemptionCodes.tsx',
    r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\RateLimits.tsx',
    r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin\VendorSelfMgmt.tsx',
]

for f in files:
    print(f'Processing: {f}')
    fix_file(f)
    print(f'  Done: {f}')

print('All files processed.')
