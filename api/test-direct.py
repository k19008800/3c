import json, subprocess

API = "http://localhost:3000"

# Test directly - no concat tricks
pwd = 'Admin@123456'
payload = '{"email":"admin@3cloud.ai","password":"' + pwd + '"}'

r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
    '-H', 'Content-Type: application/json',
    '-d', payload])
d = json.loads(r)
print(f'Admin login: code={d.get("code")}')
if d.get('data'):
    token = d['data']['accessToken']
    print(f'Token: {token[:20]}...')
    
    # List users
    r2 = subprocess.check_output(['curl.exe', '-s', f'{API}/api/v1/admin/users/924',
        '-H', 'Authorization: Bearer ' + token])
    d2 = json.loads(r2)
    print(f'User 924: {json.dumps(d2, ensure_ascii=False)[:200]}')
else:
    print(f'Failed: {d.get("message")}')
    # Debug: print the actual payload
    print(f'Payload: {payload}')
