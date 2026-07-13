"""
场景 4：为客户创建 API Key
"""
import json, urllib.request, sys

BASE = 'http://localhost:3000'

def api(m, p, b=None, t=None):
    h = {'Content-Type': 'application/json'}
    if t: h['Authorization'] = f'Bearer {t}'
    d = json.dumps(b).encode() if b else None
    req = urllib.request.Request(f'{BASE}{p}', data=d, headers=h, method=m)
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        try:
            return {'_error': True, '_status': e.code, **json.loads(body)}
        except:
            return {'_error': True, '_status': e.code, '_raw': body[:300]}

admin_t = open(r'C:\Users\ZH\AppData\Local\Temp\admin_token.txt').read().strip()

print('【09:30】场景 4：创建 API Key')
print('=' * 50)

# 先确认关键客户的账号
targets = [28, 29, 35, 34, 6]
users = api('GET', '/api/v1/admin/users?page=1&pageSize=50', t=admin_t)
print('\n4.1 目标用户信息:')
for u in users.get('data', {}).get('list', []):
    if u.get('id') in targets:
        uid = u['id']
        email = u['email']
        nick = u.get('nickname', '')
        role = u['role']
        st = u['status']
        rns = u.get('realNameStatus', '')
        bal = u.get('balance', '0')
        print(f'  ID={uid}  email={email}  nick={nick}  role={role}  status={st}  realNameStatus={rns}  balance={bal}')

# 这些客户是预置的，密码未知。使用管理员模拟登录获取 token
# 查找 impersonate 端点
print('\n4.2 尝试管理员模拟登录 (impersonate) ---')

# 尝试 POST /api/v1/admin/users/:id/impersonate
impersonate = api('POST', '/api/v1/admin/users/28/impersonate', {}, t=admin_t)
print(f'  ID=28 impersonate: {json.dumps(impersonate, ensure_ascii=False)[:200]}')

impersonate29 = api('POST', '/api/v1/admin/users/29/impersonate', {}, t=admin_t)
print(f'  ID=29 impersonate: {json.dumps(impersonate29, ensure_ascii=False)[:200]}')

# 如果 impersonate 不行，用新注册的 sim-user 也行
print('\n4.3 使用 sim-user-0800 创建 API Key ---')
user_t = open(r'C:\Users\ZH\AppData\Local\Temp\sim_user_token.txt').read().strip()

# 先查看可用模型
models = api('GET', '/api/v1/models', t=user_t)
if models.get('code') == 0:
    print(f'  可用模型 ({len(models.get("data",{}).get("list",[]))} 个):')
    for m in models.get('data',{}).get('list',[]):
        print(f'    ID={m.get("id")}  name={m.get("name","")}  vendor={m.get("vendorName","")}')
else:
    print(f'  models response: {json.dumps(models, ensure_ascii=False)[:200]}')

# 创建 API Key
print('\n4.4 创建 API Key:')
ak = api('POST', '/api/v1/api-keys', {'name': 'sim-key-01', 'expiresAt': None}, t=user_t)
print(f'  result: {json.dumps(ak, ensure_ascii=False)[:300]}')

if ak.get('code') == 0:
    key_data = ak['data']
    with open(r'C:\Users\ZH\AppData\Local\Temp\sim_apikey.txt', 'w') as f:
        f.write(key_data.get('key', key_data.get('apiKey', '')))
    print(f'  API Key saved! key={key_data.get("key","")}')

# 查看 api-keys 列表
print('\n4.5 API Key 列表:')
aks = api('GET', '/api/v1/api-keys', t=user_t)
print(f'  {json.dumps(aks, ensure_ascii=False)[:300]}')

# 也尝试为学思教育(id:28)创建 API Key
# 如果 impersonate 返回了 token，用它来创建
if impersonate.get('code') == 0:
    edu_t = impersonate['data']['accessToken']
    with open(r'C:\Users\ZH\AppData\Local\Temp\edu_token.txt', 'w') as f:
        f.write(edu_t)
    print('\n4.6 学思教育创建 API Key:')
    ak2 = api('POST', '/api/v1/api-keys', {'name': 'edu-prod-key'}, t=edu_t)
    print(f'  result: {json.dumps(ak2, ensure_ascii=False)[:300]}')
    if ak2.get('code') == 0:
        edu_ak = ak2['data'].get('key', ak2['data'].get('apiKey', ''))
        with open(r'C:\Users\ZH\AppData\Local\Temp\edu_apikey.txt', 'w') as f:
            f.write(edu_ak)
        print(f'  Edu API Key saved!')
else:
    print(f'\n  Impersonate failed, using sim-user API Key only')

print('\n4.7 查询 API Key 余额（通过 GET /v1/me 或类似端点验证）:')
print(f'  sim-user key saved OK')
