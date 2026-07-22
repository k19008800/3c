#!/usr/bin/env python3
"""修复 PUA 字符腐烂"""
import os
import re
from collections import defaultdict

# PUA 字符 → 正确中文映射（基于上下文推断）
# 这些是常见的中文字符被错误编码为 PUA
PUA_FIX_MAP = {
    # 注释中的常见词
    '\ue17b': '的',
    '\ue766': '路',
    '\ue187': '证',
    '\ue178': '名',
    '\ue043': '实',
    '\ue1ec': '上',
    '\ue168': '传',
    '\ue044': '文',
    '\ue048': '件',
    '\ue1d7': '息',
    '\ue21c': '用',
    '\ue1be': '户',
    '\ue188': '登',
    '\ue160': '注',
    '\ue1bd': '册',
    '\ue18c': '验',
    '\ue0a1': '码',
    '\ue11c': '接',
    '\ue1c6': '口',
    '\ue224': '权',
    '\ue632': '限',
    '\ue046': '安',
    '\ue100': '全',
    '\ue219': '获',
    '\ue576': '取',
    '\ue11e': '配',
    '\ue523': '置',
    '\ue7c8': '重',
    '\ue0ac': '设',
}

# U+FFFD 替换字符 → 根据上下文推断
# U+FF1F 全角问号 → 半角问号
def fix_content(content: str) -> tuple[str, int, dict]:
    """修复内容中的 PUA 字符，返回 (修复后内容, 修复数, 统计)"""
    fixed = content
    stats = defaultdict(int)
    total = 0
    
    # 1. 替换已知 PUA 映射
    for pua, correct in PUA_FIX_MAP.items():
        count = fixed.count(pua)
        if count > 0:
            fixed = fixed.replace(pua, correct)
            stats[f"U+{ord(pua):04X}→{correct}"] = count
            total += count
    
    # 2. U+FF1F 全角问号 → 半角问号
    count = fixed.count('\uff1f')
    if count > 0:
        fixed = fixed.replace('\uff1f', '?')
        stats['U+FF1F→?'] = count
        total += count
    
    # 3. U+FFFD 替换字符 → 尝试根据上下文推断
    # 常见模式："??" → "的"、"是"、"在" 等
    # 由于无法确定，保守处理：标记为待人工确认
    ffd_count = fixed.count('\ufffd')
    if ffd_count > 0:
        # 暂时替换为占位符 [待修复]
        # fixed = fixed.replace('\ufffd', '[待修复]')
        stats['U+FFFD(需人工)'] = ffd_count
        total += ffd_count
    
    return fixed, total, dict(stats)


def scan_and_fix(dry_run: bool = True):
    """扫描并修复所有文件"""
    pua_pattern = re.compile(r'[\ue000-\uf8ff\ufffd\uff1f]')
    
    results = []
    scanned = 0
    
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.git', '.vite', '__pycache__']]
        
        for f in files:
            if f.endswith(('.tsx', '.ts', '.jsx', '.js')):
                path = os.path.join(root, f)
                scanned += 1
                try:
                    with open(path, 'r', encoding='utf-8') as fp:
                        content = fp.read()
                    
                    matches = pua_pattern.findall(content)
                    if matches:
                        fixed_content, fix_count, stats = fix_content(content)
                        
                        results.append({
                            'path': path,
                            'original_count': len(matches),
                            'fix_count': fix_count,
                            'stats': stats,
                            'fixed_content': fixed_content,
                            'original_content': content
                        })
                        
                        if not dry_run:
                            # 写回文件
                            with open(path, 'w', encoding='utf-8') as fp:
                                fp.write(fixed_content)
                            
                except Exception as e:
                    print(f"Error: {path}: {e}")
    
    return results, scanned


if __name__ == '__main__':
    import sys
    
    dry_run = '--fix' not in sys.argv
    
    print(f"模式: {'扫描' if dry_run else '修复'}\n")
    results, scanned = scan_and_fix(dry_run)
    
    print(f"扫描文件: {scanned}")
    print(f"发现问题文件: {len(results)}\n")
    
    if results:
        total_original = sum(r['original_count'] for r in results)
        total_fixed = sum(r['fix_count'] for r in results)
        
        print("=" * 80)
        for r in sorted(results, key=lambda x: -x['original_count']):
            print(f"\n文件: {r['path']}")
            print(f"  PUA 数: {r['original_count']}")
            print(f"  可修复: {r['fix_count']}")
            print(f"  统计: {r['stats']}")
        
        print("\n" + "=" * 80)
        print(f"\n汇总:")
        print(f"  总 PUA 字符: {total_original}")
        print(f"  可自动修复: {total_fixed}")
        print(f"  需人工确认: {total_original - total_fixed}")
        
        if dry_run:
            print(f"\n[TIP] 运行 'python {sys.argv[0]} --fix' 执行修复")
        else:
            print(f"\n[OK] 已修复 {len(results)} 个文件")
