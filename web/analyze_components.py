import os
import re
import json
from pathlib import Path

def analyze_component_dependencies():
    web_root = Path("C:/Users/ZH/.openclaw/workspace/3cloud/web")
    pages_dir = web_root / "src/pages"
    
    dependencies = {}
    
    # Find all .tsx files in pages directory
    for tsx_file in pages_dir.rglob("*.tsx"):
        relative_path = tsx_file.relative_to(web_root).as_posix()
        content = tsx_file.read_text(encoding="utf-8")
        
        # Find all imports from @/components
        import_pattern = r'import.*from\s+[\'"](@/components/.*?)[\'"]'
        imports = re.findall(import_pattern, content)
        
        if imports:
            dependencies[relative_path] = imports
    
    # Save to JSON
    output_dir = Path("C:/Users/ZH/.openclaw/workspace/3cloud/PERF-ANALYSIS")
    output_dir.mkdir(exist_ok=True)
    
    output_data = {
        "component_dependencies": dependencies,
        "total_pages": len(dependencies),
        "total_component_imports": sum(len(imports) for imports in dependencies.values())
    }
    
    output_file = output_dir / "frontend-component-tree.json"
    output_file.write_text(json.dumps(output_data, indent=2, ensure_ascii=False), encoding="utf-8")
    
    print(f"Analyzed {len(dependencies)} pages")
    print(f"Total component imports: {output_data['total_component_imports']}")
    print(f"Saved to {output_file}")

if __name__ == "__main__":
    analyze_component_dependencies()