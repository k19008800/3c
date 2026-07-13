import os

base = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin'

# Key-value pairs: search bytes -> replacement text (as bytes)
# We use bytes to avoid any encoding interpretation issues
replacements = {
    # Announcements.tsx
    '鑾峰彇鍏憡鍒楄〃澶辫触'.encode('utf-8'): '获取公告列表失败'.encode('utf-8'),
    '鍒涘缓浜'.encode('utf-8'): '创建人'.encode('utf-8'),
    '鍏憡宸叉洿鏂'.encode('utf-8'): '公告已更新'.encode('utf-8'),
    '鏇存柊澶辫触'.encode('utf-8'): '更新失败'.encode('utf-8'),
    '鍒涘缓澶辫触'.encode('utf-8'): '创建失败'.encode('utf-8'),
    '缁存姢閫氱煡'.encode('utf-8'): '维护通知'.encode('utf-8'),
    # Campaigns.tsx
    '鑾峰彇娲诲姩鍒楄〃澶辫触'.encode('utf-8'): '获取活动列表失败'.encode('utf-8'),
    '鏂板缓娲诲姩'.encode('utf-8'): '新建活动'.encode('utf-8'),
    '确缁撴潫'.encode('utf-8'): '确认结束'.encode('utf-8'),
    '璇疯緭鍏ユ椿鍔ㄥ悕绉'.encode('utf-8'): '请输入活动名称'.encode('utf-8'),
    '娲诲姩宸叉洿鏂'.encode('utf-8'): '活动已更新'.encode('utf-8'),
    '鏇存柊澶辫触'.encode('utf-8'): '更新失败'.encode('utf-8'),
    '鍒涘缓澶辫触'.encode('utf-8'): '创建失败'.encode('utf-8'),
    '编辑娲诲姩'.encode('utf-8'): '编辑活动'.encode('utf-8'),
    '鏂板缓娲诲姩'.encode('utf-8'): '新建活动'.encode('utf-8'),
    '鏇存柊涓?..'.encode('utf-8'): '更新中...'.encode('utf-8'),
    '鍒涘缓涓?..'.encode('utf-8'): '创建中...'.encode('utf-8'),
    '鍒涘缓'.encode('utf-8'): '创建'.encode('utf-8'),
}

files_to_check = ['Announcements.tsx', 'Campaigns.tsx', 'OperationLogs.tsx', 'PageContents.tsx',
                  'ProfitAnalysis.tsx', 'Quotas.tsx', 'RateLimits.tsx', 'RedemptionCodes.tsx',
                  'Roles.tsx', 'VendorSelfMgmt.tsx', 'enterprise-analysis/index.tsx', 'finance/AdminCostDetail.tsx']

count = 0
for fn in files_to_check:
    fpath = os.path.join(base, fn)
    if not os.path.exists(fpath):
        continue
    with open(fpath, 'rb') as f:
        data = f.read()
    changed = False
    for old_bytes, new_bytes in replacements.items():
        if old_bytes in data:
            data = data.replace(old_bytes, new_bytes)
            print(f'[FIX] {fn}: {old_bytes.decode("utf-8", errors="replace")[:20]}')
            changed = True
            count += 1
    if changed:
        with open(fpath, 'wb') as f:
            f.write(data)

print(f'Total: {count} fixes applied')
