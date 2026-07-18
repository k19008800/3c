import subprocess

res = subprocess.run(['git', 'show', 'HEAD:api/src/routes/auth.ts'], capture_output=True)
text = res.stdout.decode('utf-8')

search_terms = ['验证码', '邮箱', '继续登录', 'sendVerification', 'captcha', 'login']
for term in search_terms:
    count = text.count(term)
    print(f'  "{term}": {count} occurrences')

# Check login-specific sections
for term in ['/api/v1/auth/login', 'loginUser', 'refreshAccessToken']:
    if term in text:
        idx = text.index(term)
        print(f'\n  Found "{term}" at position {idx}')
        snippet = text[max(0,idx-50):idx+150]
        print(f'  Context: {snippet}')
