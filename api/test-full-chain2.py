import json, subprocess

API = "http://localhost:3000"

ADMIN_TOKEN = None

def login_admin():
    global ADMIN_TOKEN
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"admin@3cloud.ai","password":"***"}'])
    d = json.loads(r)
    if d.get('data'):
        ADMIN_TOKEN = d['data']['accessToken']
        print(f'   Admin login OK')
    else:
        print(f'   Admin login FAILED: {json.dumps(d, ensure_ascii=False)}')
        exit(1)

def login_user():
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"test@3cloud.ai","password":"Test@123456"}'])
    d = json.loads(r)
    return d['data']['accessToken']

def curl(token, method, path, body=None):
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    return json.loads(subprocess.check_output(cmd))

# ════════════════════════════════════
# Phase 1: Admin activates test user
# ════════════════════════════════════
print('\n[Phase 1] Admin activates user 924')
login_admin()
r = curl(ADMIN_TOKEN, 'PATCH', '/api/v1/admin/users/924', {"status": "active"})
print(f'   Result: {r.get("message","?")}')
r = curl(ADMIN_TOKEN, 'GET', '/api/v1/admin/users/924')
u = r.get('data', {})
print(f'   User: {u.get("email")} status={u.get("status")} balance={u.get("balance")}')

# ════════════════════════════════════
# Phase 2: User login
# ════════════════════════════════════
print('\n[Phase 2] User login & API Key')
t = login_user()
print(f'   Login OK (token={t[:20]}...)')

# ════════════════════════════════════
# Phase 3: Create API Key
# ════════════════════════════════════
r = curl(t, 'POST', '/api/v1/api-keys', {"name": "Full Chain Test"})
api_key = r.get('data', {}).get('key', '')
print(f'   Created key: {r.get("data",{}).get("keyPrefix","?")} (full: {api_key[:30]}...)')

# ════════════════════════════════════
# Phase 4: Proxy API call
# ════════════════════════════════════
print('\n[Phase 4] Proxy API call')
cmd = ['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/proxy/chat/completions',
       '-H', 'Content-Type: application/json',
       '-H', 'Authorization: Bearer ' + api_key,
       '-d', '{"model":"deepseek-chat","messages":[{"role":"user","content":"Just say OK"}],"max_tokens":5}']
r_raw = subprocess.check_output(cmd)
try:
    d = json.loads(r_raw)
    choices = d.get('choices', [])
    if choices:
        print(f'   Model says: {choices[0]["message"]["content"]}')
    elif d.get('code') == 0 and d.get('data'):
        print(f'   Proxy code 0: {json.dumps(d, ensure_ascii=False)[:200]}')
    elif d.get('code') == 500:
        print(f'   500 Error: {d.get("details", d.get("message",""))[:300]}')
    else:
        print(f'   Response: {json.dumps(d, ensure_ascii=False)[:300]}')
except:
    print(f'   Raw: {r_raw.decode(errors="replace")[:300]}')

# ════════════════════════════════════
# Phase 5: Check usage/billing
# ════════════════════════════════════
print('\n[Phase 5] Usage & Billing')
# List keys to see usage
r = curl(t, 'GET', '/api/v1/api-keys')
for k in r.get('data', {}).get('list', []):
    print(f'   Key: {k.get("name")} status={k.get("status")} usage: d={k.get("dailyUsage")} m={k.get("monthlyUsage")}')

# Transactions
r = curl(t, 'GET', '/api/v1/transactions')
if r.get('code') == 0:
    items = r.get('data', []) if isinstance(r.get('data'), list) else r.get('data', {}).get('list', [])
    print(f'   Transactions: {len(items)} items')
    for item in items[:3]:
        print(f'     {item.get("type","?")} {item.get("amount","?")} {item.get("description","")[:60]}')

# ════════════════════════════════════
# Phase 6: Admin dashboard
# ════════════════════════════════════
print('\n[Phase 6] Admin Dashboard')
r = curl(ADMIN_TOKEN, 'GET', '/api/v1/admin/stats/summary')
print(f'   Stats: {json.dumps(r, ensure_ascii=False)[:200]}')

print('\n=== FULL CHAIN COMPLETE ===')
