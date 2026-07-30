import json, subprocess

API = "http://localhost:3000"
TOKEN_FILE = r"C:\Users\ZH\.openclaw\workspace\3cloud\api\_token.txt"

def save_token():
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"test@3cloud.ai","password":"***"}'])
    d = json.loads(r)
    print(f'Login response keys: {list(d.keys())}')
    t = d['data']['accessToken']
    with open(TOKEN_FILE, 'w') as f:
        f.write(t)
    return t

def curl(method, path, body=None, custom_token=None):
    if custom_token:
        token = custom_token
    else:
        with open(TOKEN_FILE) as f:
            token = f.read().strip()
    
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', f'Authorization: Bearer {token}']
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    
    r = subprocess.check_output(cmd)
    return json.loads(r)

# Fresh token
t = save_token()
print(f'Token saved ({t[:20]}...)')

# List keys
r = curl('GET', '/api/v1/api-keys')
print(f'List keys: code={r.get("code")}')
if r.get('code') == 0:
    keys = r.get('data', {}).get('list', [])
    print(f'Found {len(keys)} key(s)')
    for k in keys:
        print(f'  - {k.get("name")} ({k.get("keyPrefix")}) status={k.get("status")}')
elif r.get('code') == 500:
    print(f'Error: {r.get("details", r.get("message", "?"))[:500]}')
    print(f'Stack: {r.get("stack", "")[:500]}')
else:
    print(f'Response: {json.dumps(r, ensure_ascii=False)[:500]}')
