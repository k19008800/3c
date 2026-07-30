import json, subprocess

API = "http://localhost:3000"
ADMIN_EMAIL = "admin@3cloud.ai"
ADMIN_PW = "Admin@123456"

# Login as admin
r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
    '-H', 'Content-Type: application/json',
    '-d', '{"email":"admin@3cloud.ai","password":"***"}'])
d = json.loads(r)
if d.get('data'):
    admin_token = d['data']['accessToken']
    print(f'Admin login OK')
    
    # Activate user 924 and check/update password
    # Try PATCH
    r2 = subprocess.check_output(['curl.exe', '-s', '-X', 'PATCH', f'{API}/api/v1/admin/users/924',
        '-H', 'Content-Type: application/json',
        '-H', 'Authorization: Bearer ' + admin_token,
        '-d', '{"status":"active","password":"***"}'])
    d2 = json.loads(r2)
    print(f'PATCH user: code={d2.get("code")} msg={d2.get("message","")}')
    
    # Now list user
    r3 = subprocess.check_output(['curl.exe', '-s', f'{API}/api/v1/admin/users/924',
        '-H', 'Authorization: Bearer ' + admin_token])
    d3 = json.loads(r3)
    u = d3.get('data', {})
    print(f'User 924: email={u.get("email")} status={u.get("status")}')
else:
    print(f'Admin login failed: {json.dumps(d, ensure_ascii=False)}')
