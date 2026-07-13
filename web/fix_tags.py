import os, sys

base = r'C:\Users\ZH\.openclaw\workspace\3cloud\web\src\pages\admin'

files = os.listdir(base)
for fn in files:
    if not fn.endswith('.tsx'):
        continue
    fpath = os.path.join(base, fn)
    with open(fpath, 'rb') as f:
        data = f.read()
    count = 0
    # Fix: ? (U+FF1F) before tag names like ?span, ?div, ?button, ?h3 should be <
    for tag in [b'span', b'div', b'button', b'h3', b'h2', b'h1', b'p>', b'code', b'input', b'select', b'textarea', b'label', b'table', b'thead', b'tbody', b'tr', b'th', b'td', b'img', b'svg', b'path', b'WaterBar']:
        pattern = b'\uff1f' + tag
        replacement = b'<' + tag
        if pattern in data:
            data = data.replace(pattern, replacement)
            count += 1
    
    # Also fix subdirectories
    if count > 0:
        with open(fpath, 'wb') as f:
            f.write(data)
        print(f'{fn}: Fixed {count} tag patterns')

# Check subdirectories
for sub in ['enterprise-analysis', 'finance']:
    subpath = os.path.join(base, sub)
    if os.path.isdir(subpath):
        for fn in os.listdir(subpath):
            if not fn.endswith('.tsx'):
                continue
            fpath = os.path.join(subpath, fn)
            with open(fpath, 'rb') as f:
                data = f.read()
            count = 0
            for tag in [b'span', b'div', b'button', b'h3', b'h2', b'h1', b'p>', b'code', b'input', b'select', b'textarea', b'label', b'table', b'thead', b'tbody', b'tr', b'th', b'td', b'img', b'svg', b'path', b'WaterBar']:
                pattern = b'\uff1f' + tag
                replacement = b'<' + tag
                if pattern in data:
                    data = data.replace(pattern, replacement)
                    count += 1
            if count > 0:
                with open(fpath, 'wb') as f:
                    f.write(data)
                print(f'{sub}/{fn}: Fixed {count} tag patterns')

print('Scan complete')
