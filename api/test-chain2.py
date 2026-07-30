import json, subprocess

API = "http://localhost:3000"

def login():
    r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"test@3cloud.ai","password":"***"}'])
    d = json.loads(r)
    if d.get('data'):
        return d['data']['accessToken']
    print(f'Login failed: {json.dumps(d, ensure_ascii=False)[:200]}')
    exit(1)

def curl(token, method, path, body=None):
    cmd = ['curl.exe', '-s', '-X', method, f'{API}{path}',
           '-H', 'Authorization: Bearer ' + token]
    if body:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(body)]
    return json.loads(subprocess.check_output(cmd))

t = login()
print(f'1. Login: OK')

# Create a fresh API key
r = curl(t, 'POST', '/api/v1/api-keys', {"name": "Full Chain Test 2"})
api_key = r.get('data', {}).get('key', '')
print(f'2. Create Key: {r["data"]["keyPrefix"]}')

# Proxy call
print(f'3. Proxy call...')
cmd = ['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/proxy/chat/completions',
       '-H', 'Content-Type: application/json',
       '-H', 'Authorization: Bearer ' + api_key,
       '-d', '{"model":"deepseek-chat","messages":[{"role":"user","content":"Say hi in one word"}],"max_tokens":10}']
r_raw = subprocess.check_output(cmd)
print(f'   Raw response first 500 chars: {r_raw.decode(errors="replace")[:500]}')

# Try to parse as JSON
try:
    d = json.loads(r_raw)
    if 'choices' in d:
        content = d['choices'][0]['message']['content']
        print(f'   Model response: {content}')
    elif d.get('code') == 0:
        print(f'   Proxy says: {json.dumps(d, ensure_ascii=False)[:200]}')
    else:
        print(f'   Response: {json.dumps(d, ensure_ascii=False)[:300]}')
except:
    print(f'   Non-JSON response')

# Check billing
print(f'4. Transactions...')
r = curl(t, 'GET', '/api/v1/transactions')
print(f'   Code={r.get("code")} count={len(r.get("data",[])) if isinstance(r.get("data"),list) else len(r.get("data",{}).get("list",[]))}')
