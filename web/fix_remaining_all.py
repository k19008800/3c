import os, sys

base = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin'

# Known mojibake strings with their correct replacements
# Format: [(file, old_text, new_text), ...]
fixes = []

# === Announcements.tsx ===
ann = 'Announcements.tsx'
fixes += [
    (ann, "'鑾峰彇鍏憡鍒楄〃澶辫触'", "'获取公告列表失败'"),
    (ann, "鍒涘缓浜", "创建人"),
    (ann, "'鍏憡宸叉洿鏂'", "'公告已更新'"),
    (ann, "'鏇存柊澶辫触'", "'更新失败'"),
    (ann, "'鍒涘缓澶辫触'", "'创建失败'"),
    (ann, "缁存姢閫氱煡", "维护通知"),
]

# === Campaigns.tsx ===
camp = 'Campaigns.tsx'
fixes += [
    (camp, "'鑾峰彇娲诲姩鍒楄〃澶辫触'", "'获取活动列表失败'"),
    (camp, "鏂板缓娲诲姩", "新建活动"),
    (camp, "确缁撴潫", "确认结束"),
    (camp, "'璇疯緭鍏ユ椿鍔ㄥ悕绉'", "'请输入活动名称'"),
    (camp, "'娲诲姩宸叉洿鏂'", "'活动已更新'"),
    (camp, "'鏇存柊澶辫触'", "'更新失败'"),
    (camp, "'鍒涘缓澶辫触'", "'创建失败'"),
    (camp, "'编辑娲诲姩'", "'编辑活动'"),
    (camp, "'鏂板缓娲诲姩'", "'新建活动'"),
    (camp, "'鏇存柊涓?..'", "'更新中...'"),
    (camp, "'鍒涘缓涓?..'", "'创建中...'"),
    (camp, "'鍒涘缓'", "'创建'"),
]

count = 0
for fn, old, new in fixes:
    fpath = os.path.join(base, fn)
    with open(fpath, 'r', encoding='utf-8') as f:
        c = f.read()
    if old in c:
        c = c.replace(old, new)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(c)
        count += 1
        print(f'[FIX] {fn}: {old[:30]} -> {new[:30]}')
    else:
        # Try alternative matching - print what's there instead
        pass

print(f'Total fixes applied: {count}')
