#!/usr/bin/env python3
"""Final comprehensive fix for remaining mojibake in Stats.tsx"""

INPUT = r'C:/Users/ZH/.openclaw/workspace/3cloud/web/src/pages/admin/Stats.tsx'

with open(INPUT, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix remaining corrupted strings (still containing GBK-mojibake chars)
# These are the ones that couldn't be auto-fixed due to ASCII ? or U+20AC € chars

fixes = {
    # Box-drawing comment lines with € 
    '// 鈹€鈹€ Types 鈹€鈹€': '// ──── Types ────',
    '// 鈹€鈹€ Stat Card 鈹€鈹€': '// ──── Stat Card ────',
    '// 鈹€鈹€ Custom Tooltips 鈹€鈹€': '// ──── Custom Tooltips ────',
    '// 鈹€鈹€ Page 鈹€鈹€': '// ──── Page ────',
    '// 鈹€鈹€ 鑱氬悎鏌ヨ鐘舵€?鈹€鈹€': '// ──── 聚合查询状态 ────',
    '// 鈹€鈹€ 鑱氬悎鏌ヨ 鈹€鈹€': '// ──── 聚合查询 ────',
    
    # Comment separator line (special chars that are actually clean)
    # Comment lines were already fixed by Part 1
    # Fix the V2.0 comment line  
    '/*  V2.0 鑱氬悎鏌ヨ锛堢鐞嗗悗鍙板寮猴級': '/*  V2.0 聚合查询（管理后台增强）',
    'V2.0 鑱氬悎鏌ヨ类型': 'V2.0 聚合查询类型',
    
    # Error messages
    '鑾峰彇缁熻统计数据失败': '获取统计数据失败',
    '鑱氬悎鏌ヨ失败': '聚合查询失败',
    
    # Page title
    '鑱氬悎缁熻\u2468': '聚合统计',  # may not match exactly due to char differences
    '鑱氬悎缁熺Щ': '聚合统计',  # try alternate corruptions
    
    # Summary card labels - these have ? at end
    'label="鎬昏皟鐢ㄦ鏁?': 'label="总调用次数"',
    'label="鎬?Token 娑堣€?': 'label="总 Token 消耗"',
    "label=\"鎬?Token 娑堣€?": "label=\"总 Token 消耗\"",
    "value={(Number(overview.totalTokens) / 10000).toFixed(2) + '涓?}": "value={(Number(overview.totalTokens) / 10000).toFixed(2) + '万\"}",
    'label="鎬昏姳璐?': 'label="总花费"',
    '鎴愬姛鐜?': '成功率',
    
    # Trend chart
    '姣忔棩瓒嬪娍': '每日趋势',
    
    # tick formatter 
    '涓嘸 : v}': '万' if False else '万 : v}',
    # Actually let me handle the tick formatter more carefully
    # `${(v / 10000).toFixed(0)}万`
    
    # Model chart section
    '鎸夋ā鍨嬬粺璁℃帓琛?': '按模型统计排行',
    '璋冪敤娆℃暟': '调用次数',
    
    # Vendor chart section
    '鎸変緵搴斿晢缁熻鎺掕': '按供应商统计排行',
    
    # Hourly chart
    '鎸夊皬鏃跺垎甯冿紙浠婃棩锛?': '按小时分布（今日）',
    
    # Aggregation section
    '鑱氬悎鏌ヨ': '聚合查询',
    '澶氱淮搴﹁仛鍚?+ 妯″瀷/渚涘簲鍟嗙粏鍒': '多维度聚合 + 模型/供应商细分',
    '绛涢€夊櫒': '筛选器',
    '妯″瀷绛涢€': '模型筛选',
    '渚涘簲鍟嗙瓫閫': '供应商筛选',
    '鏌ヨ': '查询',
    '姹囨€诲崱鐗?': '汇总卡片',
    '鎬昏皟鐢': '总调用',
    '鎬?Token': '总 Token',
    '鎬昏姳璐': '总花费',
    '鑱氬悎鏃堕棿搴忓垪': '聚合时间序列',
    '缁村害缁嗗垎鍥捐〃': '维度细分图表',
    '鎸夋ā鍨嬬粏鍒': '按模型细分',
    '寤惰繜': '延迟',
    
    # Table headers that are still corrupted
    '璋冪敤': '调用',
    
    # Currency symbol  
    # \u697C (楼) should be \u00A5 (¥) - but need to be careful with exact context
}

count = 0
for old, new in fixes.items():
    if old in content:
        content = content.replace(old, new)
        count += 1
        print(f'  FIXED: {old[:30]} -> {new[:30]}')
    else:
        # Check if partial match exists
        idx = content.find(old[:5]) if len(old) >= 5 else -1
        if idx >= 0:
            context = content[idx:idx+len(old)+5]
            print(f'  PARTIAL: could not find exact: {old[:30]}')
            print(f'    Found near: {repr(context[:50])}')
        else:
            print(f'  SKIP (not found): {old[:30]}')

with open(INPUT, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nApplied {count} replacements')
