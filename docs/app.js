'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const details = {
  coords: {kicker:'01 / INPUT', title:'把空间位置交给网络', text:'域内点用于检查方程，边界点用于检查边界条件。每个点只输入 <strong>(x, y)</strong>，不输入真实的速度或压力。几何通过采样位置和边界约束进入这个案例。', visual:'<div class="formula">X ∈ ℝ<sup>N×2</sup> → f<sub>θ</sub>(X)</div><div class="chips"><span class="chip">5,616 个域内点</span><span class="chip">入口 / 出口 / 圆柱 / 上下边界</span></div><p class="formula-note">域内点来自网格单元中心。这里未对坐标归一化，也未把时间、Re 或几何编码作为输入。</p>'},
  network: {kicker:'02 / COORDINATE NETWORK', title:'用同一张网络表示整片流场', text:'每个坐标都经过同一个 MLP，得到该位置的物理量。<strong>点与点不做 attention 或邻域聚合</strong>；它们通过共享参数和共同的训练损失发生联系。', visual:networkDrawing()+'<div class="chips"><span class="chip">6 个隐藏层 · 每层 64</span><span class="chip">21,187 个参数</span><span class="chip">Tanh 激活</span></div><p class="formula-note">实现为 Linear(2,64) + 5 × Linear(64,64) + Linear(64,3)。前六层后接 Tanh，输出层无激活。图中的圆点为层结构示意。</p>'},
  field: {kicker:'03 / OUTPUT', title:'一个位置，三个预测值', text:'网络给出水平速度 u、竖直速度 v 和运动学压力 p。训练结束后，<strong>查询物理量只需一次前向计算</strong>；不必再计算方程残差或更新参数。', visual:'<div class="formula">f<sub>θ</sub>(x, y) = [u, v, p]</div><table><tr><td>u / v</td><td>速度分量 · m/s</td></tr><tr><td>p</td><td>运动学压力 · m²/s²</td></tr></table><p class="formula-note">下方浏览器展示的是已保存预测的插值，不是在网页中重新运行这个网络。</p>'},
  autograd: {kicker:'04 / AUTOMATIC DIFFERENTIATION', title:'沿计算图，对坐标求导', text:'自动微分利用链式法则得到空间导数。一阶求导时保留导数计算图，就能继续对坐标求二阶导数。<strong>求导路径不是网格上的差分模板。</strong>', visual:'<div class="formula">u = f<sub>θ,u</sub>(x, y)</div><div class="formula small">u → ∂u/∂x → ∂²u/∂x²</div><p class="formula-note">create_graph = true 保留可继续求导的计算图。这里先对坐标求导构造物理残差，随后损失再对网络参数 θ 求导。残差同时使用场值和导数。</p>'},
  pde: {kicker:'05 / PHYSICS RESIDUAL', title:'预测要满足连续性与动量方程', text:'把预测场及其导数代回二维稳态方程。残差越小，意味着这些采样点上的方程满足得越好。历史代码采用展开的守恒形式，包含与连续性残差 c 有关的项。', visual:'<div class="formula small">c = u<sub>x</sub> + v<sub>y</sub><br>r<sub>x</sub> = uu<sub>x</sub> + vu<sub>y</sub> + p<sub>x</sub> − νΔu + uc − νc<sub>x</sub><br>r<sub>y</sub> = uv<sub>x</sub> + vv<sub>y</sub> + p<sub>y</sub> − νΔv + vc − νc<sub>y</sub></div><p class="formula-note">下标表示偏导，ν = 0.1 m²/s。训练过程中 c 尚未严格为零，不能直接删去这些相关项。</p>'},
  boundary: {kicker:'06 / BOUNDARY RESIDUAL', title:'边界也要告诉网络', text:'没有流场标签，不代表没有外部条件。入口速度、壁面条件、压力参考等仍需要指定。右侧列出的是<strong>历史代码实际惩罚的残差</strong>，而不是通用边界模板。', visual:'<table><tr><td>入口</td><td>u − 1，v，p<sub>x</sub></td></tr><tr><td>圆柱壁面</td><td>u，v，∇p · n</td></tr><tr><td>出口</td><td>p，u<sub>x</sub></td></tr><tr><td>名为 sym 的边界</td><td>p，v<sub>y</sub></td></tr></table><p class="formula-note">sym 的历史实现并非标准对称边界条件的完整表达；这里保留原实现供回顾，不把它包装成通用推荐设置。</p>'},
  loss: {kicker:'07 / OPTIMIZATION', title:'让物理约束推动参数更新', text:'域内和边界残差分别加权后组成总损失。AdamW 根据损失对参数的梯度更新网络。这个分支没有加入真实流场标签损失；<strong>损失值也不等于独立测试误差。</strong>', visual:'<div class="formula">L = L<sub>PDE</sub> + L<sub>BC</sub></div><div class="chips"><span class="chip">AdamW</span><span class="chip">配置学习率 10⁻⁵</span><span class="chip">不使用流场标签</span></div><details><summary>查看历史实现的加权方式</summary><p class="formula-note">E<sub>w</sub>(r) = Σ wᵢ²rᵢ² / Σ wᵢ²。域内 w = 单元体积；边界 w = 0.05 × 面积。L<sub>PDE</sub> = 107.19669 × 0.333 × (E(c) + E(r<sub>x</sub>) + E(r<sub>y</sub>))。L<sub>BC</sub> = 0.21743L<sub>in</sub> + 0.03371L<sub>wall</sub> + 0.21743L<sub>out</sub> + 0.5368L<sub>sym</sub>；入口/壁面三项各乘 0.3333，出口/sym 两项各乘 0.5。当前配置的两个总权重均为 1。</p></details>'}
};
function networkDrawing(){
  const counts=[2,4,4,4,4,4,4,3], out=[];
  out.push('<svg class="network-mini" viewBox="0 0 480 102" aria-label="两个坐标输入、六个隐藏层、三个物理输出的网络示意">');
  for(let col=0;col<7;col++)for(let a=0;a<counts[col];a++)for(let b=0;b<counts[col+1];b++)out.push(`<line x1="${23+62*col}" y1="${38+15*a-7.5*(counts[col]-1)}" x2="${23+62*(col+1)}" y2="${38+15*b-7.5*(counts[col+1]-1)}"/>`);
  counts.forEach((n,col)=>{for(let row=0;row<n;row++)out.push(`<circle class="${col===0||col===7?'io':''}" cx="${23+62*col}" cy="${38+15*row-7.5*(n-1)}" r="5"/>`);out.push(`<text x="${23+62*col}" y="84" text-anchor="middle">${col===0?'x,y':col===7?'u,v,p':'64'}</text>`);});
  return out.join('')+'</svg>';
}
let selectedNode='network', training=true;
const nodeOrder=Object.keys(details);
function selectNode(id){
  selectedNode=id; const d=details[id];
  $('#detail-kicker').textContent=d.kicker; $('#detail-title').textContent=d.title;
  $('#detail-text').innerHTML='<p>'+d.text+'</p>'; $('#detail-visual').innerHTML=d.visual;
  $$('.model-node').forEach(n=>{const selected=n.dataset.node===id;n.classList.toggle('selected',selected);n.setAttribute('aria-pressed',String(selected));});
  $$('.connection').forEach(e=>e.classList.toggle('related',e.dataset.from===id||e.dataset.to===id));
  $('#step-count').textContent=String(nodeOrder.indexOf(id)+1).padStart(2,'0')+' / 07';
}
$$('.model-node').forEach(n=>{n.addEventListener('click',()=>selectNode(n.dataset.node));n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(n.dataset.node);}});});
$('#previous-node').onclick=()=>selectNode(nodeOrder[(nodeOrder.indexOf(selectedNode)+6)%7]);
$('#next-node').onclick=()=>selectNode(nodeOrder[(nodeOrder.indexOf(selectedNode)+1)%7]);
function setMode(train){
  training=train; $('#model-board').classList.toggle('query-mode',!train);
  $('#training-mode').classList.toggle('selected',train);$('#inference-mode').classList.toggle('selected',!train);
  $('#training-mode').setAttribute('aria-pressed',String(train));$('#inference-mode').setAttribute('aria-pressed',String(!train));
  $('#mode-caption').textContent=train?'点击任一模块，展开它的作用与实现。':'查询路径：坐标 → 已训练网络 → 物理场。淡化部分仅用于训练。';
  if(!train&&!['coords','network','field'].includes(selectedNode))selectNode('field');
}
$('#training-mode').onclick=()=>setMode(true);$('#inference-mode').onclick=()=>setMode(false);
selectNode('network');

