import json, subprocess

API = "http://localhost:3000"
pw = "Test@123456"

r = subprocess.check_output(['curl.exe', '-s', '-X', 'POST', f'{API}/api/v1/auth/login',
    '-H', 'Content-Type: application/json',
    '-d', '{"email":"test@3cloud.ai","password":"' + pw + '"}'])
d = json.loads(r)
print(json.dumps(d, ensure_ascii=False, indent=2)[:1000])
