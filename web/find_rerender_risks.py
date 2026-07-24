import os
import re
import json
from pathlib import Path

def find_rerender_risks():
    web_root = Path("C:/Users/ZH/.openclaw/workspace/3cloud/web")
    src_dir = web_root / "src"
    
    rerender_risks = {
        'missing_memo': [],
        'inline_objects': [],
        'inline_functions': [],
        'missing_use_callback': [],
        'missing_use_memo': []
    }
    
    for tsx_file in src_dir.rglob("*.tsx"):
        try:
            content = tsx_file.read_text(encoding='utf-8')
            relative_path = tsx_file.relative_to(web_root).as_posix()
            
            # Check for pure function components without React.memo
            # Look for function components that don't have memo
            if re.search(r'function\s+\w+\s*\([^)]*\)\s*{', content) and 'React.memo' not in content:
                # Check if it's a component (capital letter convention)
                function_matches = re.findall(r'function\s+([A-Z][\w]*)\s*\(', content)
                for func_name in function_matches:
                    # Skip hooks and utilities
                    if not func_name.startswith('use'):
                        rerender_risks['missing_memo'].append({
                            'file': relative_path,
                            'component': func_name,
                            'line': content[:content.find(f'function {func_name}')].count('\n') + 1
                        })
            
            # Check for inline objects as props
            inline_object_pattern = r'<[^>]+=\s*{\s*{[^}]*}\s*}'
            matches = list(re.finditer(inline_object_pattern, content))
            for match in matches:
                line_num = content[:match.start()].count('\n') + 1
                rerender_risks['inline_objects'].append({
                    'file': relative_path,
                    'line': line_num,
                    'snippet': match.group()[:100]
                })
            
            # Check for inline functions as props
            inline_func_pattern = r'<[^>]+=\s*{\s*\([^)]*\)\s*=>[^}]*}'
            matches = list(re.finditer(inline_func_pattern, content))
            for match in matches:
                line_num = content[:match.start()].count('\n') + 1
                rerender_risks['inline_functions'].append({
                    'file': relative_path,
                    'line': line_num,
                    'snippet': match.group()[:100]
                })
            
            # Check for event handlers without useCallback
            # Look for onClick, onChange, etc handlers in JSX
            event_handler_pattern = r'(onClick|onChange|onSubmit|onBlur|onFocus|onKeyDown|onKeyUp)\s*=\s*{[^}]*}\s*}'
            matches = list(re.finditer(event_handler_pattern, content))
            for match in matches:
                # Check if useCallback is used somewhere before this line
                line_content = content[:match.start()]
                if 'useCallback' not in line_content:
                    line_num = content[:match.start()].count('\n') + 1
                    rerender_risks['missing_use_callback'].append({
                        'file': relative_path,
                        'line': line_num,
                        'event': match.group(1),
                        'snippet': match.group()[:100]
                    })
            
            # Check for expensive calculations without useMemo
            # Look for complex expressions in JSX that could be memoized
            complex_calc_pattern = r'{\s*(?:[^{}]*{[^{}]*}[^{}]*)+}'
            matches = list(re.finditer(complex_calc_pattern, content))
            for match in matches:
                snippet = match.group()
                if len(snippet) > 100 and 'useMemo' not in content[:match.start()]:
                    line_num = content[:match.start()].count('\n') + 1
                    rerender_risks['missing_use_memo'].append({
                        'file': relative_path,
                        'line': line_num,
                        'snippet': snippet[:100] + '...'
                    })
                    
        except Exception as e:
            print(f'Error analyzing {tsx_file}: {e}')
    
    # Save results
    output_dir = Path("C:/Users/ZH/.openclaw/workspace/3cloud/PERF-ANALYSIS")
    output_dir.mkdir(exist_ok=True)
    
    # Count totals
    totals = {key: len(value) for key, value in rerender_risks.items()}
    
    output_data = {
        'rerender_risks': rerender_risks,
        'totals': totals,
        'files_analyzed': len(list(src_dir.rglob("*.tsx")))
    }
    
    output_file = output_dir / "frontend-rerender-risks.json"
    output_file.write_text(json.dumps(output_data, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print(f'Rerender risk analysis completed')
    print(f'Files analyzed: {output_data["files_analyzed"]}')
    for risk_type, count in totals.items():
        print(f'{risk_type}: {count} instances')
    
    return rerender_risks

if __name__ == "__main__":
    find_rerender_risks()