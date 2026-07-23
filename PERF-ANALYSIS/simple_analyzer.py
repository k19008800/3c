import os
import re
import json
from pathlib import Path
from typing import List, Dict, Any

def count_lines(file_path: Path) -> int:
    """计算文件行数"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return sum(1 for _ in f)
    except:
        return 0

def analyze_file(file_path: Path, base_path: Path) -> Dict[str, Any]:
    """分析单个文件"""
    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        return {"file": str(file_path.relative_to(base_path)), "error": str(e)}
    
    lines = content.split('\n')
    line_count = len(lines)
    
    # 查找API调用
    api_patterns = [
        (r"api\.(\w+)", "api."),
        (r"fetch\(", "fetch"),
        (r"axios\.", "axios"),
        (r"useQuery\(", "useQuery"),
        (r"useMutation\(", "useMutation"),
        (r"\.then\(", "promise.then"),
        (r"\.catch\(", "promise.catch")
    ]
    
    api_calls = []
    for pattern, label in api_patterns:
        matches = re.findall(pattern, content)
        if matches:
            api_calls.append(f"{label}: {len(matches)} calls")
    
    # 查找useEffect
    use_effects = re.findall(r"useEffect\(", content)
    
    # 查找useState/useReducer
    state_hooks = re.findall(r"(useState|useReducer)\(", content)
    
    # 检查性能问题
    performance_issues = []
    
    # 检查是否有React.memo
    has_memo = "React.memo" in content or "memo(" in content
    
    # 检查是否有useMemo/useCallback
    has_use_memo = "useMemo(" in content
    has_use_callback = "useCallback(" in content
    
    # 检查列表渲染是否有key
    map_without_key = re.findall(r'\.map\([^)]*\)\s*=>\s*\{[^}]*\}', content)
    if map_without_key and "key=" not in content:
        performance_issues.append("列表渲染可能缺少key属性")
    
    # 检查内联函数
    inline_funcs = len(re.findall(r'=\s*\([^)]*\)\s*=>', content))
    if inline_funcs > 10:
        performance_issues.append(f"过多内联函数 ({inline_funcs}个)")
    
    # 检查内联样式
    inline_styles = len(re.findall(r'style=\{[^}]*\}', content))
    if inline_styles > 5:
        performance_issues.append(f"过多内联样式 ({inline_styles}个)")
    
    return {
        "file": str(file_path.relative_to(base_path)),
        "line_count": line_count,
        "is_large": line_count > 500,
        "api_calls": api_calls[:5],  # 只保留前5个
        "use_effect_count": len(use_effects),
        "state_hook_count": len(state_hooks),
        "performance_issues": performance_issues,
        "optimizations": {
            "has_memo": has_memo,
            "has_use_memo": has_use_memo,
            "has_use_callback": has_use_callback
        }
    }

def scan_directory(dir_path: Path, extensions: List[str]) -> List[Dict[str, Any]]:
    """扫描目录并分析文件"""
    results = []
    
    if not dir_path.exists():
        return results
    
    for root, dirs, files in os.walk(dir_path):
        root_path = Path(root)
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                file_path = root_path / file
                analysis = analyze_file(file_path, dir_path.parent)
                results.append(analysis)
    
    return results

def main():
    web_path = Path("3cloud/web")
    pages_path = web_path / "src" / "pages"
    components_path = web_path / "src" / "components"
    
    print("开始分析页面组件...")
    pages = scan_directory(pages_path, [".tsx", ".jsx"])
    
    print("开始分析通用组件...")
    components = scan_directory(components_path, [".tsx", ".jsx"])
    
    # 分类组件
    ui_components = []
    business_components = []
    
    for comp in components:
        file_path = comp["file"].lower()
        if any(keyword in file_path for keyword in ["ui/", "layout/", "button", "input", "modal"]):
            ui_components.append(comp)
        else:
            business_components.append(comp)
    
    # 找出大型组件
    large_pages = [p for p in pages if p["is_large"]]
    large_components = [c for c in components if c["is_large"]]
    
    # 找出有性能问题的组件
    problematic_pages = [p for p in pages if p["performance_issues"]]
    problematic_components = [c for c in components if c["performance_issues"]]
    
    # 找出缺少优化的组件
    pages_needing_memo = [p for p in pages if not p["optimizations"]["has_memo"] and p["line_count"] > 100]
    components_needing_memo = [c for c in components if not c["optimizations"]["has_memo"] and c["line_count"] > 50]
    
    # 生成报告
    report = {
        "timestamp": "2026-07-23T00:30:00+08:00",
        "project": "3cloud-web-frontend",
        "statistics": {
            "total_pages": len(pages),
            "total_components": len(components),
            "ui_components": len(ui_components),
            "business_components": len(business_components),
            "large_pages": len(large_pages),
            "large_components": len(large_components),
            "problematic_pages": len(problematic_pages),
            "problematic_components": len(problematic_components),
            "pages_needing_memo": len(pages_needing_memo),
            "components_needing_memo": len(components_needing_memo)
        },
        "large_components_list": [
            {
                "file": comp["file"],
                "line_count": comp["line_count"],
                "type": "page" if comp in pages else "component"
            }
            for comp in large_pages + large_components
        ],
        "performance_issues_summary": {
            "pages_with_issues": [
                {
                    "file": p["file"],
                    "issues": p["performance_issues"],
                    "line_count": p["line_count"]
                }
                for p in problematic_pages[:10]  # 只显示前10个
            ],
            "components_with_issues": [
                {
                    "file": c["file"],
                    "issues": c["performance_issues"],
                    "line_count": c["line_count"]
                }
                for c in problematic_components[:10]
            ]
        },
        "optimization_recommendations": {
            "components_needing_memo": [
                {
                    "file": c["file"],
                    "line_count": c["line_count"],
                    "type": "page" if c in pages else "component"
                }
                for c in (pages_needing_memo + components_needing_memo)[:20]
            ]
        }
    }
    
    # 保存报告
    output_path = Path("3cloud/PERF-ANALYSIS/frontend-modules.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"\n分析完成:")
    print(f"- 共分析 {len(pages)} 个页面")
    print(f"- 共分析 {len(components)} 个组件")
    print(f"- 发现 {len(large_pages + large_components)} 个大型组件（>500行）")
    print(f"- 发现 {len(problematic_pages + problematic_components)} 个有性能问题的组件")
    print(f"- {len(pages_needing_memo + components_needing_memo)} 个组件建议添加 React.memo")
    print(f"\n报告已保存到: {output_path}")

if __name__ == "__main__":
    main()