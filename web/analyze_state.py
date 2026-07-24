import os
import re
import json
from pathlib import Path
from collections import defaultdict

def analyze_state_management():
    web_root = Path("C:/Users/ZH/.openclaw/workspace/3cloud/web")
    pages_dir = web_root / "src/pages"
    
    state_stats = defaultdict(lambda: {
        'useState_count': 0,
        'useReducer_count': 0,
        'useContext_count': 0,
        'total_hooks': 0
    })
    
    for tsx_file in pages_dir.rglob("*.tsx"):
        try:
            content = tsx_file.read_text(encoding='utf-8')
            relative_path = tsx_file.relative_to(web_root).as_posix()
            
            # Count useState
            useState_count = len(re.findall(r'useState\s*\(', content))
            
            # Count useReducer
            useReducer_count = len(re.findall(r'useReducer\s*\(', content))
            
            # Count useContext
            useContext_count = len(re.findall(r'useContext\s*\(', content))
            
            total_hooks = useState_count + useReducer_count + useContext_count
            
            state_stats[relative_path] = {
                'useState_count': useState_count,
                'useReducer_count': useReducer_count,
                'useContext_count': useContext_count,
                'total_hooks': total_hooks
            }
            
        except Exception as e:
            print(f'Error analyzing {tsx_file}: {e}')
    
    # Calculate totals
    total_state = {
        'total_useState': sum(stats['useState_count'] for stats in state_stats.values()),
        'total_useReducer': sum(stats['useReducer_count'] for stats in state_stats.values()),
        'total_useContext': sum(stats['useContext_count'] for stats in state_stats.values()),
        'total_pages': len(state_stats),
        'total_hooks': sum(stats['total_hooks'] for stats in state_stats.values())
    }
    
    # Save results
    output_dir = Path("C:/Users/ZH/.openclaw/workspace/3cloud/PERF-ANALYSIS")
    output_dir.mkdir(exist_ok=True)
    
    output_data = {
        'state_statistics_by_page': dict(state_stats),
        'total_statistics': total_state,
        'average_hooks_per_page': total_state['total_hooks'] / max(1, total_state['total_pages'])
    }
    
    output_file = output_dir / "frontend-state-stats.json"
    output_file.write_text(json.dumps(output_data, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print(f'State management analysis completed')
    print(f'Pages analyzed: {total_state["total_pages"]}')
    print(f'Total useState hooks: {total_state["total_useState"]}')
    print(f'Total useReducer hooks: {total_state["total_useReducer"]}')
    print(f'Total useContext hooks: {total_state["total_useContext"]}')
    print(f'Average hooks per page: {output_data["average_hooks_per_page"]:.2f}')
    
    return output_data

if __name__ == "__main__":
    analyze_state_management()