import subprocess

# Get original auth.ts and find all lines with the corrupted texts
res = subprocess.run(['git', 'show', 'HEAD:api/src/routes/auth.ts'], capture_output=True)
text = res.stdout.decode('utf-8')

# Find lines containing the corrupted login.ts text
for line in text.split('\n'):
    if '验证码' in line or 'captcha' in line or '登录' in line:
        if 'message' in line and '"' in line:
            print(line.strip())
