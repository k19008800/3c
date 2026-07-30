import json, subprocess

API = "http://localhost:3000"

def login(email, pw):
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({"email": email, "password": pw})])
    return json.loads(r)['data']

def curl(token, method, path, body=None, raw=False):
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    r = subprocess.check_output(cmd)
    if raw: return r
    return json.loads(r)

PASS = '\033[92mPASS\033[0m'
FAIL = '\033[91mFAIL\033[0m'

# ─── Step 1: Register new user ───
print('\n\x1b[1m=== Step 1: Register new user ===\x1b[0m')
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
print(f'  [{PASS if ok else FAIL}] Register {email} (id={user_id})')

# ─── Step 2: Admin activate user ───
print('\n\x1b[1m=== Step 2: Admin activate user ===\x1b[0m')
adm = login("admin@3cloud.ai", "***")
r = curl(adm['accessToken'], 'PATCH', f'/api/v1/admin/users/{user_id}', {"status": "active"})
ok = r.get('code') == 0
print(f'  [{PASS if ok else FAIL}] Activate user {user_id}')

# ─── Step 3: Login as new user ───
print('\n\x1b[1m=== Step 3: Login ===\x1b[0m')
u = login(email, pw)
ok = u.get('user', {}).get('status') == 'active'
print(f'  [{PASS if ok else FAIL}] Login as {email} (status={u.get("user", {}).get("status")})')

# ─── Step 4: Create API Key ───
print('\n\x1b[1m=== Step 4: Create API Key ===\x1b[0m')
r = curl(u['accessToken'], 'POST', '/api/v1/api-keys', {"name": "Full Chain Test"})
ok = r.get('code') == 0
api_key = r.get('data', {}).get('key', '')
print(f'  [{PASS if ok else FAIL}] Create key')
if ok:
    print(f'    Key: {api_key[:20]}...')

# ─── Step 5: Proxy API Call ───
print('\n\x1b[1m=== Step 5: Proxy API Call ===\x1b[0m}')
if api_key:
    r_raw = curl(api_key, 'POST', '/api/v1/proxy/chat/completions', 
        {"model": "deepseek-chat", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10},
        raw=True)
    try:
        r = json.loads(r_raw) if isinstance(r_raw, bytes) else r_raw
        choices = r.get('choices', [])
        if choices:
            content = choices[0]['message']['content']
            ok = True
            print(f'  [{PASS if ok else FAIL}] Proxy call: "{content}"')
        else:
            ok = False
            print(f'  [{FAIL}] No choices. Resp: {str(r_raw)[:300]}')
    except:
        ok = False
        print(f'  [{FAIL}] Parse error. Resp: {str(r_raw)[:300]}')
else:
    ok = False
    print(f'  [{FAIL}] No API key')

# ─── Step 6: Check Transactions ───
print('\n\x1b[1m=== Step 6: Billing/Transactions ===\x1b[0m}')
r = curl(u['accessToken'], 'GET', '/api/v1/transactions')
ok = r.get('code') == 0
tx_count = len(r.get('data', {}).get('list', []))
print(f'  [{PASS if ok else FAIL}] Transactions ({tx_count} records)')

# ─── Step 7: Admin Dashboard ───
print('\n\x1b[1m=== Step 7: Admin Dashboard ===\x1b[0m}')
r = curl(adm['accessToken'], 'GET', '/api/v1/admin/users?pageSize=1')
ok = r.get('code') == 0
total = r.get('data', {}).get('total', 0)
print(f'  [{PASS if ok else FAIL}] Admin users list (total={total})')

# ─── Step 8: Admin Stats ───
print('\n\x1b[1m=== Step 8: Admin Stats ===\x1b[0m}')
r = curl(adm['accessToken'], 'GET', '/api/v1/admin/stats/summary')
ok = r.get('code') == 0
print(f'  [{PASS if ok else FAIL}] Admin stats')

print('\n\x1b[1m=== Full Chain Test Complete ===\x1b[0m}')
