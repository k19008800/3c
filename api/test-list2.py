import json, subprocess

API = "http://localhost:3000"
pw = "Test@123456"

def login():
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"test@3cloud.ai","password":"' + pw + '"}'])
    return json.loads(r)['data']['accessToken']

def curl(token, method, path, body=None):
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    return json.loads(subprocess.check_output(cmd))

# Login
t = login()
print(f'1. Login OK (token={t[:20]}...)')

# List keys
r = curl(t, 'GET', '/api/v1/api-keys')
print(f'2. List keys: code={r.get("code")}')
if r.get('code') == 0:
    keys = r.get('data', {}).get('list', [])
    print(f'   Found {len(keys)} key(s)')
    for k in keys:
        print(f'   - {k.get("name")} ({k.get("keyPrefix")})')
elif r.get('code') == 500:
    print(f'   Error details: {r.get("details", "?")[:500]}')
    print(f'   Stack: {(r.get("stack") or "?")[:500]}')
