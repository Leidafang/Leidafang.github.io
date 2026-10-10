"""Build the static GitHub Pages site from the reviewed source and display assets."""
from pathlib import Path
import html
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'site'
OUT = ROOT / 'docs'
OUT.mkdir(exist_ok=True)

nodes = [
    ('coords', '空间坐标', ['域内点 / 边界点', '(x, y)'], 'tensor', 28, 110, 145, 112),
    ('network', '共享的坐标网络', ['6 层 × 64 · Tanh', '同一套参数 θ'], 'learned', 225, 88, 180, 156),
    ('field', '预测物理场', ['u · v · p', '逐点查询'], 'output', 455, 110, 145, 112),
    ('autograd', '自动微分', ['一阶 / 二阶导数', '对坐标求导'], 'operation', 650, 110, 155, 112),
    ('pde', '方程残差', ['连续性 · 动量', '域内约束'], 'loss', 855, 54, 172, 94),
    ('boundary', '边界残差', ['入口 · 出口 · 壁面', '边界约束'], 'loss', 855, 184, 172, 94),
    ('loss', '损失与参数更新', ['L = Lᴘᴅᴇ + Lʙᴄ', 'AdamW 更新 θ'], 'loss', 1081, 110, 181, 112),
]
colors = {'tensor':('#E8DDF8','#493866'), 'learned':('#4F78C4','#fff'), 'output':('#DDF4E8','#235940'),
          'operation':('#E5E7EB','#354052'), 'loss':('#D95B57','#fff')}
# Explicit orthogonal routing keeps the feedback outside the forward path.
edges = [
 ('coords','network',[(173,166),(199,166),(199,166),(225,166)],False),
 ('network','field',[(405,166),(455,166)],False),
 ('field','autograd',[(600,166),(650,166)],True),
 ('autograd','pde',[(805,166),(830,166),(830,101),(855,101)],True),
 ('autograd','boundary',[(805,166),(830,166),(830,231),(855,231)],True),
 ('pde','loss',[(1027,101),(1055,101),(1055,144),(1081,144)],True),
 ('boundary','loss',[(1027,231),(1055,231),(1055,189),(1081,189)],True),
 ('loss','network',[(1171,222),(1171,321),(315,321),(315,244)],True),
]
mx = ET.Element('mxfile', host='app.diagrams.net', compressed='false')
page=ET.SubElement(mx,'diagram',id='pinn-overview',name='PINNs｜圆柱稳态绕流 · 网页总图')
model=ET.SubElement(page,'mxGraphModel',page='0',grid='1')
root=ET.SubElement(model,'root')
ET.SubElement(root,'mxCell',id='0'); ET.SubElement(root,'mxCell',id='1',parent='0')
board=ET.SubElement(root,'mxCell',id='whole-board',parent='1',vertex='1',value='',style='shape=rectangle;fillColor=#FFFFFF;strokeColor=#CBD5E1;container=1;collapsible=0;movable=1;resizable=0;connectable=0;')
ET.SubElement(board,'mxGeometry',x='0',y='0',width='1290',height='355',attrib={'as':'geometry'})
parts=['<svg id="model-board" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1290 355" aria-label="PINNs 圆柱绕流模型结构，可点击模块查看详情">',
 '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#97a0af"/></marker><marker id="back-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#ce7470"/></marker></defs>']
for x, label in [(28,'01  采样'),(225,'02  坐标 → 场'),(650,'03  物理约束'),(1081,'04  优化')]:
    title=ET.SubElement(root,'mxCell',id=f'title-{x}',parent='whole-board',vertex='1',value=label,style='text;html=1;strokeColor=none;fillColor=none;align=left;fontColor=#64748B;fontSize=15;')
    ET.SubElement(title,'mxGeometry',x=str(x),y='14',width='190',height='22',attrib={'as':'geometry'})
    parts.append(f'<text class="stage-title" x="{x}" y="30">{label}</text>')
