#!/usr/bin/env python3
"""One-time platform integration; preserve all unrelated nginx configuration."""
from pathlib import Path
import sys

INCLUDE = '    include /etc/nginx/voice-word-attack-games/*.conf;\n\n'

def integrate(source):
    marker = '\n# codex-ximitu-card-hunt-split-v1\n'
    if marker in source:
        start = source.index(marker)
        end = source.index('\n    location / {', start)
        source = source[:start] + '\n' + source[end:]
    if INCLUDE.strip() in source:
        return source
    anchor = '    location / {\n        proxy_pass http://127.0.0.1:19321;'
    if source.count(anchor) != 1:
        raise ValueError('Expected exactly one platform proxy; refusing ambiguous nginx edit')
    return source.replace(anchor, INCLUDE + anchor, 1)

if __name__ == '__main__':
    for name in sys.argv[1:]:
        path = Path(name)
        path.write_text(integrate(path.read_text()))
