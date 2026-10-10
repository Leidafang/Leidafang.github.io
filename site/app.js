'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fetchJSON=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`读取失败：${r.status}`);return r.json();};
function choose(button,group){group.forEach(b=>{const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});}

// Model diagrams and inspector share the editable source's semantic node list.
let models;
function renderModel(container,key){
  const m=models[key];container.dataset.model=key;
  container.innerHTML=`<div class="model-hint"><span>点击模块看细节 · 窄屏可左右滑动</span><a href="assets/${key}-overview.drawio.svg" target="_blank" rel="noopener">查看完整简图 ↗</a></div><div class="diagram-scroll" tabindex="0" aria-label="${m.title}，可横向滚动">${m.svg}</div><div class="model-inspector" aria-live="polite"><div><span class="model-step"></span><h4></h4></div><div><p></p><span class="formula"></span></div></div>`;
  function select(id){
    const i=m.nodes.findIndex(n=>n.id===id),n=m.nodes[i];
    $$('.m-node',container).forEach(e=>{const active=e.dataset.node===id;e.classList.toggle('selected',active);e.setAttribute('aria-pressed',String(active));});
    $('.model-step',container).textContent=`${String(i+1).padStart(2,'0')} / ${String(m.nodes.length).padStart(2,'0')} · ${n.kind==='learned'?'可学习模块':n.kind==='loss'?'约束 / 优化':n.kind==='operation'?'数值操作':n.kind==='output'?'物理输出':'输入 / 特征'}`;
    $('.model-inspector h4',container).textContent=n.title;$('.model-inspector p',container).textContent=n.detail;$('.formula',container).textContent=n.formula;
  }
  $$('.m-node',container).forEach(e=>{e.addEventListener('click',()=>select(e.dataset.node));e.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select(e.dataset.node);}});});
  select(m.nodes.find(n=>n.kind==='learned')?.id||m.nodes[0].id);
}
fetchJSON('assets/models.json').then(data=>{models=data;$$('.model-explorer').forEach(e=>renderModel(e,e.dataset.model));document.documentElement.dataset.modelsReady='true';}).catch(()=>{$$('.model-explorer').forEach(e=>e.innerHTML='<p style="padding:20px">模型交互暂未加载，可从页脚下载可编辑总图。</p>');});
$$('[data-geo]').forEach(b=>b.addEventListener('click',()=>{if(!models)return;choose(b,$$('[data-geo]'));renderModel($('#geo-explorer'),b.dataset.geo);}));
$$('[data-urban]').forEach(b=>b.addEventListener('click',()=>{choose(b,$$('[data-urban]'));$('#urban-stage').hidden=b.dataset.urban!=='geometry';$('#urban-result').hidden=b.dataset.urban!=='result';if(b.dataset.urban==='geometry')urban?.resize();}));
$$('[data-result]').forEach(b=>b.addEventListener('click',()=>{choose(b,$$('[data-result]'));const img=$('#urban-result-image');img.src=`assets/urban-${b.dataset.result}.png`;img.alt=`历史测试 No.62 的${b.dataset.result==='ref'?'CFD 参考':'模型预测'}速度场与原始色标`;}));

