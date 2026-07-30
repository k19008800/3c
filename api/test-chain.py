import json, urllib.request

API = "http://localhost:3000"
pwd = "Test@123456"

# Step 1: Login
req = urllib.request.Request(f'{API}/api/v1/auth/login',
    data=json.dumps({"email": "test@3cloud.ai", "password": pwd}).encode(),
    headers={'Content-Type': 'application/json'})
resp = json.loads(urllib.request.urlopen(req).read())
print(f'1. Login: code={resp.get("code")}')
token = resp['data']['accessToken']

# Step 2: Create API Key
req = urllib.request.Request(f'{API}/api/v1/api-keys',
    data=json.dumps({"name": "Test Key"}).encode(),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'})
resp = json.loads(urllib.request.urlopen(req).read())
print(f'2. Create Key: code={resp.get("code")}')
api_key = resp.get('data', {}).get('key', '')
if api_key:
    print(f'   Key: {api_key[:20]}...')
else:
    print(f'   Response: {json.dumps(resp, ensure_ascii=False)[:300]}')

# Step 3: List Keys
if api_key:
    req = urllib.request.Request(f'{API}/api/v1/api-keys',
        headers={'Authorization': f'Bearer {token}'})
    resp = json.loads(urllib.request.urlopen(req).read())
    print(f'3. List Keys: {len(resp.get("data", {}).get("list", []))} keys')

# Step 4: Proxy call
if api_key:
    print(f'4. Proxy call...')
    proxy_body = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 10
    }).encode()
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'}
    req = urllib.request.Request(f'{API}/api/v1/proxy/chat/completions', data=proxy_body, headers=headers)
    try:
        resp = json.loads(urllib.request.urlopen(req).read())
        choices = resp.get('choices', [])
        if choices:
            print(f'   Model says: {choices[0]["message"]["content"]}')
        else:
            print(f'   Response: {json.dumps(resp, ensure_ascii=False)[:300]}')
    except urllib.error.HTTPError as e:
        print(f'   HTTP {e.code}: {e.read().decode(errors="replace")[:500]}')

print('\nDone')
