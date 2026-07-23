import os
import re
import json
from pathlib import Path
from typing import List, Dict, Any
import ast

class FrontendAnalyzer:
    def __init__(self, web_path: str):
        self.web_path = Path(web_path)
        self.pages_path = self.web_path / "src" / "pages"
        self.components_path = self.web_path / "src" / "components"
        
    def analyze_file(self, file_path: Path) -> Dict[str, Any]:
        """分析单个文件"""
        content = file_path.read_text(encoding='utf-8')
        lines = content.split('\n')
        line_count = len(lines)
        
        analysis = {
            "file": str(file_path.relative_to(self.web_path)),
            "line_count": line_count,
            "api_calls": [],
            "use_effects": [],
            "state_hooks": [],
            "imports": [],
            "rendering_issues": [],
            "performance_indicators": {},
            "is_large_component": line_count > 500
        }
        
        # 提取 API 调用
        api_patterns = [
            r"api\.(\w+)",
            r"fetch\(",
            r"axios\.(get|post|put|delete|patch)",
            r"useQuery\(",
            r"useMutation\(",
            r"\.then\(",
            r"\.catch\(",
            r"\.finally\("
        ]
        
        for pattern in api_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                analysis["api_calls"].extend(matches[:10])  # 只保留前10个避免太大
        
        # 提取 useEffect
        useEffect_pattern = r"useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([\s\S]*?)\]\)"
        analysis["use_effects"] = re.findall(useEffect_pattern, content)
        
        # 提取 useState/useReducer
        state_pattern = r"(useState|useReducer)\("
        analysis["state_hooks"] = re.findall(state_pattern, content)
        
        # 提取导入
        import_pattern = r"import\s+.*?\s+from\s+['\"](\.\.?\/.*?)['\"]"
        analysis["imports"] = re.findall(import_pattern, content)
        
        # 检查渲染问题
        if ".map(" in content and "key=" not in content:
            analysis["rendering_issues"].append("列表渲染缺少 key")
        
        map_count = content.count(".map(")
        if map_count > 5:
            analysis["rendering_issues"].append(f"多个列表渲染 ({map_count} 个 .map() 调用)")
        
        # 检查性能指标
        analysis["performance_indicators"] = {
            "has_memo": "React.memo" in content or "memo(" in content,
            "has_use_memo": "useMemo(" in content,
            "has_use_callback": "useCallback(" in content,
            "has_react_fragment": "<>" in content or "Fragment" in content,
            "inline_functions_count": len(re.findall(r"=\s*\([^)]*\)\s*=>", content)),
            "inline_styles_count": len(re.findall(r"style=\{[^}]*\}", content))
        }
        
        return analysis
    
    def analyze_directory(self, dir_path: Path, recursive: bool = True) -> List[Dict[str, Any]]:
        """分析目录下的所有文件"""
        analyses = []
        
        if not dir_path.exists():
            return analyses
            
        for item in dir_path.iterdir():
            if item.is_file() and item.suffix in ['.tsx', '.jsx']:
                try:
                    analysis = self.analyze_file(item)
                    analyses.append(analysis)
                except Exception as e:
                    print(f"分析文件 {item} 时出错: {e}")
            elif item.is_dir() and recursive:
                analyses.extend(self.analyze_directory(item, recursive))
                
        return analyses
    
    def categorize_components(self, components_analysis: List[Dict[str, Any]]) -> Dict[str, List]:
        """分类组件"""
        ui_components = []
        business_components = []
        
        for comp in components_analysis:
            file_path = comp["file"].lower()
            
            # 判断是否为通用UI组件
            is_ui_component = any(keyword in file_path for keyword in [
                "ui/", "layout/", "button", "input", "modal", 
                "dialog", "table", "form", "card", "alert"
            ])
            
            # 判断是否为业务组件
            is_business_component = any(keyword in file_path for keyword in [
                "admin/", "finance/", "agent/", "vendor/", "security/",
                "dashboard", "report", "analytics"
            ])
            
            if is_ui_component:
                ui_components.append(comp)
            elif is_business_component:
                business_components.append(comp)
            else:
                # 默认分类
                business_components.append(comp)
                
        return {
            "ui_components": ui_components,
            "business_components": business_components
        }
    
    def identify_performance_issues(self, analyses: List[Dict[str, Any]]) -> Dict[str, List]:
        """识别性能问题"""
        issues = {
            "large_components": [],
            "missing_memo": [],
            "inline_functions": [],
            "inline_styles": [],
            "missing_keys": [],
            "complex_use_effects": []
        }
        
        for analysis in analyses:
            # 大型组件
            if analysis["is_large_component"]:
                issues["large_components"].append({
                    "file": analysis["file"],
                    "line_count": analysis["line_count"]
                })
            
            # 缺少 memo 的组件
            if analysis["line_count"] > as and not analysis["performance_indicators"]["has_memo"]:
                issues["missing_memo"].append({
                    "file": analysis["file"],
                    "line_count": analysis["line_count"]
                })
            
            # 内联函数过多
            inline_funcs = analysis["performance_indicators"]["inline_functions_count"]
            if inline_funcs > 10:
                issues["inline_functions"].append({
                    "file": analysis["file"],
                    "count": inline_funcs
                })
            
            # 内联样式过多
            inline_styles = analysis["performance_indicators"]["inline_styles_count"]
            if inline_styles > 5:
                issues["inline_styles"].append({
                    "file": analysis["file"],
                    "count": inline_styles
                })
            
            # 缺少 key
            if "列表渲染缺少 key" in analysis["rendering_issues"]:
                issues["missing_keys"].append(analysis["file"])
            
            # 复杂的 useEffect
            if len(analysis["use_effects"]) > 5:
                issues["complex_use_effects"].append({
                    "file": analysis["file"],
                    "count": len(analysis["use_effects"])
                })
                
        return issues
    
    def generate_report(self) -> Dict[str, Any]:
        """生成完整报告"""
        print("开始分析 pages 目录...")
        pages_analysis = self.analyze_directory(self.pages_path)
        
        print("开始分析 components 目录...")
        components_analysis = self.analyze_directory(self.components_path)
        
        # 分类组件
        component_categories = self.categorize_components(components_analysis)
        
        # 识别性能问题
        all_analyses = pages_analysis + components_analysis
        performance_issues = self.identify_performance_issues(all_analyses)
        
        # 生成报告
        report = {
            "timestamp": "2026-07-23T00:20:00+08:00",
            "project": "3cloud-web-frontend",
            "summary": {
                "total_pages": len(pages_analysis),
                "total_components": len(components_analysis),
                "ui_components": len(component_categories["ui_components"]),
                "business_components": len(component_categories["business_components"]),
                "large_components": len(performance_issues["large_components"]),
                "components_needing_memo": len(performance_issues["missing_memo"])
            },
            "pages_analysis": pages_analysis,
            "components_analysis": {
                "ui_components": component_categories["ui_components"],
                "business_components": component_categories["business_components"]
            },
            "performance_issues": performance_issues,
            "recommendations": []
        }
        
        # 添加建议
        if performance_issues["large_components"]:
            report["recommendations"].append({
                "type": "组件拆分",
                "description": f"发现 {len(performance_issues['large_components'])} 个大型组件（超过500行），建议拆分为更小的子组件",
                "components": [c["file"] for c in performance_issues["large_components"][:10]]
            })
        
        if performance_issues["missing_memo"]:
            report["recommendations"].append({
                "type": "性能优化",
                "description": f"发现 {len(performance_issues['missing_memo'])} 个组件缺少 React.memo 包装",
                "components": [c["file"] for c in performance_issues["missing_memo"][:10]]
            })
            
        if performance_issues["inline_functions"]:
            report["recommendations"].append({
                "type": "渲染优化",
                "description": f"发现 {len(performance_issues['inline_functions'])} 个组件使用过多内联函数",
                "components": [c["file"] for c in performance_issues["inline_functions"][:5]]
            })
            
        return report

def main():
    analyzer = FrontendAnalyzer("3cloud/web")
    report = analyzer.generate_report()
    
    # 保存报告
    output_path = Path("3cloud/PERF-ANALYSIS/frontend-modules.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"报告已保存到: {output_path}")
    print(f"分析完成:")
    print(f"- 页面数量: {report['summary']['total_pages']}")
    print(f"- 组件数量: {report['summary']['total_components']}")
    print(f"- 大型组件: {report['summary']['large_components']}")
    print(f"- 需要 memo 的组件: {report['summary']['components_needing_memo']}")

if __name__ == "__main__":
    main()