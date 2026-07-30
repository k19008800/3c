import json, subprocess

API = "http://localhost:3000"

# Try common admin passwords
pwds = ["Admin@123456", "admin@123456", "Admin123456", "admin123", "***"]

for pw in pwds:
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"admin@3cloud.ai","password":"' + pw + '"}'])
    try:
        d = json.loads(r)
        if d.get('data'):
            print(f'  SUCCESS with password: {pw}')
            print(f'  Token: {d["data"]["accessToken"][:20]}...')
            break
        else:
            print(f'  FAIL with password: {pw} -> {d.get("message")}')
    except:
        print(f'  ERROR decoding response')
