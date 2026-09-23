#!/usr/bin/env python3
"""Turn a simple PRIVACY.md (paragraphs, '- ' bullets, **bold**, `code`, URLs) into a site page.
Usage: md2page.py PRIVACY.md out.html "Product name" support_url"""
import re, html, sys
src, out, name, support = sys.argv[1:5]
text = open(src).read()
lines = text.splitlines()
title = re.sub(r'^#\s*', '', lines[0]).strip()
def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s); s = re.sub(r'`(.+?)`', r'<code>\1</code>', s)
    return re.sub(r'(https://[^\s),]+?)(\.?)(?=[\s),]|$)', r'<a href="\1">\1</a>\2', s)
body = []
for b in re.split(r'\n\s*\n', '\n'.join(lines[1:])):
    b = b.strip()
    if not b: continue
    if b.startswith('- '):
        body.append('<ul>\n' + '\n'.join('<li>' + inline(' '.join(i.split())) + '</li>' for i in re.split(r'\n- ', b[2:])) + '\n</ul>')
    elif b.lower().startswith('last updated'):
        body.append('<p class="sub">' + inline(b) + '</p>')
    else:
        body.append('<p>' + inline(' '.join(b.split())) + '</p>')
open(out, 'w').write(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><link rel="stylesheet" href="style.css">
<h1>{html.escape(title)}</h1>
''' + '\n'.join(body) + f'''
<footer><a href="./">{html.escape(name)}</a> · <a href="{support}">Support</a></footer>
</html>
''')