// Detailed original board: CSS-transform viewport, no external diagram service.
const dialog=$('#detailed-dialog'), viewport=$('#detailed-viewport'), detailedImg=$('#detailed-image');
let z=1, tx=0, ty=0, drag=null;
function transformBoard(){detailedImg.style.transform=`translate(${tx}px,${ty}px) scale(${z})`;}
function fitBoard(){const w=detailedImg.naturalWidth||8264,h=detailedImg.naturalHeight||1479;z=Math.min((viewport.clientWidth-36)/w,(viewport.clientHeight-36)/h);tx=(viewport.clientWidth-w*z)/2;ty=(viewport.clientHeight-h*z)/2;transformBoard();}
function zoomBoard(f,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const next=Math.max(.03,Math.min(2,z*f));tx=cx-(cx-tx)*next/z;ty=cy-(cy-ty)*next/z;z=next;transformBoard();}
$('#open-detailed').onclick=()=>{dialog.showModal();document.body.style.overflow='hidden';fitBoard();};
$('#close-detailed').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>{document.body.style.overflow='';$('#open-detailed').focus();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
$('#zoom-in').onclick=()=>zoomBoard(1.5);$('#zoom-out').onclick=()=>zoomBoard(1/1.5);$('#zoom-reset').onclick=fitBoard;
detailedImg.addEventListener('load',()=>{if(dialog.open)fitBoard();});
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoomBoard(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,tx,ty};viewport.setPointerCapture(e.pointerId);});
viewport.addEventListener('pointermove',e=>{if(drag){tx=drag.tx+e.clientX-drag.x;ty=drag.ty+e.clientY-drag.y;transformBoard();}});
viewport.addEventListener('pointerup',()=>drag=null);viewport.addEventListener('pointercancel',()=>drag=null);

