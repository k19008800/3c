import json, subprocess

with open(r'C:\Users\ZH\.openclaw\workspace\3cloud\api\_token.txt') as f:
    t = f.read().strip()

# Check what routes exist for user management
routes_to_try = [
    ('PUT', '/api/v1/admin/users/924', {"status": "active"}),
    ('PUT', '/api/v1/admin/users/924/status', {"status": "active"}),
    ('PATCH', '/api/v1/admin/users/924', {"status": "active"}),
]

for method, path, body in routes_to_try:
    cmd = ['curl.exe', '-s', '-X', method, f'http://localhost:3000{path}',
           '-H', 'Content-Type: application/json',
           '-H', f'Authorization: Bearer {t}',
           '-d', json.dumps(body)]
    r = json.loads(subprocess.check_output(cmd))
    print(f'{method} {path}: code={r.get("code")} msg={r.get("message","")[:60]}')

# Check user detail
r = subprocess.check_output(['curl.exe', '-s', 'http://localhost:3000/api/v1/admin/users/924',
                             '-H', f'Authorization: Bearer {t}'])
d = json.loads(r)
print(f'\nUser 924 detail: code={d.get("code")} data={json.dumps(d.get("data",{}))[:200]}')