for i,(source,target,pts,training) in enumerate(edges):
    is_back=i==len(edges)-1
    e=ET.SubElement(root,'mxCell',id=f'edge-{i}',parent='whole-board',edge='1',source=source,target=target,value='',style='edgeStyle=orthogonalEdgeStyle;rounded=1;endArrow=block;strokeWidth=2;strokeColor='+('#CE7470' if is_back else '#97A0AF')+';')
    geo=ET.SubElement(e,'mxGeometry',relative='1',attrib={'as':'geometry'})
    if len(pts)>2:
        arr=ET.SubElement(geo,'Array',attrib={'as':'points'})
        for x,y in pts[1:-1]: ET.SubElement(arr,'mxPoint',x=str(x),y=str(y))
    d='M'+' L'.join(f'{x},{y}' for x,y in pts)
    cls='connection'+(' training-only' if training else '')+(' feedback' if is_back else '')
    parts.append(f'<path class="{cls}" data-from="{source}" data-to="{target}" d="{d}" marker-end="url(#{"back-arrow" if is_back else "arrow"})"/>')
for id,title,lines,kind,x,y,w,h in nodes:
    bg,fg=colors[kind]
    c=ET.SubElement(root,'mxCell',id=id,parent='whole-board',vertex='1',value=title,style=f'swimlane;startSize=35;html=1;horizontal=1;rounded=1;fillColor={bg};swimlaneFillColor=#FFFFFF;strokeColor=#CBD5E1;fontColor={fg};fontStyle=1;fontSize=15;')
    ET.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})
    t=ET.SubElement(root,'mxCell',id=id+'-body',parent=id,vertex='1',value='<br>'.join(lines),style='text;html=1;fillColor=none;strokeColor=none;align=center;verticalAlign=middle;fontSize=14;')
    ET.SubElement(t,'mxGeometry',x='5',y='37',width=str(w-10),height=str(h-40),attrib={'as':'geometry'})
    train=' training-only' if id in ['autograd','pde','boundary','loss'] else ''
    parts.append(f'<g class="model-node {kind}{train}" data-node="{id}" role="button" tabindex="0" aria-label="{title}，查看详情" aria-pressed="false" transform="translate({x},{y})"><rect class="node-base" width="{w}" height="{h}" rx="6"/><path d="M6 0H{w-6}Q{w} 0 {w} 6V35H0V6Q0 0 6 0Z" fill="{bg}"/><text class="node-title" x="{w/2}" y="23" fill="{fg}">{title}</text>')
    for j,line in enumerate(lines): parts.append(f'<text class="node-body" x="{w/2}" y="{62+j*23}">{html.escape(line)}</text>')
    if id=='network':
        for col in range(6):
            for row in range(3): parts.append(f'<circle cx="{40+20*col}" cy="{109+12*row}" r="3" fill="#7394ce"/>')
    parts.append('</g>')
parts.append('<text class="feedback-note training-only" x="670" y="343" text-anchor="middle">反向传播：由损失对网络参数求导，再更新同一套 θ</text></svg>')
xml=ET.tostring(mx,encoding='unicode')
(SRC/'assets/pinn-overview.drawio').write_text(xml)
svg=''.join(parts)
embedded=svg.replace('viewBox="0 0 1290 355"','content="'+html.escape(xml,quote=True)+'" viewBox="0 0 1290 355"')
# Embed standalone styles so downloads render independently of the web page.
styles='''.stage-title{font:14px sans-serif;fill:#7b8492}.node-base{fill:white;stroke:#cbd5e1;stroke-width:1.3}.node-title{font:600 15px sans-serif;text-anchor:middle}.node-body{font:14px sans-serif;text-anchor:middle;fill:#445064}.connection{fill:none;stroke:#97a0af;stroke-width:1.8}.feedback{stroke:#ce7470}.feedback-note{font:13px sans-serif;fill:#a36562}'''
(SRC/'assets/pinn-overview.drawio.svg').write_text(embedded.replace('<defs>','<style>'+styles+'</style><defs>'))
template=(SRC/'index.html').read_text()
(OUT/'index.html').write_text(template.replace('<!-- MODEL_BOARD -->',svg))
for name in ['style.css','app.js']:
    shutil.copyfile(SRC/name,OUT/name)
shutil.copytree(SRC/'assets',OUT/'assets',dirs_exist_ok=True)
for old,anchor in {'pinn-cylinder':'pinn','automatic-differentiation':'pinn','data-center':'geotransolver','model-selection':'summary','physics-and-operators':'summary','spatial-query':'summary'}.items():
    (OUT/f'{old}.html').write_text(f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./#{anchor}"><title>AI × CFD</title><a href="./#{anchor}">查看新版研究笔记</a></html>')
(OUT/'.nojekyll').touch()
(OUT/'robots.txt').write_text('User-agent: *\nAllow: /\n')
print('Built', OUT)
