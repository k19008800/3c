"""Simple runner for a specific scenario"""
import json, urllib.request, sys

BASE = 'http://localhost:3000'

def api(m, p, b=None, t=None):
    h = {'Content-Type': 'application/json'}
    if t:
        h['Authorization'] = 'Bearer ' + t
    d = json.dumps(b).encode() if b else None
    req = urllib.request.Request(BASE + p, data=d, headers=h, method=m)
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        try:
            return {'_error': True, '_status': e.code, **json.loads(body)}
        except:
            return {'_error': True, '_status': e.code, '_raw': body[:200]}

if __name__ == '__main__':
    if sys.argv[1] == 'sc4':
        user_t = open(r'C:\Users\ZH\AppData\Local\Temp\sim_user_token.txt').read().strip()
        print('[API Key] 创建 API Key...')
        ak = api('POST', '/api/v1/api-keys', {'name': 'sim-key-01'}, t=user_t)
        print(json.dumps(ak, ensure_ascii=False, indent=2))
        if ak.get('code') == 0:
            raw_key = ak['data']['key']
            with open(r'C:\Users\ZH\AppData\Local\Temp\sim_apikey.txt', 'w') as f:
                f.write(raw_key)
            print('[SAVED] API Key saved')

    elif sys.argv[1] == 'impersonate':
        admin_t = open(r'C:\Users\ZH\AppData\Local\Temp\admin_token.txt').read().strip()
        uid = sys.argv[2]
        print(f'[Imp] 模拟登录用户 {uid}...')
        imp = api('POST', '/api/v1/admin/users/' + uid + '/impersonate', {}, t=admin_t)
        print(json.dumps(imp, ensure_ascii=False, indent=2)[:500])

    elif sys.argv[1] == 'login_as':
        email = sys.argv[2]
        pwd = sys.argv[3]
        print(f'[Login] 登录 {email}...')
        lg = api('POST', '/api/v1/auth/login', {'email': email, 'password': pwd})
        print(json.dumps(lg, ensure_ascii=False, indent=2)[:500])

    elif sys.argv[1] == 'apikey_as':
        email = sys.argv[2]
        pwd = sys.argv[3]
        name = sys.argv[4]
        lg = api('POST', '/api/v1/auth/login', {'email': email, 'password': pwd})
        if lg.get('code') == 0:
            t = lg['data']['accessToken']
            print(f'[Login] OK, creating API Key "{name}"...')
            ak = api('POST', '/api/v1/api-keys', {'name': name}, t=t)
            print(json.dumps(ak, ensure_ascii=False, indent=2))
            if ak.get('code') == 0:
                with open(r'C:\Users\ZH\AppData\Local\Temp\last_apikey.txt', 'w') as f:
                    f.write(ak['data']['key'])
                print(f'[SAVED] key={ak["data"]["key"]}')
        else:
            print(f'[FAIL] {json.dumps(lg, ensure_ascii=False)}')
