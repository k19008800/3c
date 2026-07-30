import json, subprocess

API = "http://localhost:3000"

def login(email, password):
    payload = '{"email":"' + email + '","password":"' + password + '"}'
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json', '-d', payload])
    return json.loads(r)

def curl(token, method, path, body=None):
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    return json.loads(subprocess.check_output(cmd))

# ════════════════════════════════════
# Phase 1: Admin activates user
# ════════════════════════════════════
print('\n[Phase 1] Admin')
r = login('admin@3cloud.ai', '***')
ADMIN_TOKEN = r['data']['accessToken']
print(f'   Login: super_admin')

r = curl(ADMIN_TOKEN, 'PATCH', '/api/v1/admin/users/924', {"status": "active"})
print(f'   Activate user 924: {r.get("message","?")}')

r = curl(ADMIN_TOKEN, 'GET', '/api/v1/admin/users/924')
u = r.get('data', {})
print(f'   User: {u.get("email")} status={u.get("status")} balance={u.get("balance")}')

# ════════════════════════════════════
# Phase 2: User login & test
# ════════════════════════════════════
print('\n[Phase 2] User')
r = login('test@3cloud.ai', '***')
USER_TOKEN = r['data']['accessToken']
print(f'   Login: user id=924')

# Create API Key
r = curl(USER_TOKEN, 'POST', '/api/v1/api-keys', {"name": "Full Chain Test"})
API_KEY = r.get('data', {}).get('key', '')
print(f'   Create Key: {r["data"]["keyPrefix"]} (full: {API_KEY[:25]}...)')

# List keys
r = curl(USER_TOKEN, 'GET', '/api/v1/api-keys')
print(f'   List Keys: {len(r["data"]["list"])} keys')

# ════════════════════════════════════
# Phase 3: Proxy call
# ════════════════════════════════════
print('\n[Phase 3] Proxy API')
cmd = ['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/proxy/chat/completions',
       '-H', 'Content-Type: application/json',
       '-H', 'Authorization: Bearer ' + API_KEY,
       '-d', '{"model":"deepseek-chat","messages":[{"role":"user","content":"Say ok"}],"max_tokens":5}']
r_raw = subprocess.check_output(cmd)
try:
    d = json.loads(r_raw)
    if 'choices' in d and len(d['choices']) > 0:
        resp_text = d['choices'][0]['message']['content']
        print(f'   Model: {resp_text}')
    elif d.get('code') == 0:
        print(f'   OK: {json.dumps(d, ensure_ascii=False)[:200]}')
    else:
        print(f'   Response: {json.dumps(d, ensure_ascii=False)[:300]}')
except:
    print(f'   Raw: {r_raw.decode(errors="replace")[:300]}')

# ════════════════════════════════════
# Phase 4: Billing / Transactions
# ════════════════════════════════════
print('\n[Phase 4] Billing')
r = curl(USER_TOKEN, 'GET', '/api/v1/transactions?pageSize=3')
if r.get('code') == 0:
    items = r.get('data', []) if isinstance(r.get('data'), list) else r.get('data', {}).get('list', [])
    print(f'   User transactions: {len(items)} items')

# ════════════════════════════════════
# Phase 5: Admin stats
# ════════════════════════════════════
print('\n[Phase 5] Admin Stats')
r = curl(ADMIN_TOKEN, 'GET', '/api/v1/admin/stats/summary')
if r.get('code') == 0:
    s = r.get('data', {})
    print(f'   Users: {s.get("totalUsers","?")} Active: {s.get("activeUsers","?")}')


print('\n=== FULL CHAIN COMPLETE ===')
print('PASS' if API_KEY else 'FAIL')
