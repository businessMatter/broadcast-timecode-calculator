"""Dependency-free structural/contrast checks. Not a browser/layout test."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen
import re

ROOT = Path(__file__).resolve().parents[1]
class Document(HTMLParser):
    def __init__(self):
        super().__init__(); self.nodes=[]
    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag,dict(attrs)))
doc=Document(); doc.feed((ROOT/'index.html').read_text())
ids=[a['id'] for _,a in doc.nodes if 'id' in a]
assert len(ids)==len(set(ids)), 'Duplicate IDs'
for tag,a in doc.nodes:
    for key in ('aria-describedby','aria-labelledby','aria-controls','for'):
        for target in a.get(key,'').split():assert target in ids,(tag,key,target)
    for key in ('src','href'):
        if key not in a:continue
        ref=a[key];assert ref.startswith('./'),ref
        assert (ROOT/ref.split('?',1)[0]).is_file(),ref
    if tag=='img':assert a.get('alt')=='',a
    if tag in ('input','textarea','select') and a.get('type') not in ('radio','checkbox'):
        assert any(t=='label' and x.get('for')==a['id'] for t,x in doc.nodes),a
assert [a['data-tab'] for _,a in doc.nodes if 'data-tab' in a]==['reformat','round','duration','calculate']
assert sum(tag=='h1' for tag,_ in doc.nodes)==1
for filename in ('app.js','timecode.js'):
    source=(ROOT/filename).read_text()
    assert not re.search(r'\beval\s*\(|new\s+Function\s*\(',source)
for text in ('Timecode, made simple.','Broadcast tools','Every frame counts.','Good Timecodes Ahead.'):
    assert text not in (ROOT/'index.html').read_text()
css=(ROOT/'styles.css').read_text();assert css.count('{')==css.count('}')
assert 'max-width:699px' in css and 'max-width:1099px' in css

def luminance(hexcode):
    vals=[int(hexcode[i:i+2],16)/255 for i in (1,3,5)]
    vals=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals]
    return sum(v*k for v,k in zip(vals,[.2126,.7152,.0722]))
def contrast(a,b):
    x,y=sorted((luminance(a),luminance(b)))
    return (y+.05)/(x+.05)
pairs=[('text / white','#23394D','#FFFFFF',4.5),('muted / white','#52677D','#FFFFFF',4.5),('muted / result','#52677D','#DDF3FD',4.5),('white / blue','#FFFFFF','#0866F5',4.5),('field border / white','#8193A8','#FFFFFF',3),('error / white','#B42318','#FFFFFF',4.5)]
for name,a,b,minimum in pairs:
    ratio=contrast(a,b);assert ratio>=minimum,(name,ratio);print(f'PASS contrast {name}: {ratio:.2f}:1')
print('PASS HTML labels, references, tabs, decorative images, local resources, static safety, breakpoints')
# Optional live static server check. Pass BASE_URL to verify a project subdirectory.
import os
base=os.environ.get('BASE_URL')
import sys, threading
if '--serve' in sys.argv:
    from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT.parent),**kw)
        def log_message(self,*a):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/{ROOT.name}/'
if base:
    for ref in ['index.html']+[a[k][2:] for _,a in doc.nodes for k in ('src','href') if k in a]:
        with urlopen(base.rstrip('/')+'/'+ref) as r:assert r.status==200
    print('PASS HTTP project subpath: index + all linked resources return 200')
