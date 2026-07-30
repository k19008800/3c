import json, subprocess

API = "http://localhost:3000"

def token():
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"test@3cloud.ai","password":"***"}'])
    r = json.loads(r)
    print(f'Login response: {list(r.keys())}')
    return r['data']['accessToken']

def curl(token, method, path, body=None, raw=False):
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    r = subprocess.check_output(cmd)
    if raw:
        return r
    return json.loads(r)

t = token()
print(f'Login OK')

# Check if proxy route exists - try API key auth
r = curl(t, 'GET', '/api/v1/api-keys')
api_key_raw = None

# Get list of existing keys to find the raw key  
for k in r['data']['list']:
    print(f'Key: {k["name"]} ({k["keyPrefix"]}) status={k.get("status")}')
    # We need to create a new key since we don't have the raw key string saved
    # Create a new key and use it right away
    r2 = curl(t, 'POST', '/api/v1/api-keys', {"name": "Chain Test Key"})
    if r2.get('code') == 0:
        api_key_raw = r2['data']['key']
        print(f'  Created fresh key: {api_key_raw[:20]}...')
        break

if not api_key_raw:
    print('Failed to create API key')
    exit()

# Try proxy call with API key auth
print(f'\nProxy call with API key...')
cmd = ['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/proxy/chat/completions',
       '-H', f'Authorization: Bearer {api_key_raw}',
       '-H', 'Content-Type: application/json',
       '-d', json.dumps({"model": "deepseek-chat", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10})]
r_raw = subprocess.check_output(cmd)
try:
    r = json.loads(r_raw)
    if r.get('choices'):
        print(f'  SUCCESS! Model said: {r["choices"][0]["message"]["content"]}')
    elif r.get('code') == 0 and r.get('data'):
        print(f'  Response data: {json.dumps(r["data"])[:300]}')
    else:
        print(f'  Response: {json.dumps(r, ensure_ascii=False)[:500]}')
except:
    print(f'  Raw: {r_raw.decode(errors="replace")[:500]}')