// Display existing predictions. No neural network or PDE solver runs here.
let meta=null, grid=null, field='speed', view='near', particlesOn=false, fieldVisible=true;
let canvasW=1,canvasH=1,plot={x:0,y:0,w:1,h:1},particles=[],probe=null,raf=0,lastTime=0,loadSerial=0;
const canvas=$('#field-canvas'),ctx=canvas.getContext('2d'),heat=document.createElement('canvas'),hctx=heat.getContext('2d');
const cache=new Map(), motion=matchMedia('(prefers-reduced-motion: reduce)');
const palettes={sequential:[[39,76,119],[72,127,157],[111,176,182],[180,214,181],[242,226,161],[229,165,87]],diverging:[[55,99,156],[125,168,198],[233,239,237],[238,201,153],[197,109,62]]};
function color(t){const p=field==='u'||field==='speed'?palettes.sequential:palettes.diverging;t=Math.max(0,Math.min(1,t))*(p.length-1);let i=Math.min(p.length-2,Math.floor(t)),f=t-i;return p[i].map((v,j)=>Math.round(v*(1-f)+p[i+1][j]*f));}
function range(){if(field==='v'||field==='p'){const a=Math.max(...meta.ranges[field].map(Math.abs));return[-a,a];}return meta.ranges[field];}
function fieldValue(a){return field==='speed'?Math.hypot(a[0],a[1]):a[{u:0,v:1,p:2}[field]];}
function valueAt(x,y){
  if(!grid||x*x+y*y<=1)return null;
  const [xmin,xmax,ymin,ymax]=grid.bounds,[nx,ny]=grid.size,gx=(x-xmin)/(xmax-xmin)*(nx-1),gy=(y-ymin)/(ymax-ymin)*(ny-1);
  if(gx<0||gy<0||gx>nx-1||gy>ny-1)return null;
  const ix=Math.min(nx-2,Math.floor(gx)),iy=Math.min(ny-2,Math.floor(gy)),fx=gx-ix,fy=gy-iy,out=[0,0,0];
  for(const [dx,dy,w] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){
    const k=((iy+dy)*nx+ix+dx)*3;
    if(w<1e-12)continue;
    if(grid.q[k]===-32768)return null;
    for(let c=0;c<3;c++)out[c]+=(grid.q[k+c]*grid.scale[c]+grid.offset[c])*w;
  }return out;
}
function paintHeat(){
  if(!grid)return; const [nx,ny]=grid.size;heat.width=nx;heat.height=ny;
  const im=hctx.createImageData(nx,ny),[lo,hi]=range();
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const k=(y*nx+x)*3,j=((ny-1-y)*nx+x)*4;if(grid.q[k]===-32768)continue;
    const a=[0,1,2].map(c=>grid.q[k+c]*grid.scale[c]+grid.offset[c]);
    const rgb=color((fieldValue(a)-lo)/(hi-lo));im.data.set([...rgb,255],j);
  }hctx.putImageData(im,0,0);
  $('#scale-min').textContent=lo.toFixed(2);$('#scale-max').textContent=hi.toFixed(2);
  $('#scale-caption').textContent=field==='p'?'p (m²/s²)':field==='speed'?'|U| (m/s)':field+' (m/s)';
  $('#scale-gradient').style.background='linear-gradient(90deg,'+[0,.25,.5,.75,1].map(t=>'rgb('+color(t).join(',')+')').join(',')+')';
  draw();
}
function xy(x,y){const b=grid.bounds;return[plot.x+(x-b[0])/(b[1]-b[0])*plot.w,plot.y+(b[3]-y)/(b[3]-b[2])*plot.h];}
function world(px,py){const b=grid.bounds;return[b[0]+(px-plot.x)/plot.w*(b[1]-b[0]),b[3]-(py-plot.y)/plot.h*(b[3]-b[2])];}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvasW=r.width;canvasH=r.height;canvas.width=Math.round(canvasW*dpr);canvas.height=Math.round(canvasH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();if(dialog.open)fitBoard();}
function draw(){
  ctx.clearRect(0,0,canvasW,canvasH);ctx.fillStyle='#eff3f6';ctx.fillRect(0,0,canvasW,canvasH);if(!grid)return;
  const b=grid.bounds,scale=Math.min((canvasW-46)/(b[1]-b[0]),(canvasH-42)/(b[3]-b[2]));
  plot={w:(b[1]-b[0])*scale,h:(b[3]-b[2])*scale,x:(canvasW-(b[1]-b[0])*scale)/2,y:(canvasH-(b[3]-b[2])*scale)/2};
  ctx.imageSmoothingEnabled=true;ctx.drawImage(heat,plot.x,plot.y,plot.w,plot.h);
  const [cx,cy]=xy(0,0);ctx.beginPath();ctx.arc(cx,cy,scale,0,Math.PI*2);ctx.fillStyle='#f8fafb';ctx.fill();ctx.strokeStyle='#7d91a4';ctx.lineWidth=1;ctx.stroke();
  ctx.font='9px sans-serif';ctx.fillStyle='#8596a5';ctx.textAlign='center';
  for(const x of [b[0],0,b[1]]){const [px]=xy(x,0);ctx.fillText(String(x),px,plot.y+plot.h+13);}
  ctx.fillText('x (m)',plot.x+plot.w-18,plot.y+plot.h+26);
  ctx.textAlign='right';ctx.fillText(String(b[3]),plot.x-5,plot.y+5);ctx.fillText(String(b[2]),plot.x-5,plot.y+plot.h);ctx.fillText('y (m)',plot.x-3,plot.y+plot.h/2);
  if(particlesOn){ctx.save();ctx.beginPath();ctx.rect(plot.x,plot.y,plot.w,plot.h);ctx.clip();ctx.lineWidth=1.25;ctx.strokeStyle='#ffffffd9';for(const p of particles){const [px,py]=xy(p.x,p.y),a=valueAt(p.x,p.y);if(!a)continue;ctx.beginPath();ctx.moveTo(px-a[0]*6,py+a[1]*6);ctx.lineTo(px,py);ctx.stroke();}ctx.restore();}
  if(probe){const [px,py]=xy(probe.x,probe.y);ctx.strokeStyle='#344859';ctx.lineWidth=1;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.moveTo(px-8,py);ctx.lineTo(px-5,py);ctx.moveTo(px+5,py);ctx.lineTo(px+8,py);ctx.moveTo(px,py-8);ctx.lineTo(px,py-5);ctx.moveTo(px,py+5);ctx.lineTo(px,py+8);ctx.stroke();}
}
function resetParticle(p,initial=false){const b=grid.bounds;p.x=initial?b[0]+Math.random()*(b[1]-b[0]):b[0]+.1;p.y=b[2]+.2+Math.random()*(b[3]-b[2]-.4);p.age=0;}
function seedParticles(){particles=Array.from({length:view==='near'?230:300},()=>{const p={};resetParticle(p,true);return p;});}
function animate(t){raf=0;if(!particlesOn||!fieldVisible||document.hidden||!grid)return;const dt=Math.min((t-lastTime)/1000,.05)*3.5;lastTime=t;for(const p of particles){const a=valueAt(p.x,p.y);if(!a){resetParticle(p,true);continue;}const mid=valueAt(p.x+a[0]*dt/2,p.y+a[1]*dt/2)||a;p.x+=mid[0]*dt;p.y+=mid[1]*dt;p.age+=dt;if(p.x>grid.bounds[1]||p.y<grid.bounds[2]||p.y>grid.bounds[3]||p.age>100||p.x*p.x+p.y*p.y<=1.01)resetParticle(p);}draw();raf=requestAnimationFrame(animate);}
function scheduleAnimation(){if(raf){cancelAnimationFrame(raf);raf=0;}if(particlesOn&&fieldVisible&&!document.hidden&&grid){lastTime=performance.now();raf=requestAnimationFrame(animate);}else draw();}
function setParticles(on){particlesOn=on;const b=$('#particles-toggle');b.setAttribute('aria-pressed',String(on));b.textContent=on?'Ⅱ 暂停流向粒子':'▷ 显示流向粒子';scheduleAnimation();}
$('#particles-toggle').onclick=()=>setParticles(!particlesOn);
document.addEventListener('visibilitychange',scheduleAnimation);
motion.addEventListener('change',e=>{if(e.matches)setParticles(false);});
new IntersectionObserver(entries=>{fieldVisible=entries[0].isIntersecting;scheduleAnimation();},{rootMargin:'100px'}).observe(canvas);
new ResizeObserver(resize).observe($('#canvas-wrap'));
function showProbe(e){if(!grid)return;const r=canvas.getBoundingClientRect(),[x,y]=world(e.clientX-r.left,e.clientY-r.top);if(x<grid.bounds[0]||x>grid.bounds[1]||y<grid.bounds[2]||y>grid.bounds[3])return;probe={x,y};const a=valueAt(x,y);$('#probe-readout').textContent=`x = ${x.toFixed(2)} m · y = ${y.toFixed(2)} m`+(a?`　|U| = ${Math.hypot(a[0],a[1]).toFixed(3)} m/s　u = ${a[0].toFixed(3)}　v = ${a[1].toFixed(3)} m/s　p = ${a[2].toFixed(3)} m²/s²`:(x*x+y*y<=1?'　圆柱内部：非流体区域':'　此处没有有效的插值数据'));if(!particlesOn||!fieldVisible)draw();}
canvas.addEventListener('pointermove',showProbe);canvas.addEventListener('click',showProbe);
$$('[data-field]').forEach(b=>b.onclick=()=>{field=b.dataset.field;$$('[data-field]').forEach(a=>{const s=a===b;a.classList.toggle('selected',s);a.setAttribute('aria-pressed',String(s));});paintHeat();});
async function loadView(name){
  const serial=++loadSerial;$('#field-loading').hidden=false;$('#field-loading').textContent='正在读取保存的流场…';
  try{if(!meta){const r=await fetch('assets/field.json');if(!r.ok)throw Error('metadata');meta=await r.json();}
    if(!cache.has(name)){const r=await fetch(meta.views[name].url);if(!r.ok)throw Error('field');const bytes=await r.arrayBuffer(),dv=new DataView(bytes),q=new Int16Array(bytes.byteLength/2);for(let i=0;i<q.length;i++)q[i]=dv.getInt16(i*2,true);const info=meta.views[name];if(q.length!==info.size[0]*info.size[1]*3)throw Error('size');cache.set(name,{...info,q});}
    if(serial!==loadSerial)return;view=name;grid=cache.get(name);probe=null;seedParticles();paintHeat();$('#field-loading').hidden=true;scheduleAnimation();
  }catch(e){if(serial===loadSerial){$('#field-loading').textContent='流场读取失败，请刷新页面重试。';console.error('Field display unavailable',e);}}
}
$('#field-view').onchange=e=>loadView(e.target.value);
loadView('near').then(()=>{if(grid&&!motion.matches)setParticles(true);});

