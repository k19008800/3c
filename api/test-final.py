import json, subprocess

API = "http://localhost:3000"

def login(email, pw):
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({"email": email, "password": pw})])
    d = json.loads(r)
    if d.get('code') != 0:
        print(f'Login FAIL: {json.dumps(d, ensure_ascii=False)}')
        return None
    return d['data']

def curl(token, method, path, body=None, raw=False):
    if not token:
        print(f'  SKIP: no token for {method} {path}')
        return None
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    r = subprocess.check_output(cmd)
    if raw: return r
    return json.loads(r)

PASS = 'PASS'
FAIL = 'FAIL'
results = []

# ─── Step 1: Register new user ───
import random
suffix = random.randint(10000, 99999)
email = f"chain.test.{suffix}@3cloud.ai"
pw = "Test@123456"
r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/register',
    '-H', 'Content-Type: application/json',
    '-d', json.dumps({"email": email, "password": pw, "confirmPassword": pw})])
d = json.loads(r)
ok = d.get('code') == 0
user_id = d.get('data', {}).get('user', {}).get('id', '?')
results.append(('Register', ok))
print(f'[{PASS if ok else FAIL}] Register {email} (id={user_id})')

# ─── Step 2: Admin activate user ───
adm = login("admin@3cloud.ai", "***")
if adm:
    r = curl(adm['accessToken'], 'PATCH', f'/api/v1/admin/users/{user_id}', {"status": "active"})
    ok = r is not None and r.get('code') == 0
    results.append(('Admin Activate', ok))
    print(f'[{PASS if ok else FAIL}] Activate user {user_id}: {r}')
else:
    results.append(('Admin Activate', False))

# ─── Step 3: Login as new user ───
u = login(email, pw)
ok = u is not None and u.get('user', {}).get('status') == 'active'
results.append(('Login', ok))
print(f'[{PASS if ok else FAIL}] Login as {email}')

# ─── Step 4: Create API Key ───
if u:
    r = curl(u['accessToken'], 'POST', '/api/v1/api-keys', {"name": "Full Chain Test"})
    ok = r is not None and r.get('code') == 0
    api_key = r.get('data', {}).get('key', '') if r else ''
    results.append(('Create Key', ok))
    print(f'[{PASS if ok else FAIL}] Create key')
    if ok:
        print(f'    Key: {api_key[:20]}...')
else:
    api_key = ''
    results.append(('Create Key', False))

# ─── Step 5: Proxy API Call ───
if api_key:
    r_raw = curl(api_key, 'POST', '/api/v1/proxy/chat/completions', 
        {"model": "deepseek-chat", "messages": [{"role": "user", "content": "Say hi in one word"}], "max_tokens": 10},
        raw=True)
    if r_raw:
        try:
            r = json.loads(r_raw)
            choices = r.get('choices', [])
            if choices:
                content = choices[0]['message']['content']
                ok = True
                print(f'[{PASS if ok else FAIL}] Proxy call: "{content}"')
            elif r.get('code') == 0:
                ok = True
                print(f'[{PASS}] Proxy accepted (id={r.get("id","?")})')
            else:
                ok = False
                print(f'[{FAIL}] Error: {str(r_raw.decode())[:200]}')
        except Exception as e:
            ok = False
            print(f'[{FAIL}] Parse error: {e}')
            print(f'    Raw: {str(r_raw.decode())[:200]}')
    else:
        ok = False
        print(f'[{FAIL}] No response')
    results.append(('Proxy Call', ok))
else:
    results.append(('Proxy Call', False))

# ─── Step 6: Transactions ───
if u:
    r = curl(u['accessToken'], 'GET', '/api/v1/transactions')
    ok = r is not None and r.get('code') == 0
    tx_count = len(r.get('data', {}).get('list', [])) if r and r.get('data') else 0
    results.append(('Transactions', ok))
    print(f'[{PASS if ok else FAIL}] Transactions ({tx_count} records)')
else:
    results.append(('Transactions', False))

# ─── Step 7: Admin Dashboard ───
if adm:
    r = curl(adm['accessToken'], 'GET', '/api/v1/admin/users?pageSize=1')
    ok = r is not None and r.get('code') == 0
    total = r.get('data', {}).get('total', 0) if r else 0
    results.append(('Admin Dashboard', ok))
    print(f'[{PASS if ok else FAIL}] Admin users list (total={total})')
else:
    results.append(('Admin Dashboard', False))

# ─── Summary ───
print('\n' + '='*50)
print('RESULTS SUMMARY')
print('='*50)
all_pass = True
for name, ok in results:
    status = PASS if ok else FAIL
    print(f'  [{status}] {name}')
    if not ok:
        all_pass = False
print(f'\n{"ALL TESTS PASSED!" if all_pass else "SOME TESTS FAILED"}')
