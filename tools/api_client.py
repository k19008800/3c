"""
3cloud API Client — 仿真测试辅助脚本
用法: python api_client.py <method> <path> [json_body_file]
环境变量: ADMIN_TOKEN 或 --token
"""
import json, urllib.request, sys, os, re

BASE = "http://localhost:3000"

def load_token():
    if 'ADMIN_TOKEN' in os.environ:
        return os.environ['ADMIN_TOKEN']
    try:
        with open(os.path.join(os.path.dirname(__file__), '..', '..', 'AppData', 'Local', 'Temp', 'admin_token.txt')) as f:
            return f.read().strip()
    except:
        pass
    tk = None
    for i, a in enumerate(sys.argv):
        if a == '--token' and i + 1 < len(sys.argv):
            tk = sys.argv[i + 1]
            sys.argv.pop(i+1)
            sys.argv.pop(i)
            break
    return tk or ''

TOKEN = load_token()

def api(method, path, body=None, headers=None):
    h = {'Content-Type': 'application/json'}
    if TOKEN and not path.startswith('/api/v1/auth/login'):
        h['Authorization'] = f'Bearer {TOKEN}'
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        try:
            return {'_error': True, '_status': e.code, **json.loads(body)}
        except:
            return {'_error': True, '_status': e.code, '_raw': body[:500]}

def api_raw(method, path, body=None, headers=None):
    """返回原始响应字符串"""
    h = {'Content-Type': 'application/json'}
    if TOKEN:
        h['Authorization'] = f'Bearer {TOKEN}'
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(req)
        raw = resp.read().decode()
        try:
            return json.dumps(json.loads(raw), ensure_ascii=False, indent=2)
        except:
            return raw
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        try:
            return json.dumps({'_error': True, '_status': e.code, **json.loads(body)}, ensure_ascii=False, indent=2)
        except:
            return json.dumps({'_error': True, '_status': e.code, '_raw': body[:500]}, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python api_client.py <GET|POST|PATCH|DELETE> <path> [body_file.json]")
        print("       body can also be inline JSON as 3rd arg")
        sys.exit(1)
    method = sys.argv[1].upper()
    path = sys.argv[2]
    body = None
    if len(sys.argv) > 3:
        raw = sys.argv[3]
        if os.path.isfile(raw):
            with open(raw) as f:
                body = json.load(f)
        else:
            body = json.loads(raw)
    result = api(method, path, body)
    print(json.dumps(result, ensure_ascii=False, indent=2))
