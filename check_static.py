"""Check the static delivery boundary, links, and diagram source integrity."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parent;D=R/'docs'
class Page(HTMLParser):
    def __init__(self,p):
        super().__init__();self.ids=set();self.refs=[];self.feed(p.read_text())
    def handle_starttag(self,t,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.add(a['id'])
        for k in ('src','href'):
            if k in a:self.refs.append(a[k])
pages={p.resolve():Page(p) for p in D.rglob('*.html')}
for p,doc in pages.items():
    for ref in doc.refs:
        u=urlsplit(ref)
        if u.scheme or u.netloc:continue
        target=(p.parent/unquote(u.path)).resolve() if u.path else p
        if target.is_dir():target/='index.html'
        assert target.is_file(),(p,ref)
        if u.fragment and target in pages:assert u.fragment in pages[target].ids,(p,ref)
for p in D.rglob('*'):
    if not p.is_file():continue
    assert '_private' not in str(p) and 'credentials' not in p.name and 'token.json' not in p.name
    if p.suffix in ['.html','.js','.css','.json','.svg','.drawio']:
        s=p.read_text()
        for forbidden in ['/home/xiongyn','/nfs_data','user_access_token','app_secret','o0pn4b64riu.feishu.cn','LPXQdPn','SmBhdSg','Oa5adu8']:
            assert forbidden not in s,(p,forbidden)
for p in (D/'assets').glob('*-overview.drawio'):
    xml=p.read_text(); svg=ET.parse(p.with_suffix('.drawio.svg')).getroot()
    assert svg.get('content')==xml
    root=ET.fromstring(xml);cells=root.findall('.//mxCell');ids={c.get('id') for c in cells};assert len(ids)==len(cells)
    for c in cells:
        if c.get('edge')=='1':
            assert c.get('source') in ids and c.get('target') in ids and not c.get('value')
            assert c.get('parent')=='1'
models=json.loads((D/'assets/models.json').read_text())
for m in models.values():
    for i,a in enumerate(m['nodes']):
        for b in m['nodes'][i+1:]:
            assert not(a['x']<b['x']+b['w'] and a['x']+a['w']>b['x'] and a['y']<b['y']+b['h'] and a['y']+a['h']>b['y']), (a['id'],b['id'])
result={'ok':True,'html_pages':len(pages),'model_diagrams':len(models),'private_source_leak_check':'passed','native_xml_and_embedded_svg':'passed','diagram_node_overlap':'none','total_bytes':sum(p.stat().st_size for p in D.rglob('*') if p.is_file())}
(R/'static_validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
