import os
import re
import json
from pathlib import Path

def analyze_frontend_stats():
    web_root = Path("C:/Users/ZH/.openclaw/workspace/3cloud/web")
    
    # Page count
    pages_dir = web_root / "src/pages"
    page_files = list(pages_dir.rglob("*.tsx"))
    page_count = len(page_files)
    
    # Component count
    components_dir = web_root / "src/components"
    component_files = list(components_dir.rglob("*.tsx"))
    component_count = len(component_files)
    
    # Total TSX files count
    src_dir = web_root / "src"
    total_tsx_files = len(list(src_dir.rglob("*.tsx")))
    
    # Analyze App.tsx for routing
    app_file = web_root / "src/App.tsx"
    route_info = {}
    if app_file.exists():
        try:
            content = app_file.read_text(encoding='utf-8')
            
            # Count route elements
            route_elements = len(re.findall(r'<Route\s', content))
            
            # Count lazy imports
            lazy_imports = len(re.findall(r'lazy\s*\(', content))
            
            # Look for nested routes pattern
            nested_pattern = r'<Route[^>]*>.*?<Routes'
            nested_routes = len(re.findall(nested_pattern, content, re.DOTALL))
            
            route_info = {
                'route_elements': route_elements,
                'lazy_imports': lazy_imports,
                'nested_routes': nested_routes,
                'has_routes_config': '<Routes>' in content or '<BrowserRouter>' in content
            }
        except Exception as e:
            route_info = {'error': str(e)}
    
    # Package.json analysis
    package_file = web_root / "package.json"
    package_info = {}
    if package_file.exists():
        try:
            package_data = json.loads(package_file.read_text(encoding='utf-8'))
            package_info = {
                'dependencies_count': len(package_data.get('dependencies', {})),
                'devDependencies_count': len(package_data.get('devDependencies', {})),
                'react_version': package_data.get('dependencies', {}).get('react', 'unknown'),
                'typescript_version': package_data.get('devDependencies', {}).get('typescript', 'unknown'),
                'vite_version': package_data.get('devDependencies', {}).get('vite', 'unknown')
            }
        except Exception as e:
            package_info = {'error': str(e)}
    
    # Compile stats
    stats = {
        'page_statistics': {
            'total_pages': page_count,
            'page_files_list': [f.relative_to(web_root).as_posix() for f in page_files[:10]],  # First 10
            'pages_by_depth': analyze_page_depth(page_files, web_root)
        },
        'component_statistics': {
            'total_components': component_count,
            'component_files_list': [f.relative_to(web_root).as_posix() for f in component_files[:10]],  # First 10
            'components_by_directory': analyze_component_structure(components_dir, web_root)
        },
        'file_statistics': {
            'total_tsx_files': total_tsx_files,
            'tsx_files_by_directory': analyze_tsx_distribution(src_dir, web_root)
        },
        'routing_statistics': route_info,
        'package_statistics': package_info,
        'analysis_timestamp': str(Path.cwd())
    }
    
    # Save results
    output_dir = Path("C:/Users/ZH/.openclaw/workspace/3cloud/PERF-ANALYSIS")
    output_dir.mkdir(exist_ok=True)
    
    output_file = output_dir / "frontend-stats.json"
    output_file.write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print(f'Frontend statistics analysis completed')
    print(f'Total pages: {page_count}')
    print(f'Total components: {component_count}')
    print(f'Total TSX files: {total_tsx_files}')
    if route_info.get('route_elements'):
        print(f'Route elements: {route_info["route_elements"]}')
        print(f'Lazy imports: {route_info["lazy_imports"]}')
    
    return stats

def analyze_page_depth(page_files, web_root):
    depth_count = {}
    for file in page_files:
        relative_path = file.relative_to(web_root).as_posix()
        depth = relative_path.count('/')
        depth_count[depth] = depth_count.get(depth, 0) + 1
    return depth_count

def analyze_component_structure(components_dir, web_root):
    structure = {}
    for file in components_dir.rglob("*.tsx"):
        relative_path = file.relative_to(components_dir).as_posix()
        dir_path = os.path.dirname(relative_path)
        if dir_path:
            structure[dir_path] = structure.get(dir_path, 0) + 1
        else:
            structure['root'] = structure.get('root', 0) + 1
    return structure

def analyze_tsx_distribution(src_dir, web_root):
    distribution = {}
    for file in src_dir.rglob("*.tsx"):
        relative_path = file.relative_to(src_dir).as_posix()
        dir_path = os.path.dirname(relative_path)
        if dir_path:
            distribution[dir_path] = distribution.get(dir_path, 0) + 1
        else:
            distribution['root'] = distribution.get('root', 0) + 1
    return distribution

if __name__ == "__main__":
    analyze_frontend_stats()