let activeConfig='setup',lossData=null;
const configs={setup:'<dl class="config-list"><div><dt>问题</dt><dd>二维 · 稳态 · 不可压缩</dd></div><div><dt>圆柱直径 D</dt><dd>2 m</dd></div><div><dt>入口速度 U</dt><dd>1 m/s</dd></div><div><dt>运动黏度 ν</dt><dd>0.1 m²/s</dd></div><div><dt>雷诺数 UD/ν</dt><dd>20</dd></div><div><dt>计算域 x / y</dt><dd>[−20, 30] / [−20, 20] m</dd></div><div><dt>网络</dt><dd>2 → 6 × 64 → 3</dd></div><div><dt>优化器 / 学习率</dt><dd>AdamW / 10⁻⁵</dd></div></dl><p class="config-note">配置项供查看，不是在线求解控件。这个模型针对固定几何与工况；修改输入坐标只是在同一个场内查询。</p>',
source:'<p class="config-note" style="margin-top:0;border:0;padding-top:0">流场取自个人圆柱绕流实验保存的 <code>dataPred</code>：11,592 行网格点预测，经合并重复坐标、线性插值后显示。p 为运动学压力。</p><p class="config-note">结构与配置依据 <code>cylinderPinnReCudaFoam.C</code> 和 <code>trainingProperties</code> 核对。历史记录缺少统一运行清单，不能证明全部存档出自同一次运行。</p><p class="config-note">本页没有执行模型推理、CFD 或精度评估。训练记录用于回顾，不替代独立参考解验证。</p><p class="config-note"><a href="assets/pinn-overview.drawio.svg" target="_blank">总图 SVG ↗</a> · <a href="assets/pinn-detailed.drawio" download>完整可编辑图 ↓</a></p>'};
async function showConfig(id){
  activeConfig=id;$$('[data-config]').forEach(b=>{const on=b.dataset.config===id;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  if(id!=='history'){$('#config-content').innerHTML=configs[id];return;}
  $('#config-content').innerHTML='<p class="config-note">读取训练记录…</p>';
  try{if(!lossData){const r=await fetch('assets/loss.json');if(!r.ok)throw Error('loss');lossData=await r.json();}if(activeConfig!=='history')return;
    const w=270,h=165,pad=33,maxX=lossData.rows,toX=x=>pad+(x-1)/(maxX-1)*(w-pad-9),toY=y=>12+(0-Math.log10(y))/8*(h-42),colors=['#7599c3','#b7a39b','#d48454'];
    let svg=`<svg class="loss-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="损失随日志记录序号变化，纵轴为对数刻度">`;
    for(let k=0;k>=-8;k-=2){let y=toY(10**k);svg+=`<line x1="${pad}" y1="${y}" x2="${w-8}" y2="${y}" stroke="#e6eaed"/><text x="${pad-5}" y="${y+3}" text-anchor="end" fill="#97a1ac" font-size="8">10${['⁰','⁻²','⁻⁴','⁻⁶','⁻⁸'][-k/2]}</text>`;}
    for(let c=1;c<=3;c++){const points=lossData.values.map(a=>toX(a[0]).toFixed(1)+','+toY(a[c]).toFixed(1)).join(' ');svg+=`<polyline points="${points}" fill="none" stroke="${colors[c-1]}" stroke-width="1"/>`;}
    svg+=`<text x="${pad}" y="${h-13}" fill="#97a1ac" font-size="8">1</text><text x="${w-8}" y="${h-13}" text-anchor="end" fill="#97a1ac" font-size="8">9,241</text><text x="${w/2}" y="${h}" text-anchor="middle" fill="#97a1ac" font-size="8">日志记录序号（不是迭代步）</text></svg>`;
    $('#config-content').innerHTML=svg+'<div class="loss-legend"><span style="--c:#7599c3">PDE</span><span style="--c:#b7a39b">边界</span><span style="--c:#d48454">总损失</span></div><dl class="config-list"><div><dt>保存的日志行数</dt><dd>9,241</dd></div><div><dt>末条总损失</dt><dd>1.82438 × 10⁻⁶</dd></div></dl><p class="config-note">日志以追加方式保存，没有运行 ID 或迭代列；记录数不能当作完成的训练步数。曲线按区间保留极值抽样，损失下降不等于流场误差已验证。</p>';
  }catch(e){if(activeConfig==='history')$('#config-content').innerHTML='<p class="config-note">训练记录读取失败，请刷新重试。</p>';console.error(e);}
}
$$('[data-config]').forEach(b=>b.onclick=()=>showConfig(b.dataset.config));showConfig('setup');
function updateNav(){const h=location.hash||'#pinn';$$('.topbar nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===h));}
window.addEventListener('hashchange',updateNav);updateNav();
