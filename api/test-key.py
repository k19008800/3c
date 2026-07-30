import json, subprocess, urllib.request

API = "http://localhost:3000"

# Login
req = urllib.request.Request(f'{API}/api/v1/auth/login',
    data=json.dumps({"email": "test@3cloud.ai", "password": "***"}).encode(),
    headers={'Content-Type': 'application/json'})
resp = json.loads(urllib.request.urlopen(req).read())
print(f'Login: code={resp.get("code")}')
USER_TOKEN = resp['data']['accessToken']
print(f'Token: {USER_TOKEN[:30]}...')

# Try to create key with full data
req = urllib.request.Request(f'{API}/api/v1/api-keys',
    data=json.dumps({
        "name": "My Test Key",
        "permissions": {
            "allowedModels": ["deepseek-chat"],
            "ipWhitelist": [],
            "ipBlacklist": [],
            "allowedEndpoints": [],
            "rateLimitPerMinute": null,
            "requireModelCheck": false
        }
    }).encode(),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {USER_TOKEN}'})
try:
    resp = json.loads(urllib.request.urlopen(req).read())
    print(f'Create Key: code={resp.get("code")}')
    print(f'Response: {json.dumps(resp, ensure_ascii=False)[:500]}')
except urllib.error.HTTPError as e:
    print(f'HTTP Error: {e.code}')
    body = e.read().decode()
    print(f'Body: {body[:1000]}')
except Exception as e:
    print(f'Error: {e}')
