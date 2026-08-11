import re

path = 'src/Dashboard.jsx'
lines = open(path, encoding='utf-8').read().split('\n')

# Process lines 4701-8280 (1-indexed) -> index 4700..8279
start, end = 4700, 8280

# Exact hex token -> replacement (whole token, case-insensitive)
hex_map = {
    # dark text -> var(--text)
    '#0f2344': 'var(--text)', '#102441': 'var(--text)', '#0a1d39': 'var(--text)',
    '#16233a': 'var(--text)', '#111827': 'var(--text)', '#233b59': 'var(--text)',
    '#2e405a': 'var(--text)', '#344962': 'var(--text)', '#374151': 'var(--text)',
    '#40546e': 'var(--text)', '#0f1a32': 'var(--text)', '#071a37': 'var(--text)',
    '#3d4d68': 'var(--text)', '#4a0f14': 'var(--text)',
    # muted text -> var(--muted)
    '#47597a': 'var(--muted)', '#6a7c95': 'var(--muted)', '#7d8ca7': 'var(--muted)',
    '#7787a0': 'var(--muted)', '#98a5bd': 'var(--muted)', '#6b7280': 'var(--muted)',
    '#62738b': 'var(--muted)', '#5c6e88': 'var(--muted)', '#6f7f98': 'var(--muted)',
    '#58708f': 'var(--muted)', '#697b95': 'var(--muted)', '#4a5568': 'var(--muted)',
    '#94a3b8': 'var(--muted)', '#7a8ea8': 'var(--muted)', '#4c5c76': 'var(--muted)',
    '#8491a4': 'var(--muted)', '#6d7e97': 'var(--muted)', '#6a7890': 'var(--muted)',
    '#6b7a95': 'var(--muted)', '#6c7d95': 'var(--muted)', '#75839a': 'var(--muted)',
    '#4a5b78': 'var(--muted)', '#8595ad': 'var(--muted)', '#9aa6bd': 'var(--muted)',
    '#b8c1d0': 'var(--muted)', '#b7a7a9': 'var(--muted)', '#5a4a2a': 'var(--muted)',
    '#9a5560': 'var(--muted)', '#d3a3a8': 'var(--muted)', '#57647a': 'var(--muted)',
    '#6a7488': 'var(--muted)',
    # blue accents -> var(--primary)
    '#2371f4': 'var(--primary)', '#1672ef': 'var(--primary)', '#0755d4': 'var(--primary)',
    '#1666e7': 'var(--primary)', '#0c61e4': 'var(--primary)', '#0c50d0': 'var(--primary)',
    '#1267e8': 'var(--primary)', '#075bea': 'var(--primary)', '#2563eb': 'var(--primary)',
    '#4b8df4': 'var(--primary)', '#1e6cf1': 'var(--primary)', '#2a4a8a': 'var(--primary)',
    '#1458aa': 'var(--primary)', '#0f4bbf': 'var(--primary-hi)', '#062a69': 'var(--primary-hi)',
    '#23517e': 'var(--text)',
    # green -> var(--success)
    '#12af64': 'var(--success)', '#0a8a45': 'var(--success)', '#079452': 'var(--success)',
    '#0ba45d': 'var(--success)', '#11b865': 'var(--success)', '#2ad57e': 'var(--success)',
    '#08a860': 'var(--success)', '#07854b': 'var(--success)', '#087c48': 'var(--success)',
    '#16c47a': 'var(--success)', '#12874d': 'var(--success)',
    # green tint bg -> success tint
    '#e6f7ec': 'rgba(36, 215, 119, 0.12)', '#dcf8e9': 'rgba(36, 215, 119, 0.12)',
    '#e8f9f0': 'rgba(36, 215, 119, 0.12)', '#e6f8ef': 'rgba(36, 215, 119, 0.12)',
    '#e8f9f1': 'rgba(36, 215, 119, 0.12)', '#ecfaef': 'rgba(36, 215, 119, 0.12)',
    '#f0fbf6': 'rgba(36, 215, 119, 0.12)', '#b9ebd0': 'rgba(36, 215, 119, 0.25)',
    # amber -> var(--warn)
    '#ff9820': 'var(--warn)', '#e07a1f': 'var(--warn)', '#f26a21': 'var(--warn)',
    '#a26a09': 'var(--warn)', '#a05a10': 'var(--warn)', '#c05a1a': 'var(--warn)',
    '#8a6a1a': 'var(--warn)', '#a05a1c': 'var(--warn)', '#b45309': 'var(--warn)',
    '#c47a00': 'var(--warn)', '#8a5a00': 'var(--warn)', '#7f5a0e': 'var(--warn)',
    '#f59e0b': 'var(--warn)', '#f0b428': 'var(--warn)', '#f0c33c': 'var(--warn)',
    '#ff6b21': 'var(--warn)', '#ffd400': 'var(--warn)',
    # amber tint bg -> warn tint
    '#fff2d9': 'rgba(255, 176, 32, 0.12)', '#fdefdc': 'rgba(255, 176, 32, 0.12)',
    '#fff0e7': 'rgba(255, 176, 32, 0.12)', '#fff9f0': 'rgba(255, 176, 32, 0.12)',
    '#fff3d6': 'rgba(255, 176, 32, 0.12)', '#fff4e5': 'rgba(255, 176, 32, 0.12)',
    '#fff8e0': 'rgba(255, 176, 32, 0.12)', '#fdeec8': 'rgba(255, 176, 32, 0.12)',
    '#ffdcb0': 'rgba(255, 176, 32, 0.25)', '#f5d9a8': 'rgba(255, 176, 32, 0.25)',
    # purple -> primary-hi
    '#7745db': 'var(--primary-hi)', '#7649d6': 'var(--primary-hi)',
    '#7b5fe0': 'var(--primary-hi)', '#5f42c8': 'var(--primary-hi)',
    '#f1ebff': 'rgba(40, 93, 222, 0.14)',
    # red theme accents -> blue/cyan
    '#7f171e': 'var(--primary-hi)', '#e0505a': 'var(--primary-2)', '#b8306b': 'var(--primary-2)',
    # red tint bg -> blue tint
    '#fde8ea': 'rgba(22, 139, 255, 0.12)', '#fff5f5': 'rgba(22, 139, 255, 0.08)',
    '#fff5f6': 'rgba(22, 139, 255, 0.08)', '#fff7f7': 'rgba(22, 139, 255, 0.08)',
    '#fff8f8': 'rgba(22, 139, 255, 0.08)', '#fff0f2': 'rgba(22, 139, 255, 0.08)',
    '#fef2f2': 'rgba(22, 139, 255, 0.08)', '#fdf2f3': 'rgba(22, 139, 255, 0.08)',
    '#fdeaea': 'rgba(22, 139, 255, 0.08)', '#ffeaed': 'rgba(22, 139, 255, 0.08)',
    '#fdeaf2': 'rgba(22, 139, 255, 0.08)',
    # red border -> cyan border
    '#e6cdd0': 'rgba(53, 216, 255, 0.18)', '#d9c3c6': 'rgba(53, 216, 255, 0.18)',
    '#f0e2e4': 'rgba(53, 216, 255, 0.18)', '#e6b3b8': 'rgba(53, 216, 255, 0.18)',
    '#f6d5d8': 'rgba(53, 216, 255, 0.18)', '#ffcbd1': 'rgba(53, 216, 255, 0.18)',
    '#f6bfc6': 'rgba(53, 216, 255, 0.18)', '#e3e6ec': 'var(--border)',
    # light borders -> var(--border)
    '#e2e9f3': 'var(--border)', '#e5e7eb': 'var(--border)', '#e9eef6': 'var(--border)',
    '#e4ecf7': 'var(--border)', '#dfe7f3': 'var(--border)', '#d9e4f2': 'var(--border)',
    '#dce5f1': 'var(--border)', '#d1d5db': 'var(--border)', '#e6ecf4': 'var(--border)',
    '#f1f5f9': 'var(--border)', '#f0f1f4': 'var(--border)', '#d9e3f0': 'var(--border)',
    '#e4eaf4': 'var(--border)', '#e5ebf4': 'var(--border)', '#dfe6f2': 'var(--border)',
    '#e8edf5': 'var(--border)', '#dbe4f0': 'var(--border)', '#dbe6ff': 'var(--border)',
    '#d0d9ea': 'var(--border)', '#d7e0ee': 'var(--border)', '#c6d3e6': 'var(--border)',
    '#c8d5ec': 'var(--border)', '#cdd8e8': 'var(--border)', '#d3ddec': 'var(--border)',
    '#e1e6ee': 'var(--border)', '#e2e8f2': 'var(--border)', '#f1f5fa': 'var(--border)',
    # light tinted bg -> blue tint
    '#eef3f9': 'rgba(53, 216, 255, 0.08)', '#e8eef6': 'rgba(53, 216, 255, 0.08)',
    '#e5efff': 'rgba(22, 139, 255, 0.10)', '#eaf2ff': 'rgba(22, 139, 255, 0.10)',
    '#e9f2ff': 'rgba(22, 139, 255, 0.10)', '#e6f0ff': 'rgba(22, 139, 255, 0.10)',
    '#eef4fc': 'rgba(53, 216, 255, 0.08)', '#eef4ff': 'rgba(22, 139, 255, 0.10)',
    '#e8f1ff': 'rgba(22, 139, 255, 0.10)',
    # light backgrounds -> var(--bg-panel)
    '#f5f8fd': 'var(--bg-panel)', '#fbfcfe': 'var(--bg-panel)', '#f7f9fc': 'var(--bg-panel)',
    '#f6f9fd': 'var(--bg-panel)', '#f9fafb': 'var(--bg-panel)', '#f4f6f9': 'var(--bg-panel)',
    '#f8faff': 'var(--bg-panel)', '#fafcff': 'var(--bg-panel)', '#f4f4f4': 'var(--bg-panel)',
    '#f4f8ff': 'var(--bg-panel)', '#f8fafd': 'var(--bg-panel)', '#f8fbff': 'var(--bg-panel)',
    '#fbfdff': 'var(--bg-panel)', '#fafafa': 'var(--bg-panel)', '#f4f7fb': 'var(--bg-panel)',
    '#f5f9ff': 'var(--bg-panel)', '#f6f8fb': 'var(--bg-panel)', '#f1f4f8': 'var(--bg-panel)',
    '#f2f6fd': 'var(--bg-panel)', '#f5efe4': 'rgba(8, 22, 46, 0.5)', '#eadfd3': 'rgba(8, 22, 46, 0.5)',
    '#b8c5db': 'rgba(53, 216, 255, 0.08)',
}

