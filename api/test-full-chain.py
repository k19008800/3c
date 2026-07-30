import json
import subprocess

API = "http://localhost:3000"
JSON_FILE = r"C:\Users\ZH\.openclaw\workspace\3cloud\api\login-test.json"

def jwt_token():
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '@' + JSON_FILE])
    d = json.loads(r)
    assert d.get('data'), f'Login fail: {d.get("message","")}'
    return d['data']['accessToken']

def api(token, method, path, body=None):
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    return json.loads(subprocess.check_output(cmd))

t = jwt_token()
print('1. Login: OK')

r = api(t, 'POST', '/api/v1/api-keys', {'name': 'Full Chain Test'})
if r.get('code') != 0:
    print(f'2. Create API Key: FAIL — {json.dumps(r)[:200]}')
    exit(1)
api_key = r['data']['key']
print(f'2. Create API Key: OK — {api_key[:25]}...')

r = api(t, 'GET', '/api/v1/api-keys')
keys = r.get('data', {}).get('list', [])
print(f'3. List Keys: {len(keys)} keys')
for k in keys:
    print(f'   - {k["name"]} ({k["keyPrefix"]}) status={k["status"]}')

print('4. Proxy API Call...')
proxy_body = json.dumps({
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hi"}],
    "max_tokens": 10
})
cmd = ['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/proxy/chat/completions',
       '-H', 'Authorization: Bearer ' + api_key,
       '-H', 'Content-Type: application/json',
       '-d', proxy_body]
r_raw = subprocess.check_output(cmd)
r = json.loads(r_raw)
choices = r.get('choices', [])
if choices:
    text = choices[0]['message']['content']
    print(f'   OK — Model: "{text}"')
elif r.get('code') == 0:
    print(f'   OK (code=0, no choices) — {json.dumps(r)[:200]}')
else:
    print(f'   FAIL — {json.dumps(r)[:300]}')

r = api(t, 'GET', '/api/v1/transactions')
txn = r.get('data', {}).get('list', [])
print(f'5. Transactions: {len(txn)} entries')

print()
print('=== ALL STEPS COMPLETED ===')
print('1.Login 2.CreateKey 3.ListKeys 4.ProxyCall 5.Billing')
