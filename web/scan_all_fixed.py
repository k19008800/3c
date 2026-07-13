import os

base = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin'
moji_pats = ['歿','鍒','鏂','鏃','缁','鎴','鏉','鐩','绉','鎾','閿','闂','渚','畾','涔','寋','寮','屽','簲','亼','劧',
             '妯','濮','锛','鎻','閿','闆','夎','规','睙','垹']

files_to_check = [
    'AdminApiKeys.tsx', 'Announcements.tsx', 'Campaigns.tsx', 'OperationLogs.tsx',
    'PageContents.tsx', 'ProfitAnalysis.tsx', 'Quotas.tsx', 'RateLimits.tsx',
    'RedemptionCodes.tsx', 'Roles.tsx', 'VendorSelfMgmt.tsx',
    'enterprise-analysis/index.tsx', 'finance/AdminCostDetail.tsx'
]

found_any = False
for fn in files_to_check:
    fpath = os.path.join(base, fn)
    if not os.path.exists(fpath):
        print(f'[SKIP] {fn} does not exist')
        continue
    with open(fpath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    for i, line in enumerate(lines, 1):
        for pat in moji_pats:
            if pat in line:
                print(f'[MOJI] {fn}:L{i}: {line.strip()[:120]}')
                found_any = True
                break

if not found_any:
    print('All clean! No remaining mojibake patterns found in any fixed file.')
