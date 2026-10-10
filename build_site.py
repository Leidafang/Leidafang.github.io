"""Build reviewed, static portfolio; editable sources share diagram semantics."""
from pathlib import Path
import xml.etree.ElementTree as ET
import html,json,shutil,re
ROOT=Path(__file__).resolve().parent
SITE=ROOT/'site'; OUT=ROOT/'docs'

def node(id,title,lines,kind,x,y,detail,formula='',w=165,h=92):
    return dict(id=id,title=title,lines=lines,kind=kind,x=x,y=y,w=w,h=h,detail=detail,formula=formula)

models={
'domino':{'title':'DoMINO｜建筑稳态体积场 · 原理简图','note':'几何编码与查询解码分工；图中工况与位置为概念归类，具体张量以实现为准。','nodes':[
node('geom','建筑几何',['点云 / SDF','规则网格承载'],'tensor',22,54,'原始建筑表面与由几何计算的距离信息共同描述边界。规则网格是承载几何特征的空间，不是用网格坐标或 SDF 单独代替全部几何信息。'),
node('cnn','多尺度几何编码',['3D CNN','局部与全局信息'],'learned',246,54,'CNN 在几何网格上聚合邻域信息，多尺度结构扩展感受野，形成兼顾局部和全局的几何表达。不能将 DoMINO 简化成“只看局部、没有全局信息”。'),
node('grid','几何特征场',['三维特征网格','同一几何可重复读取'],'tensor',468,54,'编码后的几何特征不是压力或速度标签，而是网络学到的表示。固定几何下可在条件允许时复用纯几何计算；缓存不等于取消编码结构。'),
node('query','空间查询与条件',['查询点 / 相对位置','来流等工况'],'tensor',246,211,'查询点决定在哪里预测；相对位置、距离等编码帮助定位与边界的关系。Fourier 坐标特征让位置编码表达更丰富，但这不等于对全场做 FFT 的 FNO。工况通过具体实现的条件路径注入。'),
node('read','局部几何读取',['搜索邻域 + gather','汇总查询位置附近特征'],'operation',691,54,'围绕查询位置查找并汇总编码后的几何特征。这里读取的是 learned geometry features，不是邻点的真实压力或速度；也要与解码阶段的局部 stencil 区分。'),
node('decode','解码与聚合',['位置编码 / 采样基函数','Aggregation MLP'],'learned',691,211,'组合查询位置编码、几何表示与工况信息，通过学习到的基函数和聚合模块输出物理量。详细实现包含查询中心与局部采样的组合；首页将其折叠为一个模块。'),
node('output','体积场输出',['u · v · w · p','在给定位置预测'],'output',926,211,'在查询点得到速度分量和压力。训练依赖对应数据与任务定义；本页讨论体积场，不展开表面分支。')
], 'edges':[
('geom','cnn',[(187,100),(246,100)]),('cnn','grid',[(411,100),(468,100)]),('grid','read',[(633,100),(691,100)]),('read','decode',[(773,146),(773,211)]),('query','read',[(411,257),(445,257),(445,180),(720,180),(720,146)]),('query','decode',[(411,257),(691,257)]),('decode','output',[(856,257),(926,257)])]},
'pinn':{'title':'PINNs｜圆柱稳态绕流 · 训练简图','note':'本例固定几何与工况；训练时用物理约束，查询时只需坐标网络前向计算。','nodes':[
node('xy','空间坐标',['域内点 / 边界点','(x, y)'],'tensor',22,111,'分别在域内与边界采样坐标。这个圆柱案例不把几何和工况作为可变条件输入，因此求得的是一个固定问题的解。'),
node('mlp','坐标网络',['6 层 × 64 · Tanh','共享参数 θ'],'learned',246,111,'每个点通过同一个 MLP，直接输出 u、v、p。Tanh 的光滑性允许对输入坐标计算一阶、二阶导数；本例不是靠邻点交换信息解码。','(x, y) → (u, v, p)'),
node('ad','自动微分',['对坐标求导','一阶与二阶空间导数'],'operation',468,111,'沿计算图使用链式法则计算空间导数，并继续对导数的计算图求导得到二阶项。这里不需要有限差分网格；训练时还要计算损失对网络权重的梯度。'),
node('pde','物理残差',['连续性 / 动量','边界条件'],'loss',691,111,'将网络值和空间导数代入方程、边界条件形成残差。这个实现未使用真实流场作为监督，但仍需边界信息、物性、几何和采样。'),
node('loss','损失与优化',['平衡残差项','更新同一套 θ'],'loss',926,111,'优化网络，使方程和边界残差降低。损失下降不自动等价于真实解误差下降；还需独立参考和完整场检查。此处重点是训练过程，输出物理量已包含在坐标网络模块。','L = L_PDE + L_BC')
], 'edges':[('xy','mlp',[(187,157),(246,157)]),('mlp','ad',[(411,157),(468,157)]),('ad','pde',[(633,157),(691,157)]),('pde','loss',[(856,157),(926,157)]),('loss','mlp',[(1008,203),(1008,271),(328,271),(328,203)])]},
'geo':{'title':'GeoTransolver｜当前固定几何 CHT 稳态模型','note':'当前 CHT 定制实现：不把公开汽车模型的全部几何编码分支画成已启用。','nodes':[
node('local','Local · 点输入',['坐标 / 单元体积','流固标记'],'tensor',22,54,'每个体积单元使用坐标、对数单元体积与流固标记，共 5 个输入特征。当前稳态实现是固定几何，不把汽车任务的全部几何邻域分支直接移植为已启用能力。','local: [x, y, z, log V, solid mask]'),
node('embed','逐点特征嵌入',['映射到隐空间','共享的特征编码'],'learned',246,54,'将局部输入映射为每个点的隐特征。单独的逐点 MLP 不交换点间信息；后续 GALE 层承担全场交互。'),
node('global','Global · 工况',['热源 / 风机 / 水流','8 维控制'],'tensor',22,211,'新 CHT v6：三组热源、三组机柜风机、回风风机、水侧质量流量。固定 15 °C 冷水入口。与旧 R8 的四区风量、四区热源含义不同。'),
node('context','共享上下文',['工况嵌入','供 cross-attention 读取'],'learned',246,211,'把 8 维工况编码成共享上下文。当前配置使用一个全局条件 token。global 表示共享条件，不意味着这一分支自动表达所有全局物理规律。'),
node('gale','GALE × 6',['软状态聚合','并行 self / cross attention'],'learned',561,132,'将大量点软聚合成较少的状态；self-attention 交换状态信息，cross-attention 并行读取上下文，再融合并回写到点。点击上方“展开 GALE 内部”查看路径。','6 层 · 隐宽 256 · 8 heads · 128 states',w=210),
node('readout','体积场读出',['逐点 MLP','温度与空气速度'],'learned',864,132,'把交互后的点特征映射到物理量。温度覆盖流体和固体，速度针对空气区域。这是当前稳态任务；时间响应需要另外定义输入、任务封装、组合关系与训练。','T: 所有区域；U: 空气区域',w=225)
], 'edges':[('local','embed',[(187,100),(246,100)]),('global','context',[(187,257),(246,257)]),('embed','gale',[(411,100),(478,100),(478,155),(561,155)]),('context','gale',[(411,257),(503,257),(503,201),(561,201)]),('gale','readout',[(771,178),(864,178)])]},
'gale':{'title':'GALE｜两条注意力分支并行计算，再融合','note':'软状态是学习到的聚合，不是固定物理分区；网络层数不是物理时间步。','nodes':[
node('points','逐点特征',['N 个空间点','进入一个 GALE 层'],'tensor',22,111,'点特征带着局部空间信息。直接对所有点做两两 attention 的代价很高，因此先学习一种从点到少量状态的软聚合。'),
node('states','软状态聚合',['学习软权重','N 个点 → S 个状态'],'learned',246,111,'每个点可以以不同权重参与多个状态。状态不是事先切好的机柜区或固定空间网格，而是网络学习的特征汇总。','通常 S ≪ N'),
node('self','Self-attention',['状态之间交流','读取其他状态信息'],'learned',508,39,'在压缩后的状态上做 self-attention，使不同位置贡献的信息可以交换。这条分支与下方 cross-attention 并行，而不是先 self 再 cross。'),
node('cross','Cross-attention',['状态读取条件','共享上下文 C'],'learned',508,210,'以状态为查询，从全局上下文读取条件。当前 CHT 配置使用单个上下文 token，因此不能把它描述成在许多工况 token 之间挑选。'),
node('context','全局条件 C',['来自工况嵌入','该层共享'],'tensor',746,210,'共享上下文来自全局工况分支。在公开几何任务中也可以包含几何编码；本页主图对应固定几何 CHT 配置。'),
node('mix','融合与回写',['融合两路更新','回写点特征 + 后处理'],'learned',922,39,'并行两路信息融合，再依据学到的软权重分配回各点，并经过层内残差/前馈等处理。重复多个层，让全场与条件持续交互。','N → S → attention → S → N')
], 'edges':[('points','states',[(187,157),(246,157)]),('states','self',[(411,135),(450,135),(450,85),(508,85)]),('states','cross',[(411,179),(450,179),(450,256),(508,256)]),('context','cross',[(746,256),(673,256)]),('self','mix',[(673,85),(922,85)]),('cross','mix',[(590,210),(590,170),(1004,170),(1004,131)])]}
}

