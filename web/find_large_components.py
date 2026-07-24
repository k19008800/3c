import os
import json
from pathlib import Path

def find_large_components():
    web_root = Path("C:/Users/ZH/.openclaw/workspace/3cloud/web")
    src_dir = web_root / "src"
    threshold = 500
    large_components = []
    
    total_files = 0
    
    for tsx_file in src_dir.rglob("*.tsx"):
        total_files += 1
        try:
            # Count lines
            with tsx_file.open(encoding='utf-8') as f:
                line_count = sum(1 for _ in f)
                
            if line_count > threshold:
                relative_path = tsx_file.relative_to(web_root).as_posix()
                large_components.append({
                    'file': relative_path,
                    'lines': line_count
                })
        except Exception as e:
            print(f'Error reading {tsx_file}: {e}')
    
    # Sort by line count
    large_components.sort(key=lambda x: x['lines'], reverse=True)
    
    output_dir = Path("C:/Users/ZH/.openclaw/workspace/3cloud/PERF-ANALYSIS")
    output_dir.mkdir(exist_ok=True)
    
    output_data = {
        'large_components': large_components,
        'threshold': threshold,
        'total_files_analyzed': total_files,
        'files_above_threshold': len(large_components)
    }
    
    output_file = output_dir / "frontend-large-components.json"
    output_file.write_text(json.dumps(output_data, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print(f'Analyzed {total_files} TSX files')
    print(f'Found {len(large_components)} large components (> {threshold} lines)')
    print(f'Saved to {output_file}')
    
    return large_components

if __name__ == "__main__":
    find_large_components()