// Lightweight orthographic display. Only camera projection is computed here.
// Streamline vertices and travel times come from archived steady CFD assets.
class Scene {
  constructor(canvas,kind){
    this.canvas=canvas;this.kind=kind;this.ctx=canvas.getContext('2d');this.base=document.createElement('canvas');this.g=this.base.getContext('2d');this.reset();this.data=null;this.dirty=true;this.visible=true;this.time=0;this.play=!reduced;
    new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);
    new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;},{rootMargin:'120px'}).observe(canvas);
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;this.angle+=(e.clientX-drag.x)*.008;this.pitch=Math.max(.2,Math.min(1.2,this.pitch+(e.clientY-drag.y)*.004));drag={x:e.clientX,y:e.clientY};this.dirty=true;});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>drag=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.55,Math.min(2.4,this.zoom*Math.exp(-e.deltaY*.001)));this.dirty=true;},{passive:false});
    canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')this.angle-=.12;if(e.key==='ArrowRight')this.angle+=.12;if(e.key==='ArrowUp')this.pitch=Math.min(1.2,this.pitch+.07);if(e.key==='ArrowDown')this.pitch=Math.max(.2,this.pitch-.07);if(e.key==='+')this.zoom=Math.min(2.4,this.zoom*1.1);if(e.key==='-')this.zoom=Math.max(.55,this.zoom/1.1);if(e.key==='0')this.reset();this.dirty=true;});
  }
  reset(){this.angle=this.kind==='urban'?-.45:-.65;this.pitch=this.kind==='urban'?.64:.56;this.zoom=1;this.dirty=true;}
  resize(){const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;this.w=r.width;this.h=r.height;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=this.base.width=Math.round(this.w*this.dpr);this.canvas.height=this.base.height=Math.round(this.h*this.dpr);this.dirty=true;}
  setData(data){this.data=data;this.canvas.dataset.loaded='true';this.time=0;this.dirty=true;}
  project(p){
    const center=this.kind==='urban'?[(this.data.bounds[0][0]+this.data.bounds[1][0])/2,(this.data.bounds[0][1]+this.data.bounds[1][1])/2,2]:[2.1,1.375,.6];
    const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2],c=Math.cos(this.angle),s=Math.sin(this.angle),u=x*c-y*s,v=x*s+y*c;
    const span=this.kind==='urban'?Math.max(this.data.bounds[1][0]-this.data.bounds[0][0],this.data.bounds[1][1]-this.data.bounds[0][1]):4.4;
    const scale=Math.min(this.w/(span*1.43),this.h/(span*(this.kind==='urban'?.8:1.4)))*this.zoom;
    return [this.w*(this.kind==='urban'?.54:.5)+u*scale,this.h*(this.kind==='urban'?.64:.57)+(v*Math.sin(this.pitch)-z*Math.cos(this.pitch))*scale,v*Math.cos(this.pitch)+z*Math.sin(this.pitch)];
  }
  line(a,b,color,width=1){const p=this.project(a),q=this.project(b),g=this.g;g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1]);g.stroke();}
  box(x0,x1,y0,y1,z0,z1,fill,stroke){
    const p=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(v=>this.project(v));
    const faces=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].sort((a,b)=>b.reduce((s,i)=>s+p[i][2],0)-a.reduce((s,i)=>s+p[i][2],0));
    const g=this.g;g.fillStyle=fill;g.strokeStyle=stroke;g.lineWidth=.65;
    faces.forEach(f=>{g.beginPath();f.forEach((i,j)=>j?g.lineTo(p[i][0],p[i][1]):g.moveTo(p[i][0],p[i][1]));g.closePath();g.fill();g.stroke();});
  }
  build(){
    const g=this.g;g.setTransform(this.dpr,0,0,this.dpr,0,0);g.clearRect(0,0,this.w,this.h);
    if(this.kind==='urban'){
      for(let i=-80;i<=80;i+=10){this.line([-80,i,0],[80,i,0],'#679db114',.7);this.line([i,-80,0],[i,80,0],'#679db114',.7);}
      this.data.edges.forEach(([a,b])=>this.line(a,b,a[2]<.1&&b[2]<.1?'#387582':'#70cddd88',.9));
    }else{
      for(let x=0;x<=4.21;x+=.3)this.line([x,0,-.5],[x,2.75,-.5],'#6597a51b',.6);
      for(let y=0;y<=2.76;y+=.25)this.line([0,y,-.5],[4.2,y,-.5],'#6597a51b',.6);
      this.box(0,4.2,0,2.75,-.51,2.2,'#1a4b5e04','#527c8d38');
      for(const [x0,x1] of this.racks||[]){
        this.box(x0,x1,.95,2.15,.08,1.93,'#15394b25','#71a4b54a');
        for(let i=0;i<9;i++)this.box(x0,x1,1.05,1.95,.2+.2*i,.24+.2*i,'#2a5d7370','#729aa950');
      }
      for(const z of [-.42,-.28,-.14])this.box(0,4.2,1.05,1.95,z,z+.02,'#286f7660','#51b9be70');
      // Retain every vertex of each selected path; static image cached until camera/case changes.
      this.data.paths.forEach(path=>{for(let i=1;i<path.length;i++)this.line(path[i-1],path[i],color((path[i][3]+path[i-1][3])/2,.23),.8);});
    }
    this.dirty=false;
  }
  draw(dt){
    if(!this.data||!this.w||!this.visible||this.canvas.parentElement.hidden)return;
    if(this.dirty)this.build();
    const g=this.ctx;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,this.canvas.width,this.canvas.height);g.drawImage(this.base,0,0);
    if(this.kind!=='cht')return;
    if(this.play&&!document.hidden)this.time+=Math.min(dt,.08)*.8;
    g.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.data.paths.forEach((path,i)=>{
      if(path.length<2)return;
      const start=path[0][4],duration=path[path.length-1][4]-start;if(duration<=0)return;
      for(let j=0;j<2;j++){
        const t=start+(this.time+(i*.173+j*.5)*duration)%duration;
        let lo=0,hi=path.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(path[mid][4]<t)lo=mid;else hi=mid;}
        const a=path[lo],b=path[hi],f=(t-a[4])/Math.max(1e-8,b[4]-a[4]),p=this.project(a.map((v,k)=>v+(b[k]-v)*f));
        g.fillStyle=color(a[3]+(b[3]-a[3])*f,1);g.beginPath();g.arc(p[0],p[1],1.7,0,Math.PI*2);g.fill();
      }
    });
  }
}
let colorMax=100;
function color(temp,alpha){const stops=[[65,159,200],[85,198,178],[200,216,113],[234,162,104],[215,99,97]],t=Math.max(0,Math.min(1,(temp-15)/(colorMax-15)))*4,i=Math.min(3,Math.floor(t)),f=t-i,c=stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*f));return `rgba(${c.join(',')},${alpha})`;}
const urban=new Scene($('#urban-canvas'),'urban'),cht=new Scene($('#cht-canvas'),'cht');
$('#urban-reset').addEventListener('click',()=>urban.reset());$('#cht-reset').addEventListener('click',()=>cht.reset());
const motion=$('#cht-motion');function showMotion(){motion.textContent=cht.play?'暂停粒子 Ⅱ':'播放粒子 ▷';motion.setAttribute('aria-pressed',String(cht.play));}showMotion();motion.addEventListener('click',()=>{cht.play=!cht.play;showMotion();});
fetchJSON('assets/urban-geometry.json').then(data=>{urban.setData(data);$('#urban-loading').hidden=true;}).catch(()=>$('#urban-loading').textContent='几何暂未加载，请刷新重试；仍可查看历史预测对照。');
let caseSeq=0;const caseCache=new Map();
async function loadCase(id){
  const seq=++caseSeq;$('#cht-loading').hidden=false;$('#cht-loading').textContent='正在读取已有 CFD 路径…';
  try{
    let data=caseCache.get(id);if(!data){data=await fetchJSON(`assets/cht-${id}.json`);caseCache.set(id,data);}if(seq!==caseSeq)return;
    cht.setData(data);$('#cht-loading').hidden=true;
    $('#cht-caption').textContent=`${data.title} / ${data.controls.total_heat_kW} kW`;
    $('#cht-heat').textContent=data.controls.total_heat_kW.toFixed(0);$('#cht-max').textContent=data.metrics.air_max_C.toFixed(1);
    const pairs=[['三组热源 / kW',data.controls.group_heat_kW.join(' / ')],['机柜风机倍率',data.controls.rack_fan_multipliers.map(v=>v.toFixed(2)).join(' / ')],['水侧流量 / kg·s⁻¹',data.controls.water_mass_flow_kg_s.toFixed(2)],['回风温度 / °C',data.metrics.air_return_C.toFixed(1)]];
    $('#cht-facts').replaceChildren(...pairs.map(([k,v])=>{const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;div.append(dt,dd);return div;}));
    $('#cht-canvas').dataset.case=id;
  }catch(e){if(seq===caseSeq){$('#cht-loading').textContent='此工况暂未加载，请重新选择或刷新。';$('#cht-case').value=cht.data?.id||id;}}
}
fetchJSON('assets/cht-catalog.json').then(data=>{
  cht.racks=data.rack_x;colorMax=Math.ceil(Math.max(...data.cases.map(c=>c.range[1]))/10)*10;
  $('.temperature-legend p').innerHTML=`<span>15</span><span>${Math.round((15+colorMax)/2)}</span><span>${colorMax}</span>`;
  const select=$('#cht-case');select.replaceChildren(...data.cases.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.title;return o;}));select.disabled=false;select.addEventListener('change',()=>loadCase(select.value));loadCase(select.value);
}).catch(()=>$('#cht-loading').textContent='案例目录暂未加载，可打开完整 CFD 展示。');
let last=0;function frame(now){const dt=(now-last)/1000;last=now;urban.draw(dt);cht.draw(dt);requestAnimationFrame(frame);}requestAnimationFrame(frame);

const nav=$$('.topbar nav a');
function updateNav(){let selected=nav[0];for(const a of nav){if($(a.getAttribute('href')).getBoundingClientRect().top<innerHeight*.38)selected=a;}nav.forEach(a=>a.classList.toggle('active',a===selected));}
addEventListener('scroll',updateNav,{passive:true});updateNav();
