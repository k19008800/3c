import os
import re
import json
from pathlib import Path
from collections import defaultdict

def analyze_api_calls():
    web_root = Path("C:/Users/ZH/.openclaw/workspace/3cloud/web")
    pages_dir = web_root / "src/pages"
    
    api_calls = defaultdict(lambda: {
        'fetch_calls': [],
        'axios_calls': [],
        'useQuery_calls': [],
        'useMutation_calls': [],
        'total_calls': 0
    })
    
    for tsx_file in pages_dir.rglob("*.tsx"):
        try:
            content = tsx_file.read_text(encoding='utf-8')
            relative_path = tsx_file.relative_to(web_root).as_posix()
            
            # Find fetch calls with line numbers
            fetch_matches = list(re.finditer(r'fetch\s*\(', content))
            fetch_calls = []
            for match in fetch_matches:
                line_num = content[:match.start()].count('\n') + 1
                # Extract some context
                start = max(0, match.start() - 50)
                end = min(len(content), match.end() + 100)
                fetch_calls.append({
                    'line': line_num,
                    'context': content[start:end].replace('\n', ' ').strip()
                })
            
            # Find axios calls
            axios_matches = list(re.finditer(r'axios\.(get|post|put|delete|patch)\s*\(', content))
            axios_calls = []
            for match in axios_matches:
                line_num = content[:match.start()].count('\n') + 1
                start = max(0, match.start() - 50)
                end = min(len(content), match.end() + 100)
                axios_calls.append({
                    'line': line_num,
                    'method': match.group(1),
                    'context': content[start:end].replace('\n', ' ').strip()
                })
            
            # Find useQuery calls
            usequery_matches = list(re.finditer(r'useQuery\s*\(', content))
            usequery_calls = []
            for match in usequery_matches:
                line_num = content[:match.start()].count('\n') + 1
                start = max(0, match.start() - 50)
                end = min(len(content), match.end() + 100)
                usequery_calls.append({
                    'line': line_num,
                    'context': content[start:end].replace('\n', ' ').strip()
                })
            
            # Find useMutation calls
            usemutation_matches = list(re.finditer(r'useMutation\s*\(', content))
            usemutation_calls = []
            for match in usemutation_matches:
                line_num = content[:match.start()].count('\n') + 1
                start = max(0, match.start() - 50)
                end = min(len(content), match.end() + 100)
                usemutation_calls.append({
                    'line': line_num,
                    'context': content[start:end].replace('\n', ' ').strip()
                })
            
            total_calls = len(fetch_calls) + len(axios_calls) + len(usequery_calls) + len(usemutation_calls)
            
            if total_calls > 0:
                api_calls[relative_path] = {
                    'fetch_calls': fetch_calls,
                    'axios_calls': axios_calls,
                    'useQuery_calls': usequery_calls,
                    'useMutation_calls': usemutation_calls,
                    'total_calls': total_calls
                }
                
        except Exception as e:
            print(f'Error analyzing {tsx_file}: {e}')
    
    # Calculate totals
    total_stats = {
        'total_fetch_calls': sum(len(page['fetch_calls']) for page in api_calls.values()),
        'total_axios_calls': sum(len(page['axios_calls']) for page in api_calls.values()),
        'total_useQuery_calls': sum(len(page['useQuery_calls']) for page in api_calls.values()),
        'total_useMutation_calls': sum(len(page['useMutation_calls']) for page in api_calls.values()),
        'total_api_calls': sum(page['total_calls'] for page in api_calls.values()),
        'pages_with_api_calls': len(api_calls),
        'total_pages_analyzed': len(list(pages_dir.rglob("*.tsx")))
    }
    
    # Save results
    output_dir = Path("C:/Users/ZH/.openclaw/workspace/3cloud/PERF-ANALYSIS")
    output_dir.mkdir(exist_ok=True)
    
    output_data = {
        'api_calls_by_page': dict(api_calls),
        'total_statistics': total_stats,
        'average_api_calls_per_page': total_stats['total_api_calls'] / max(1, total_stats['pages_with_api_calls'])
    }
    
    output_file = output_dir / "frontend-api-calls.json"
    output_file.write_text(json.dumps(output_data, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print(f'API call analysis completed')
    print(f'Pages analyzed: {total_stats["total_pages_analyzed"]}')
    print(f'Pages with API calls: {total_stats["pages_with_api_calls"]}')
    print(f'Total fetch calls: {total_stats["total_fetch_calls"]}')
    print(f'Total axios calls: {total_stats["total_axios_calls"]}')
    print(f'Total useQuery calls: {total_stats["total_useQuery_calls"]}')
    print(f'Total useMutation calls: {total_stats["total_useMutation_calls"]}')
    print(f'Total API calls: {total_stats["total_api_calls"]}')
    print(f'Average API calls per page (with calls): {output_data["average_api_calls_per_page"]:.2f}')
    
    return output_data

if __name__ == "__main__":
    analyze_api_calls()