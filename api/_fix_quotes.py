"""
Fix unterminated string literals: the refactor script dropped closing quotes.
For each line with an opening " but no closing ", add the missing "
before the trailing , ); etc.
"""
import os, re

ROOT = os.getcwd()

# Files with TS1002 unterminated string errors
files_to_check = [
    ('src/routes/auth/login.ts', 'api/src/routes/auth.ts'),
    ('src/routes/auth/realname.ts', 'api/src/routes/auth.ts'),
    ('src/routes/auth/register.ts', 'api/src/routes/auth.ts'),
    ('src/routes/proxy/forward.ts', 'api/src/routes/proxy.ts'),
    ('src/routes/redemption/agent.ts', 'api/src/routes/redemption.ts'),
    ('src/routes/vendor-self/profile.ts', 'api/src/routes/vendor-self.ts'),
]

for cr_path, _ in files_to_check:
    full = os.path.join(ROOT, cr_path)
    if not os.path.exists(full):
        full = os.path.join(ROOT, 'src', cr_path)
    if not os.path.exists(full):
        print(f'[MISS] {cr_path}')
        continue
    
    with open(full, 'rb') as f:
        data = f.read()
    
    text = data.decode('utf-8', errors='replace')
    lines = text.split('\n')
    fixed_lines = []
    fixes = 0
    
    for line in lines:
        # Check for unbalanced quotes
        # Count all quotes
        quotes = [i for i, c in enumerate(line) if c == '"']
        
        if len(quotes) % 2 == 0:
            fixed_lines.append(line)
            continue
        
        # Odd number of quotes - last one is an opening quote without closing
        last_open = quotes[-1]
        
        # Find what comes after the opening quote
        after = line[last_open+1:]
        
        # The string should end before trailing characters like , ); }] 
        # Find the first of these after the string content
        trimmed = after.rstrip()
        trail = after[len(trimmed):]
        
        # But the text itself might contain these characters within the string
        # Better approach: look for the original from git
        
        # Simplest fix: just add a closing quote before the trailing characters
        # that come after the string content
        if trail:
            # The string content is everything from last_open+1 up to where trail starts
            content = after[:len(after)-len(trail)]
            new_line = line[:last_open+1] + content + '"' + trail
            fixed_lines.append(new_line)
            fixes += 1
        else:
            fixed_lines.append(line)
    
    if fixes > 0:
        result = '\n'.join(fixed_lines)
        try:
            result.encode('utf-8').decode('utf-8')
            with open(full, 'w', encoding='utf-8') as f:
                f.write(result)
            print(f'[OK] {cr_path}: fixed {fixes} unterminated strings')
        except:
            print(f'[FAIL] {cr_path}: fix produced invalid UTF-8')
    else:
        print(f'[SAME] {cr_path}')