# Contextual hexes: border -> var(--border), background -> tint
contextual = {
    '#eef2f8': ('var(--border)', 'rgba(53, 216, 255, 0.08)'),
    '#edf1f6': ('var(--border)', 'rgba(53, 216, 255, 0.08)'),
    '#f3f4f6': ('var(--border)', 'rgba(53, 216, 255, 0.08)'),
    '#f0f3f8': ('var(--border)', 'rgba(53, 216, 255, 0.08)'),
}

def repl_hex(line):
    for hx, (bord, bg) in contextual.items():
        if hx in line.lower():
            if 'border' in line:
                line = line.replace(hx, bord)
            elif 'background' in line:
                line = line.replace(hx, bg)
    def sub(m):
        return hex_map.get(m.group(0).lower(), m.group(0))
    line = re.sub(r'#[0-9a-fA-F]{3,8}\b', sub, line)
    return line

count = 0
for i in range(start, end):
    line = lines[i]
    orig = line
    line = re.sub(r'background:\s*white\b', 'background: var(--bg-panel)', line)
    line = re.sub(r'background:\s*#ffffff\b', 'background: var(--bg-panel)', line)
    line = re.sub(r'background:\s*#fff\b', 'background: var(--bg-panel)', line)
    line = repl_hex(line)
    line = line.replace('rgba(18, 52, 97,', 'rgba(2, 8, 23,')
    line = line.replace('rgba(23, 55, 111,', 'rgba(2, 8, 23,')
    line = line.replace('rgba(185, 28, 38,', 'rgba(22, 139, 255,')
    line = line.replace('rgba(142, 0, 0,', 'rgba(22, 139, 255,')
    line = line.replace('rgba(127, 23, 30,', 'rgba(22, 139, 255,')
    if line != orig:
        count += 1
        lines[i] = line

open(path, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('Modified %d lines' % count)