colors={'tensor':('#E8DDF8','#493866'),'learned':('#4F78C4','#fff'),'operation':('#E5E7EB','#354052'),'loss':('#D95B57','#fff'),'output':('#DDF4E8','#235940')}
mx=ET.Element('mxfile',host='app.diagrams.net',compressed='false')
for name,m in models.items():
    d=ET.SubElement(mx,'diagram',id=name,name=m['title'])
    model=ET.SubElement(d,'mxGraphModel',page='0',grid='1')
    root=ET.SubElement(model,'root');ET.SubElement(root,'mxCell',id='0');ET.SubElement(root,'mxCell',id='1',parent='0')
    # Flat per-page structure follows the user's validated Feishu import master.
    title=ET.SubElement(root,'mxCell',id=name+'-title',parent='1',vertex='1',value=m['title'],style='text;html=1;align=left;fontSize=21;fontStyle=1;fontColor=#244553;')
    ET.SubElement(title,'mxGeometry',x='20',y='6',width='1070',height='30',attrib={'as':'geometry'})
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 330" role="group" aria-label="{html.escape(m["title"])}">',f'<defs><marker id="arrow-{name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#718b98"/></marker></defs>']
    for i,(a,b,pts) in enumerate(m['edges']):
        eid=f'{name}-edge-{i}'
        isfeedback=name=='pinn' and a=='loss'
        # Force attachment to the same node sides used by the inspected SVG.
        def port(n,point):
            return ((point[0]-n['x'])/n['w'],(point[1]-n['y'])/n['h'])
        byid={n['id']:n for n in m['nodes']}
        sx,sy=port(byid[a],pts[0]);tx,ty=port(byid[b],pts[-1])
        edge=ET.SubElement(root,'mxCell',id=eid,parent='1',edge='1',source=name+'-'+a,target=name+'-'+b,value='',style=f'edgeStyle=orthogonalEdgeStyle;rounded=1;endArrow=block;strokeWidth=2;strokeColor={"#BE185D" if isfeedback else "#475569"};exitX={sx};exitY={sy};entryX={tx};entryY={ty};')
        geo=ET.SubElement(edge,'mxGeometry',relative='1',attrib={'as':'geometry'})
        if len(pts)>2:
            arr=ET.SubElement(geo,'Array',attrib={'as':'points'})
            for x,y in pts[1:-1]:ET.SubElement(arr,'mxPoint',x=str(x),y=str(y))
        path='M'+' L'.join(f'{x},{y}' for x,y in pts)
        parts.append(f'<path class="m-edge" d="{path}" marker-end="url(#arrow-{name})"'+(' style="stroke:#bd7e90"' if isfeedback else '')+'/>')
    for n in m['nodes']:
        id,title,lines,kind,x,y,w,h=[n[k] for k in ['id','title','lines','kind','x','y','w','h']]
        bg,fg=colors[kind]
        c=ET.SubElement(root,'mxCell',id=name+'-'+id,parent='1',vertex='1',value=title,style=f'swimlane;startSize=32;html=1;rounded=0;fillColor={bg};swimlaneFillColor=#FFFFFF;strokeColor=#CBD5E1;fontColor={fg};fontStyle=1;fontSize=14;')
        ET.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})
        c=ET.SubElement(root,'mxCell',id=name+'-'+id+'-text',parent=name+'-'+id,vertex='1',value='<br>'.join(lines),style='text;html=1;strokeColor=none;fillColor=none;align=center;fontSize=12;')
        ET.SubElement(c,'mxGeometry',x='4',y='35',width=str(w-8),height=str(h-38),attrib={'as':'geometry'})
        parts.append(f'<g class="m-node" data-node="{id}" role="button" tabindex="0" aria-label="{html.escape(title)}：查看详情" aria-pressed="false" transform="translate({x},{y})"><rect class="body" width="{w}" height="{h}" rx="4"/><path d="M4 0H{w-4}Q{w} 0 {w} 4V32H0V4Q0 0 4 0Z" fill="{bg}"/><text class="m-title" x="{w/2}" y="21" fill="{fg}">{html.escape(title)}</text>')
        for j,line in enumerate(lines):parts.append(f'<text class="m-body" x="{w/2}" y="{56+j*20}">{html.escape(line)}</text>')
        parts.append('</g>')
    parts.append(f'<text x="22" y="324" class="diagram-note">{html.escape(m["note"])}</text></svg>')
    xml=ET.Element('mxfile',host='app.diagrams.net',compressed='false');xml.append(ET.fromstring(ET.tostring(d)))
    raw=ET.tostring(xml,encoding='unicode')
    (SITE/f'assets/{name}-overview.drawio').write_text(raw)
    svg=''.join(parts)
    m['svg']=svg
    css='.body{fill:white;stroke:#d3dee4;stroke-width:1.2}.m-title{font:bold 14px sans-serif;text-anchor:middle}.m-body{font:12px sans-serif;fill:#68818e;text-anchor:middle}.m-edge{fill:none;stroke:#718b98;stroke-width:1.5}.diagram-note{font:10px sans-serif;fill:#8ba0aa}'
    # Add the title to download-only SVG; web heading already names the model.
    standalone=svg.replace('<defs>',f'<text x="22" y="26" font-size="17" fill="#365864">{html.escape(m["title"])}</text><style>{css}</style><defs>')
    standalone=standalone.replace('<svg ',f'<svg content="{html.escape(raw,quote=True)}" ',1)
    (SITE/f'assets/{name}-overview.drawio.svg').write_text(standalone)
(SITE/'assets/models-feishu.drawio').write_text(ET.tostring(mx,encoding='unicode'))
(SITE/'assets/models.json').write_text(json.dumps(models,ensure_ascii=False,separators=(',',':')))

shutil.copytree(SITE,OUT,dirs_exist_ok=True)
for oldname,link in {'pinn-cylinder':'pinn/','automatic-differentiation':'pinn/','data-center':'#data-center','model-selection':'#reflections','physics-and-operators':'#pinn','spatial-query':'#domino-model'}.items():
    (OUT/f'{oldname}.html').write_text(f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./{link}"><title>研究笔记</title><a href="./{link}">查看研究笔记</a></html>')
(OUT/'.nojekyll').touch()
(OUT/'robots.txt').write_text('User-agent: *\nAllow: /\n')
print('Built',OUT)
