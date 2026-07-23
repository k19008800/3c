import json

with open('3cloud/PERF-ANALYSIS/frontend-modules.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("性能问题总结:")
print("=" * 50)

if "performance_issues_summary" in data:
    issues = data["performance_issues_summary"]
    
    print("\n有问题的页面:")
    for page in issues.get("pages_with_issues", []):
        print(f"  - {page['file']}")
        print(f"    问题: {', '.join(page['issues'])}")
        print(f"    行数: {page['line_count']}")
        print()
    
    print("\n有问题的组件:")
    for comp in issues.get("components_with_issues", []):
        print(f"  - {comp['file']}")
        print(f"    问题: {', '.join(comp['issues'])}")
        print(f"    行数: {comp['line_count']}")
        print()

print("\n缺少memo优化的组件（前20个）:")
print("=" * 50)

if "optimization_recommendations" in data:
    recs = data["optimization_recommendations"]
    for comp in recs.get("components_needing_memo", [])[:20]:
        print(f"  - {comp['file']} ({comp['line_count']}行)")
    
print(f"\n总计: {len(recs.get('components_needing_memo', []))} 个组件需要memo优化")