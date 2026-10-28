// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import * as THREE from 'three';
import {t,getLanguage} from './i18n.js';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import {createDaylight} from './daylight.js';
import { temperatureRGB, samplePath, phaseTime, fanRPM } from './flow-math.js';
import {finishMaterials,addFan,updateFans,rotors,addEquipmentDetail,addCoilDetail,addEnvironment} from './appearance.js';
import {CAMPUS,prepareCampus} from './campus.js';
import {buildSolidFields,solidRGB} from './solid-fields.js';
import {buildContainerExterior} from './container-exterior.js';
import {prepareVegetation,vegetationStats} from './vegetation.js';
import {prepareLandscape,landscapeStats} from './landscape.js';
import {exposedBlocks,outsideBlocks} from './render-geometry.js';

import {loadCatalog,loadEmptyScene,loadCase} from './case-data.js';
import {controlsFromEngineering,controlDomain,predictCase,AI_MODEL,AI_GEOMETRY} from './ai-request.js';
import {protectedModels,modelUnlocked,mountModelAccess,refreshAccess} from './model-access.js';
import {localAI,browserAIStatus,predictBrowserCase} from './browser-ai.js';
import {bindDials} from './ai-dials.js';
import {createTransientPlayer} from './transient-player.js';
import {prepareVisibility,pathOpacity,distanceOpacity,selectFlowPaths} from './flow-visibility.js';

const $=id=>document.getElementById(id);
const stage=$('stage'), canvas=$('scene');
let manifest, packed, renderer, controls, camera, world, particleSystem, traces;
let solidFields,daylight,catalog,caseLoading=false,caseError=false,caseRequest=0,caseAbort;
let refreshDials=()=>{};
let transientPlayer;
let transientMode=false;
let campusReady=false,campusLoading=null,viewRequest=0;
const transientEntry=new URLSearchParams(location.search).get('mode')==='transient'||localAI;
let aiLastError=null;
// Empty while checking or compatible; an incompatible device shows a warning only.
let aiCompatibilityIssue="";
let nominalData=null;
let fieldReady=false,aiStage='idle',aiReady=false,aiBusy=false,aiMessage='连接本地 AI 服务后可预测。',aiMessageError=false;
let flowVisibility=[],traceMode=null,traceDensity=NaN,activePathIndices=[];
const particlesPerPath=4;
let selectedRack=null,lastError=null,fullscreenFallback=false;
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let elapsed=0, previous=performance.now(), speed=1, density=3, view='campus';
let frameId=0, transitioning=null, viewportMobile=null;
let lastParticleTime=NaN,lastParticleDensity=NaN;
const labelEntries=[], pickTargets=[], mats={}, groups={};
const clipPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),2.1);
const tempOut=new Float32Array(4), colorLUT=[];
const boxGeometry=new THREE.BoxGeometry(1,1,1), dummy=new THREE.Object3D();
const groupNames=['structure','floor','racks','details','coil','shell','fans','equipment','coilDetail','environment'];

function material(name,color,metalness=.25,roughness=.5){
  return mats[name]=new THREE.MeshStandardMaterial({color,metalness,roughness});
}
function box(group,lo,hi,mat){
  const mesh=new THREE.Mesh(boxGeometry,mat);
  mesh.position.set(...lo.map((v,i)=>(v+hi[i])/2));
  mesh.scale.set(...lo.map((v,i)=>hi[i]-v));
  mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh); return mesh;
}
function instances(group,boxes,mat){
  if(group===groups.details)boxes=outsideBlocks(boxes,manifest.geometry.excluded_blocks);
  if(!boxes.length)return;
  const obj=new THREE.InstancedMesh(boxGeometry,mat,boxes.length);
  boxes.forEach((b,i)=>{dummy.position.set(...b.lo.map((v,k)=>(v+b.hi[k])/2));dummy.scale.set(...b.lo.map((v,k)=>b.hi[k]-v));dummy.updateMatrix();obj.setMatrixAt(i,dummy.matrix);});
  obj.castShadow=true;obj.receiveShadow=true;group.add(obj);return obj;
}
function label(text,xyz,cls=''){
  const node=document.createElement('div');node.className=`labels ${cls}`;node.textContent=t(text);
  $('labels').appendChild(node);labelEntries.push({node,text,point:new THREE.Vector3(...xyz),kind:cls});
}
function edges(lo,hi,color=0x6f8b9d,opacity=.4){
  const geo=new THREE.EdgesGeometry(new THREE.BoxGeometry(...lo.map((v,i)=>hi[i]-v)));
  const line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity}));
  line.position.set(...lo.map((v,i)=>(v+hi[i])/2));world.add(line);return line;
}
function buildRoom(){
  material('frame',0x546775,.75,.34);material('body',0x19232d,.6,.45);
  material('panel',0x697d8b,.7,.38);material('dark',0x0a141e,.4,.55);
  material('floor',0x657986,.32,.7);material('structure',0x354858,.4,.55);
  material('coil',0x81b8bc,.7,.3);material('fan',0x658997,.7,.32);
  mats.led=new THREE.MeshBasicMaterial({color:0xa0eacf});
  finishMaterials(mats);
  groupNames.forEach(n=>{groups[n]=new THREE.Group();world.add(groups[n]);});
  const g=manifest.geometry;
  groups.structure.add(new THREE.Mesh(exposedBlocks(g.excluded_blocks.filter(b=>b.lo[2]>=0)),mats.structure));
  groups.floor.add(new THREE.Mesh(exposedBlocks(g.excluded_blocks.filter(b=>b.lo[2]<0)),mats.floor));
  box(groups.floor,[-.06,-.06,-.57],[4.26,2.81,-.515],mats.dark);
  edges([0,0,-.51],[4.2,2.75,2.2],0x86a7ba,.27);
  const rackPlates=g.solid_blocks.filter(b=>b.region.startsWith('rack'));
  instances(groups.racks,rackPlates,mats.panel);
  const rails=[],body=[],details=[],vent=[],leds=[];
  g.rack_x.forEach(([a,b],n)=>{
    for(const x of [a-.008,b-.016])for(const y of [.95,2.12])
      rails.push({lo:[x,y,.08],hi:[x+.024,y+.028,1.93]});
    for(const z of [.08,1.9])body.push({lo:[a,.95,z],hi:[b,2.15,z+.03]});
    for(let row=0;row<8;row++){
      const z=.2+row*.2;
      body.push({lo:[a+.014,1.044,z-.002],hi:[b-.014,1.058,z+.047]});
      for(const x of [a+.034,b-.058])details.push({lo:[x,1.018,z+.003],hi:[x+.02,1.043,z+.038]});
      for(let k=0;k<11;k++)vent.push({lo:[a+.095+k*.029,1.034,z+.01],hi:[a+.11+k*.029,1.042,z+.031]});
      leds.push({lo:[b-.089,1.027,z+.017],hi:[b-.077,1.033,z+.025]});
    }
    // Decorative door mesh is sparse so the computed channels remain legible.
    for(const y of [.965,2.135]){
      for(let k=1;k<17;k++)vent.push({lo:[a+.02,y,.1+k*.1],hi:[b-.02,y+.004,.104+k*.1]});
      for(let k=1;k<10;k++)vent.push({lo:[a+k*.056,y,.12],hi:[a+k*.056+.003,y+.004,1.88]});
    }
    for(const z of [.43,.83,1.23,1.63])addFan(groups.fans,(a+b)/2,2.152,z,.086,'y','rack',manifest.engineering_controls.rack_fan_multipliers[Math.floor(n/2)]);
    label(`${['A','A','B','B','C','C'][n]}${n%2+1} · R${n+1}`,[(a+b)/2,.94,2.09],'small');
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(b-a,1.2,1.8),new THREE.MeshBasicMaterial({visible:false}));
    proxy.position.set((a+b)/2,1.55,1);proxy.userData.rack=n+1;world.add(proxy);pickTargets.push(proxy);
  });
  instances(groups.details,rails,mats.frame);instances(groups.details,body,mats.body);
  instances(groups.details,details,mats.panel);instances(groups.details,vent,mats.dark);
  instances(groups.details,leds,mats.led);
  const grilles=[];
  g.rack_x.forEach(([a,b])=>{
    for(const [ya,yb] of [[0,.95],[2.15,2.57]]){
      for(let x=a;x<b-.009;x+=.047)grilles.push({lo:[x,ya,-.003],hi:[x+.009,yb,.004]});
      for(const y of [ya,yb-.015])grilles.push({lo:[a,y,-.005],hi:[b,y+.015,.008]});
    }
    addFan(groups.fans,(a+b)/2,2.36,-.025,.17,'z','return',manifest.engineering_controls.return_fan_multiplier);
  });
  instances(groups.floor,grilles,mats.frame);
  for(const [a,b] of g.coil_plates_z_m){
    box(groups.coil,[0,1.05,a],[4.2,1.95,b],mats.coil);
    // Light edge strips delineate the actual three 20 mm solid plates.
    box(groups.coil,[0,1.048,a],[4.2,1.052,b],mats.panel);
  }
  addEquipmentDetail(groups.equipment,g);addCoilDetail(groups.coilDetail,g);
  if(campusReady)buildCampusEnvironment();
  buildContainerExterior(groups.shell);
  label('冷侧 · 送风',[.2,.4,.42]);label('热侧 · 回风',[4.05,2.44,.75],'hot');
  label('水冷换热器 · 等效外观',[3.6,1.55,-.39],'coil');
  label('回风风扇',[4,2.36,-.05],'hot');label('地板下闭式回路',[.15,.5,-.48],'coil');
  label('热侧 · 回风',[1.9,2.45,.45],'hot section-only');
  label('水冷换热器 · 水沿 +x 升温',[1.9,1.5,-.36],'coil section-only');
  // No overlay GridHelper: the campus has one physical paving layout.
  const axes=new THREE.AxesHelper(.45);axes.position.set(-.2,-.3,-.5);world.add(axes);
  label('X',[.32,-.3,-.5],'small');label('Y',[-.2,.23,-.5],'small');label('Z',[-.2,-.3,.02],'small');
}

function colorFor(t){
  const [lo,hi]=manifest.display_temperature_range_C;
  return colorLUT[Math.min(255,Math.max(0,Math.round((t-lo)/(hi-lo)*255)))];
}
function buildFlowLegend(){
  const [min,max]=manifest.display_temperature_range_C,ctx=$('colorbar').getContext('2d');
  for(let i=0;i<300;i++){ctx.fillStyle=`rgb(${temperatureRGB(min+(max-min)*i/299,min,max).map(x=>Math.round(x*255)).join(',')})`;ctx.fillRect(i,0,1,12);}
  $('tmin').textContent=min.toFixed(1);$('tmid').textContent=((min+max)/2).toFixed(1);$('tmax').textContent=max.toFixed(1);document.querySelector('.legend:not(.solid-legend)').hidden=false;
}
function buildFlow(){
  colorLUT.length=0;traceMode=null;
  flowVisibility=manifest.paths.map(p=>prepareVisibility(packed,p));
  const [min,max]=manifest.display_temperature_range_C;
  for(let i=0;i<256;i++){
    const [r,g,b]=temperatureRGB(min+(max-min)*i/255,min,max);
    colorLUT.push(new THREE.Color().setRGB(r,g,b,THREE.SRGBColorSpace));
  }
  const ctx=$('colorbar').getContext('2d');
  for(let i=0;i<300;i++){const c=temperatureRGB(min+(max-min)*i/299,min,max);ctx.fillStyle=`rgb(${c.map(x=>Math.round(x*255)).join(',')})`;ctx.fillRect(i,0,1,12);}
  $('tmin').textContent=min.toFixed(1);$('tmid').textContent=((min+max)/2).toFixed(1);$('tmax').textContent=max.toFixed(1);
  traces=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,vertexColors:true,
    vertexShader:`attribute float alpha; varying vec3 vColor; varying float vAlpha;
      void main(){vColor=color;vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){gl_FragColor=vec4(vColor,vAlpha*.11);
      #include <colorspace_fragment>
    }`
  }));world.add(traces);
  const total=manifest.paths.length*particlesPerPath*12;
  const pg=new THREE.BufferGeometry();
  for(const [n,k] of [['position',3],['color',3],['alpha',1],['radius',1]])pg.setAttribute(n,new THREE.BufferAttribute(new Float32Array(total*k),k).setUsage(THREE.DynamicDrawUsage));
  const shader=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,vertexColors:true,clipping:true,
    uniforms:{pixelRatio:{value:renderer.getPixelRatio()},cutX:{value:100},cutZ:{value:100}},
    vertexShader:`attribute float alpha; attribute float radius;
      varying vec3 vColor; varying float vAlpha; varying vec3 vPosition;
      uniform float pixelRatio;
      void main(){vColor=color;vAlpha=alpha;vPosition=position;
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(radius*pixelRatio*4.0/max(0.1,-mv.z),1.0,20.0);}`,
    fragmentShader:`varying vec3 vColor; varying float vAlpha; varying vec3 vPosition;uniform float cutX;uniform float cutZ;
      void main(){if(vPosition.x>cutX || vPosition.z>cutZ)discard;
        float r=length(gl_PointCoord-0.5)*2.0;if(r>1.0)discard;
        float opacity=(1.0-smoothstep(0.65,1.0,r))*vAlpha;
        if(opacity<0.01)discard;gl_FragColor=vec4(vColor,opacity);
        #include <colorspace_fragment>
      }`
  });
  particleSystem=new THREE.Points(pg,shader);particleSystem.frustumCulled=false;particleSystem.renderOrder=3;world.add(particleSystem);
}

function updateTraces(){
  const mode=['plenum','section'].includes(view)?view:'all';
  if(traceMode===mode&&traceDensity===density)return;
  traceMode=mode;traceDensity=density;lastParticleTime=NaN;
  activePathIndices=selectFlowPaths(manifest.paths.length,density);
  const positions=[],colors=[],alpha=[];
  activePathIndices.forEach(n=>{
    const p=manifest.paths[n];
    // Every selected path gets both a trace and particles, with identical cuts.
    const meta=flowVisibility[n];
    for(const [a,b] of meta[mode])for(let j=a+1;j<=b;j++)for(const k of [j-1,j]){
      const i=(p.offset+k)*5,c=colorFor(packed[i+3]);
      positions.push(packed[i],packed[i+1],packed[i+2]);colors.push(c.r,c.g,c.b);
      alpha.push(distanceOpacity(meta,k,0,mode));
    }
  });
  const geo=new THREE.BufferGeometry();
  for(const [name,values,size] of [['position',positions,3],['color',colors,3],['alpha',alpha,1]])geo.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  traces.geometry.dispose();traces.geometry=geo;
}

function updateParticles(){
  if(elapsed===lastParticleTime&&density===lastParticleDensity)return;
  lastParticleTime=elapsed;lastParticleDensity=density;
  const a=particleSystem.geometry.attributes;
  let idx=0;
  activePathIndices.forEach(n=>{
    const p=manifest.paths[n];
    for(let j=0;j<particlesPerPath;j++){
      const phase=(j/particlesPerPath+(n*.61803398875)%1)%1;
      const time=phaseTime(elapsed,p.duration_s,phase);

      for(let trail=0;trail<12;trail++){
        const t=time-trail*.018;
        // Trails stop at the seed: never draw a fictitious loop-closing chord.
        const v=samplePath(packed,p,Math.max(0,t),tempOut), c=colorFor(v[3]);
        a.position.array[idx*3]=v[0];a.position.array[idx*3+1]=v[1];a.position.array[idx*3+2]=v[2];
        a.color.array[idx*3]=c.r;a.color.array[idx*3+1]=c.g;a.color.array[idx*3+2]=c.b;
        a.alpha.array[idx]=pathOpacity(packed,p,flowVisibility[n],t,traceMode)*(trail===0?1:.86*(1-trail/12));
        a.radius.array[idx]=trail===0?12:7.2*(1-trail/18);idx++;
      }
    }
  });
  particleSystem.geometry.setDrawRange(0,idx);
  Object.values(a).forEach(attr=>{attr.needsUpdate=true;});
}

function applyVisibility(){
  const xray=$('xray').checked, below=view==='plenum',detailed=$('detail').checked;
  const engineering=transientMode?transientPlayer?.engineering:manifest.engineering_controls;
  if(engineering)for(const r of rotors){const i=manifest.geometry.rack_x.findIndex(([a,b])=>r.assembly.position.x>=a&&r.assembly.position.x<=b);r.rpm=fanRPM(r.kind,r.kind==='return'?engineering.return_fan_multiplier:engineering.rack_fan_multipliers[Math.floor(i/2)]);}
  const visible=(transientMode?transientPlayer?.ready:fieldReady)&&!aiBusy;
  const solidKind=visible?$('solid-field').value:'off';
  for(const name of ['body','panel','dark','structure','frame']){
    const mat=mats[name];mat.transparent=xray;mat.opacity=xray?({body:.16,panel:.18,dark:.24,structure:.12,frame:.8}[name]):1;
    mat.depthWrite=!xray;mat.needsUpdate=true;
  }
  groups.shell.visible=['campus','overview'].includes(view);
  groups.shell.userData.closed.visible=$('shell').checked;
  groups.shell.userData.cutaway.visible=!$('shell').checked;
  $('shell').disabled=!groups.shell.visible;
  for(const name of ['racks','details','structure'])groups[name].visible=!below;
  groups.floor.visible=!below;
  groups.fans.visible=true;
  rotors.forEach(fan=>{fan.assembly.visible=(!below||fan.kind==='return')&&(view!=='section'||fan.assembly.position.x<=2.1);});
  groups.equipment.visible=detailed&&!below;
  groups.racks.visible=!detailed&&!below;
  groups.coilDetail.visible=detailed;groups.coil.visible=!detailed;
  solidFields.coil.visible=!transientMode&&solidKind==='coil';solidFields.racks.visible=!transientMode&&solidKind==='racks';
  $('xray').disabled=below||solidKind==='racks';
  $('xray').parentElement.title=$('xray').disabled?t('当前显示真实计算板件，外观透视暂不适用'):'';
  for(const l of labelEntries)if(l.text.startsWith('水冷换热器 ·')&&!l.kind.includes('section-only'))
    l.node.textContent=solidKind==='coil'?t('换热器 · 实际计算冷板'):t('水冷换热器 · 等效外观');
  if(solidKind==='coil'){groups.coilDetail.visible=false;groups.coil.visible=false;}
  if(solidKind==='racks'){
    for(const n of ['equipment','racks','details','structure','shell'])groups[n].visible=false;
  }
  groups.environment.visible=$('environment').checked&&['campus','overview'].includes(view);
  world.fog=null;
  world.background=null;
  daylight.sky.visible=groups.environment.visible;
  // Rebuild only when changing visibility, not for every animation frame.
  daylight.sun.shadow.needsUpdate=true;
  groups.equipment.traverse(obj=>{if(obj.material){obj.material.transparent=xray;obj.material.opacity=xray?.24:1;obj.material.depthWrite=!xray;}});
  particleSystem.visible=visible&&!transientMode&&$('original-flow').checked;traces.visible=particleSystem.visible&&$('streamlines').checked;updateTraces();

  Object.values(mats).forEach(mat=>{mat.clippingPlanes=view==='section'?[clipPlane]:[];});
  for(const name of ['equipment','coilDetail'])groups[name].traverse(obj=>{if(obj.material)obj.material.clippingPlanes=view==='section'?[clipPlane]:[];});

  particleSystem.material.uniforms.cutX.value=view==='section'?2.1:100;
  particleSystem.material.uniforms.cutZ.value=below?-.035:100;
  updateSolidLegend(solidKind);
  transientPlayer?.visibility({view,kind:solidKind});
}

function updateSolidLegend(kind){
  $('solid-legend').hidden=kind==='off';
  if(kind==='off'){$('solid-note').textContent=t('固体云图已关闭，显示设备外观；空气粒子继续运行。');return;}
  const [lo,hi]=solidFields.ranges[kind],ctx=$('solid-colorbar').getContext('2d');
  $('solid-title').textContent=kind==='coil'?t('换热器 · 固体温度'):t('服务器 · 固体温度');
  for(let i=0;i<300;i++){ctx.fillStyle=`rgb(${solidRGB(lo+(hi-lo)*i/299,lo,hi).map(v=>Math.round(v*255)).join(',')})`;ctx.fillRect(i,0,1,12);}
  $('solid-min').textContent=lo.toFixed(1);$('solid-mid').textContent=((lo+hi)/2).toFixed(1);$('solid-max').textContent=hi.toFixed(1);
  $('solid-note').textContent=kind==='coil'?t('显示三块实际计算冷板的温度分布；装饰翅片暂隐藏。'):t('显示六柜实际等效发热板，空气流动保持；并非 CPU 结温。');
}

const views={
  campus:{pos:[25.24,-33.37,10.98],target:[-11.417,8.629,3.734]},
  overview:{pos:[6.3,-5.9,3.9],target:[2.3,1.3,.75]},
  hot:{pos:[-1.228978,6.901272,2.956936],target:[2.1,2.779219,.773420]},
  section:{pos:[-4.388886,1.819462,1.528697],target:[1.4,1.843119,.614606]},
  plenum:{pos:[5.102,-4.363,2.213],target:[1.156,1.017,.096]},
  solid:{pos:[5.035,-4.442,2.771],target:[1.002,.690,.242]},
};
function campusPose(){
  const width=canvas.clientWidth,height=canvas.clientHeight,mobile=width<=760;
  const reference=views.campus,offset=new THREE.Vector3(...reference.pos).sub(new THREE.Vector3(...reference.target));
  const target=mobile?new THREE.Vector3(-8,8,7):new THREE.Vector3(...reference.target);
  const available=mobile?width:Math.max(320,width-340);
  const scale=Math.max(1,(height/733)*((mobile?1300:1580)/available)*Math.tan(THREE.MathUtils.degToRad(20))/Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  return {pos:target.clone().addScaledVector(offset,scale).toArray(),target:target.toArray()};
}
function updateViewHelp(name=view){
  const descriptions={campus:t('办公楼外观参考照片，尺寸为展示近似；数据中心保持原计算尺度。'),overview:t('查看整机结构与闭式气流循环，点击机柜可查看运行数据。'),hot:t('从热侧观察回风、机柜风扇与气流组织。'),section:t('纵向剖开房间，检查空气在机柜与地板下的流动。'),plenum:t('地板隐藏，直接观察三块计算冷板与周围空气。'),solid:t('六柜共用一个固体色标，可比较发热板温度；空气粒子仍沿原流场运动。')};
  $('view-help').textContent=descriptions[name];
}
function buildCampusEnvironment(){
  daylight.enableEnvironment();
  addEnvironment(world,groups.environment);
  for(const [text,position] of CAMPUS.labels)label(text,position,'site');
}
async function setView(name){
  const request=++viewRequest;
  if(['campus','overview'].includes(name)&&!campusReady){
    $('loading').hidden=false;$('loading').style.display='flex';$('loading').textContent=getLanguage()==='zh'?'正在读取园区素材…':'Loading campus assets…';
    try{
      campusLoading??=Promise.all([prepareVegetation(),prepareLandscape(),prepareCampus()]).then(()=>{campusReady=true;buildCampusEnvironment();});
      await campusLoading;
    }catch(error){campusLoading=null;$('case-status').textContent=getLanguage()==='zh'?'园区素材读取失败，可重试；瞬态仍可播放。':'Campus assets unavailable; retry or continue the transient.';return;}
    finally{$('loading').hidden=true;$('loading').style.display='none';}
    if(request!==viewRequest)return;
  }
  if(name==='campus')$('environment').checked=true;
  $('solid-field').value=name==='plenum'?'coil':name==='solid'?'racks':'off';
  updateViewHelp(name);
  if(!['plenum','solid'].includes(name))$('solid-note').textContent=t('选择固体场时自动切换到对应视角，空气粒子保持运行。');
  view=name;applyVisibility();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  let end=name==='campus'?campusPose():views[name];
  if(['hot','section','plenum','solid'].includes(name)){
    // Match the supplied 1920 x 898 reference, then leave room for the panel
    // on narrower desktops. On phones center the field in the full canvas.
    const width=canvas.clientWidth,height=canvas.clientHeight;
    const direction=new THREE.Vector3(...end.pos).sub(new THREE.Vector3(...end.target));
    const mobile=width<=760;
    const target=mobile?new THREE.Vector3(name==='section'?1.4:2.1,1.375,name==='plenum'?.65:.85):new THREE.Vector3(...end.target);
    const availableWidth=mobile?width:Math.max(320,width-340);
    const referenceWidth=mobile?1050:1580;
    const scale=Math.max(1,(height/733)*(referenceWidth/availableWidth)*Math.tan(THREE.MathUtils.degToRad(20))/Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    end={pos:target.clone().addScaledVector(direction,scale).toArray(),target:target.toArray()};
  }
  transitioning={start:performance.now(),pos:camera.position.clone(),target:controls.target.clone(),end};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)transitioning.start-=1000;
  $('selection').hidden=true;
}
function updateLabels(){
  const rect=canvas.getBoundingClientRect();const projection=new THREE.Vector3();
  const labelsOn=$('showlabels').checked;
  for(const l of labelEntries){
    projection.copy(l.point).project(camera);
    const x=(projection.x*.5+.5)*rect.width,y=(-projection.y*.5+.5)*rect.height;
    let visible=labelsOn && projection.z>-1 && projection.z<1 && x>5&&y>5&&x<rect.width-10&&y<rect.height-5;
    if(l.kind==='site'&&!groups.environment.visible)visible=false;
    if(view==='campus'&&l.kind!=='site')visible=false;
    if(view==='section'&&l.point.x>2.1)visible=false;
    if(view==='section'&&l.kind==='small'&&l.node.textContent.includes('·')&&!l.node.textContent.includes('R3'))visible=false;
    if(l.kind.includes('section-only')&&view!=='section')visible=false;
    if(view==='plenum'&&l.point.z>.02)visible=false;
    if(rect.width>760 && x>rect.width-295&&y<rect.height-115)visible=false;
    l.node.style.display=visible?'block':'none';l.node.style.left=`${x}px`;l.node.style.top=`${y}px`;
  }
}

function resize(){
  const width=stage.clientWidth,height=width<=760?560:stage.clientHeight;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=width<=760?58:40;camera.updateProjectionMatrix();
  if(width>760)camera.setViewOffset(width,height,125,0,width,height);
  else camera.clearViewOffset();
  const mobile=width<=760,changed=viewportMobile!==null&&mobile!==viewportMobile;viewportMobile=mobile;
  if(changed&&transientMode)setView(view);
}
function animate(now){
  frameId=requestAnimationFrame(animate);
  const dt=Math.min((now-previous)/1000,.06);previous=now;
  if(document.hidden)return;
  if(playing&&fieldReady&&!aiBusy&&!transientMode)elapsed+=dt*speed;
  if(transitioning){
    // A queued first RAF can carry a timestamp older than setView's start.
    // Clamp before easing; negative input otherwise overshoots and ends the
    // transition at an off-scene camera position during slow startup.
    let t=Math.max(0,Math.min(1,(now-transitioning.start)/750));t=t*t*(3-2*t);
    camera.position.lerpVectors(transitioning.pos,new THREE.Vector3(...transitioning.end.pos),t);
    controls.target.lerpVectors(transitioning.target,new THREE.Vector3(...transitioning.end.target),t);
    if(t>=1)transitioning=null;
  }
  controls.update();
  // Keep millimetre-scale ground markings resolvable at campus distances,
  // while retaining the original near plane for close thermal inspection.
  const near=Math.max(.03,Math.min(.5,camera.position.distanceTo(controls.target)*.008));
  if(Math.abs(camera.near-near)>1e-5){camera.near=near;camera.updateProjectionMatrix();}
  if(!transientMode)updateParticles();updateFans(transientMode?transientPlayer.time:elapsed,transientMode?transientPlayer.playing:playing&&fieldReady&&!aiBusy,transientMode?transientPlayer.speed:speed,$('fanslow').checked,dt);updateLabels();transientPlayer?.tick(dt);renderer.render(world,camera);
}

function showSelection(rack){
  if(!fieldReady||aiBusy)return;
  if(!fieldReady||aiBusy||transientMode)return;
  selectedRack=rack;
  const metrics=manifest.metrics.regions[`rack${rack}`], p=manifest.engineering_controls.group_heat_kW[Math.floor((rack-1)/2)]*1000/2;
  $('selection').querySelector('h3').textContent=t('机柜 R{rack} · {group} 组',{rack,group:['A','B','C'][Math.floor((rack-1)/2)]});
  $('selection').querySelector('p').textContent=t('热功率 {power} W；风扇倍率 {fan}。等效发热板均温 {mean}°C，最高 {max}°C；不是 CPU 结温。',{power:p.toFixed(0),fan:manifest.engineering_controls.rack_fan_multipliers[Math.floor((rack-1)/2)],mean:(metrics.Tmean_K-273.15).toFixed(2),max:(metrics.Tmax_K-273.15).toFixed(2)});
  $('selection').hidden=false;
}
const playLabel=()=>{$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?t('暂停粒子动画'):t('播放粒子动画'));$('play-state').textContent=playing?t('气流运动'):t('已暂停');};
function bindControls(){
  bindAI();
  function switchMode(useTransient){
    if(aiBusy)return;
    transientMode=useTransient;$('app').classList.toggle('transient-mode',useTransient);
    $('mode-ai').setAttribute('aria-pressed',String(!useTransient));$('mode-transient').setAttribute('aria-pressed',String(useTransient));
    $('ai-controls').hidden=useTransient;$('transient-controls-panel').hidden=!useTransient;$('transient-timeline').hidden=!useTransient;
    document.querySelector('.transient-flow').hidden=!useTransient;document.querySelector('.transient-slice-toggle').hidden=!useTransient;
    transientPlayer.setActive(useTransient);$('tab-inspect').click();$('selection').hidden=true;
    if(useTransient)setView('solid');else{buildFlowLegend();applyVisibility();refreshLanguage();}
    refreshAI();
  }
  $('mode-ai').addEventListener('click',()=>switchMode(false));$('mode-transient').addEventListener('click',()=>switchMode(true));
  const tabs=[...document.querySelectorAll('[data-panel]')];
  function selectPanel(tab){
    tabs.forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;$(`panel-${t.dataset.panel}`).hidden=!active;});
  }
  tabs.forEach(t=>{t.addEventListener('click',()=>selectPanel(t));t.addEventListener('keydown',e=>{
    const available=tabs.filter(tab=>!transientMode||tab.dataset.panel!=='case'),i=available.indexOf(t);
    const n=e.key==='ArrowRight'?(i+1)%available.length:e.key==='ArrowLeft'?(i+available.length-1)%available.length:e.key==='Home'?0:e.key==='End'?available.length-1:-1;
    if(n>=0){e.preventDefault();selectPanel(available[n]);available[n].focus();}
  });});
  $('solid-field').addEventListener('change',()=>{
    const kind=$('solid-field').value;
    if(kind==='off')applyVisibility();else setView(kind==='coil'?'plenum':'solid');
  });
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  for(const id of ['xray','shell','streamlines','showlabels','detail','original-flow'])$(id).addEventListener('change',applyVisibility);
  $('environment').addEventListener('change',()=>{if(!$('environment').checked&&view==='campus')setView('overview');else applyVisibility();});

  $('play').addEventListener('click',()=>{playing=!playing;playLabel();});playLabel();
  $('speed').addEventListener('input',e=>{speed=Number(e.target.value);$('speed-label').textContent=`${speed.toFixed(1)}×`;});
  $('density').addEventListener('input',e=>{density=Number(e.target.value);updateTraces();updateParticles();$('density-label').textContent=t('{count} 个示踪粒子',{count:activePathIndices.length*particlesPerPath});});
  $('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await $('app').requestFullscreen();}
    catch{fullscreenFallback=true;$('fullscreen').textContent=t('可用浏览器 F11');}
  });
  $('close-selection').addEventListener('click',()=>{$('selection').hidden=true;});
  const ray=new THREE.Raycaster();let down=[0,0];
  canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];transitioning=null;});
  canvas.addEventListener('pointerup',e=>{
    if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5 || view==='plenum')return;
    const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
    const hits=ray.intersectObjects(pickTargets).filter(h=>view!=='section'||h.point.x<=2.1);
    if(hits.length&&fieldReady&&!aiBusy)showSelection(hits[0].object.userData.rack);
  });
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();if(transientMode)$('transient-start').click();else{playing=!playing;playLabel();}}if(e.key==='Escape')$('selection').hidden=true;});
  controls.listenToKeyEvents(canvas);
  new ResizeObserver(resize).observe(stage);
}

// Language changes update text without rebuilding the scene or resetting playback.
function refreshLanguage(){
  playLabel();updateViewHelp();
  for(const l of labelEntries)l.node.textContent=t(l.text==='水冷换热器 · 等效外观'&&$('solid-field').value==='coil'?'换热器 · 实际计算冷板':l.text);
  if(fullscreenFallback)$('fullscreen').textContent=t('可用浏览器 F11');
  if(lastError)$('loading').textContent=t('展示加载失败：{message}。请通过网站地址打开，并启用浏览器硬件加速 / WebGL 2。',{message:t(lastError.message)});
  if(!manifest||!solidFields)return;
  $('xray').parentElement.title=$('xray').disabled?t('当前显示真实计算板件，外观透视暂不适用'):'';
  updateSolidLegend($('solid-field').value);
  refreshCaseUI();
  const isAI=manifest.source_kind==='ai_prediction';
  $('source-label').textContent=t(isAI?(manifest.execution==='browser-webgpu-fp32'?'AI 稳态预测 · 本机GPU':'AI 稳态预测'):'稳态结果');
  refreshAI();transientPlayer?.refresh();
  $('density-label').textContent=t('{count} 个示踪粒子',{count:activePathIndices.length*particlesPerPath});

  if(selectedRack&&!$('selection').hidden)showSelection(selectedRack);
}
document.addEventListener('mdc:languagechange',refreshLanguage);

function refreshCaseUI(){
  const entry=catalog.cases.find(c=>c.id===manifest.case_id),e=manifest.engineering_controls,m=entry.metrics??{};
  $('case-status').textContent=aiBusy?'':!fieldReady?t('选择参数后点击预测，查看 AI 稳态结果。'):manifest.source_kind!=='ai_prediction'?t('预计算 CFD · 独立色标'):t(manifest.domain_class==='outer_shell'?'AI 稳态预测 · 外推':'AI 稳态预测 · 独立色标');
  const notes={nominal:'基准工况：30 kW，风机倍率全 1，水量 1.44 kg/s。',local_b_hot:'B组两柜：14 kW、风机 0.76；重点比较中间两柜温度。',fan_mismatch:'柜风机 1.24、回风 0.76；实际回风量比名义增加 18.39%。',stress_mid:'整体高负载对照：36 kW，风机 0.88，水量 1.152 kg/s。',stress_extreme:'极端对照：42 kW、高热低冷却；不代表设备允许温度或安全边界。'};
  $('case-note').textContent=t(entry.id==='ai_prediction'?(manifest.domain_class==='outer_shell'?'当前结果为外推预测；测试集未覆盖所有组合及极端角点。':'训练设计范围内的稳态代理预测，不代表任意组合均已验证。'):notes[entry.id]);
  const ai=manifest.source_kind==='ai_prediction';
  for(const [id,plain,estimate] of [['supply','冷侧送风','冷侧送风 · 估算'],['return','热侧回风','热侧回风 · 估算'],['cooling','水侧取热','水侧取热 · 估算'],['airflow','实际回风量','回风量 · 估算'],['water','进水 → 回水','进水 → 回水 · 估算']])$(id).previousElementSibling.textContent=t(ai?estimate:plain);
  $('metric-estimates').hidden=!ai;
  $('metric-estimates').textContent=ai?t('AI 后处理估算：风温按正向体积流量加权；回风量由预测速度积分。水侧由预测冷板温度及原等效换热模型推算，不是模型直接输出或热平衡验收。'):'';
  const total=e.group_heat_kW.reduce((a,b)=>a+b,0);
  const totalLabel=total.toFixed(manifest.source_kind==='ai_prediction'?1:0);
  $('header-power').textContent=totalLabel;document.querySelector('.panel-status').textContent=`${totalLabel} kW`;
  const metric=(id,value,unit)=>{$(id).innerHTML=`${value} <small>${unit}</small>`;};
  const fixed=(value,n)=>Number.isFinite(value)?value.toFixed(n):(ai?t('无正向流'):'—');
  metric('power',total.toFixed(1),'kW');metric('supply',fixed(m.air_supply_C,2),'°C');metric('return',fixed(m.air_return_C,2),'°C');
  metric('cooling',fixed(m.cooling_heat_kW,3),'kW');metric('airflow',fixed(m.return_volume_flow_m3_s,3),'m³/s');
  metric('water',`15.0 → ${fixed(m.water_return_C,1)}`,'°C');metric('water-flow',e.water_mass_flow_kg_s.toFixed(3),'kg/s');
  $('group-power').querySelectorAll('td').forEach((cell,i)=>{cell.textContent=e.group_heat_kW[i].toFixed(manifest.source_kind==='ai_prediction'?1:0);});
  $('rack-fans').querySelectorAll('td').forEach((cell,i)=>{cell.textContent=e.rack_fan_multipliers[i].toFixed(2);});metric('return-fan',e.return_fan_multiplier.toFixed(2),'×');
  metric('air-max',fixed(m.air_max_C,2),'°C');metric('rack-max',fixed(m.rack_max_C,2),'°C');
}
function disposeField(obj){world.remove(obj);obj.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
function installField(data){
    if(JSON.stringify(data.manifest.geometry)!==JSON.stringify(manifest.geometry))throw new Error('Case geometry mismatch');
    const nextSolid=buildSolidFields(data.solidMeta,data.solid);
    // Fully load and verify both fields before replacing any visible state.
    for(const o of [solidFields.coil,solidFields.racks,particleSystem,traces])disposeField(o);
    manifest=data.manifest;packed=data.packed;solidFields=nextSolid;

    world.add(solidFields.coil,solidFields.racks);buildFlow();
    const e=manifest.engineering_controls;
    for(const r of rotors){
      const index=manifest.geometry.rack_x.findIndex(([a,b])=>r.assembly.position.x>=a&&r.assembly.position.x<=b);
      r.rpm=fanRPM(r.kind,r.kind==='return'?e.return_fan_multiplier:e.rack_fan_multipliers[Math.floor(index/2)]);
    }
    applyVisibility();lastParticleTime=NaN;updateParticles();
}
async function start(){
  if(!transientEntry){await Promise.all([prepareVegetation(),prepareLandscape(),prepareCampus()]);campusReady=true;}
  catalog=await loadCatalog();
  const data=protectedModels?await loadCase(catalog,'nominal'):await loadEmptyScene(catalog);
  if(protectedModels){nominalData=data;fieldReady=true;}
  manifest=data.manifest;packed=data.packed;
  solidFields=buildSolidFields(data.solidMeta,data.solid);
  for(const entry of catalog.cases){const option=document.createElement('option');option.value=entry.id;$('ai-preset').appendChild(option);}
  const custom=document.createElement('option');custom.value='custom';custom.disabled=true;$('ai-preset').appendChild(custom);
  $('ai-preset').value=catalog.default_case;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.localClippingEnabled=true;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  // Static campus shadows only. Scientific transparent cutaways never cast masks.
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  world=new THREE.Scene();
  daylight=createDaylight(renderer,world,{deferEnvironment:transientEntry});
  camera=new THREE.PerspectiveCamera(40,1,.03,2500);camera.up.set(0,0,1);
  camera.position.set(...views.campus.pos);
  controls=new OrbitControls(camera,canvas);controls.target.set(...views.campus.target);
  controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=.55;controls.maxDistance=110;
  buildRoom();
  for(const [n,g] of Object.entries(groups))if(n!=='environment')g.traverse(o=>{o.castShadow=false;o.receiveShadow=false;});
  // Only the opaque render shell casts onto the campus. Transparent scientific
  // equipment never casts dark masks over particles or temperature surfaces.
  groups.shell.traverse(o=>{if(o.isMesh&&o.material.isMeshStandardMaterial){o.castShadow=true;o.receiveShadow=true;}});
  world.add(solidFields.coil,solidFields.racks);
  buildFlow();transientPlayer=createTransientPlayer(world,()=>{refreshAI();applyVisibility();});applyVisibility();bindControls();resize();
  const initialPose=campusPose();camera.position.fromArray(initialPose.pos);controls.target.fromArray(initialPose.target);
  refreshLanguage();
  // Read-only diagnostics for repeatable local browser acceptance checks.
  window.__mdcDiagnostics=()=>({ready:true,transient:transientPlayer.diagnostics(),sourceKind:manifest.source_kind??'cfd_reference',execution:manifest.execution??null,localAI,aiLastError,predictionId:manifest.prediction_id,domainClass:manifest.domain_class,aiReady,aiBusy,fieldReady,aiStage,preset:$('ai-preset').value,caseId:manifest.case_id,caseLoading,caseError,standardControls:manifest.standard_controls,engineeringControls:manifest.engineering_controls,allFanRPM:rotors.map(r=>r.rpm),geometryCells:manifest.geometry.cells,visibleFlowWindows:flowVisibility.reduce((n,m)=>n+m[traceMode].length,0),language:getLanguage(),cameraTransitioning:transitioning!==null,cameraPosition:camera.position.toArray(),cameraTarget:controls.target.toArray(),cameraNear:camera.near,view,playing,elapsed,density,speed,
    rotors:rotors.length,fanPhase:rotors[0]?.phase,fanRPM:rotors[0]?.rpm,fanSlow:$('fanslow').checked,
    detailed:groups.coilDetail.visible,environment:groups.environment.visible,
    campus:groups.environment.userData.campus===true,office:groups.environment.getObjectByName('glodon-office')?.userData,fogEnabled:world.fog!==null,
    containerExterior:groups.shell.visible,containerClosed:groups.shell.visible&&groups.shell.userData.closed.visible,
    vegetation:{...vegetationStats},
    landscape:{...landscapeStats},
    daylight:daylight.sky.visible,outdoorEnvironment:world.environment!==null,
    groundGrids:world.children.filter(o=>o.isGridHelper).length,
    solidMode:$('solid-field').value,solidCoil:solidFields.coil.visible,solidRacks:solidFields.racks.visible,
    solidRanges:solidFields.ranges,solidCells:solidFields.meta.regions.reduce((s,r)=>s+r.cells,0),
    fluidVisible:particleSystem.visible,activePanel:document.querySelector('[data-panel][aria-selected=true]').dataset.panel,
    streamlinesVisible:traces.visible,traceVertices:traces.geometry.getAttribute('position').count,expectedTraceVertices:activePathIndices.reduce((sum,i)=>sum+flowVisibility[i][traceMode].reduce((n,[a,b])=>n+2*(b-a),0),0),displayedPaths:activePathIndices.length,particlesPerPath,
    paths:manifest.paths.length,drawVertices:particleSystem.geometry.drawRange.count,
    renderCalls:renderer.info.render.calls,gpuGeometries:renderer.info.memory.geometries,temperatureRange:manifest.display_temperature_range_C,
    rackScreenPositions:pickTargets.map(p=>{const v=p.position.clone().project(camera),r=canvas.getBoundingClientRect();return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];}),
    particleProbe:Array.from(particleSystem.geometry.attributes.position.array.slice(0,18))});
  $('loading').hidden=true;$('loading').style.display='none';
  frameId=requestAnimationFrame(animate);
  if(new URLSearchParams(location.search).get('mode')==='transient')$('mode-transient').click();else if(localAI)document.querySelector('[data-view=solid]').click();
}
function fail(error){
  lastError=error;console.error(error);cancelAnimationFrame(frameId);
  $('loading').hidden=false;$('loading').style.display='flex';$('loading').textContent=t('展示加载失败：{message}。请通过网站地址打开，并启用浏览器硬件加速 / WebGL 2。',{message:t(error.message)});
}
window.addEventListener('error',e=>fail(e.error||new Error(e.message)));
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('3D 绘图上下文中断，请刷新页面'));});
start().catch(fail);

function fillPresetControls(entry){
  const e=entry.engineering_controls;
  $('ai-preset').value=entry.id;
  [...e.group_heat_kW,...e.rack_fan_multipliers,e.return_fan_multiplier,e.water_mass_flow_kg_s].forEach((value,i)=>{$('ai-u'+i).value=Number(value.toFixed(12));});
}
function refreshAI(){
  refreshAccess();
  const locked=protectedModels&&!modelUnlocked();
  $('ai-local-note').hidden=!localAI;
  $('ai-local-note').textContent=t('本机 GPU 实验版 · 首次下载模型；推理和流线均在你的设备计算。');
  const incompatible=localAI&&Boolean(aiCompatibilityIssue);
  $('ai-compat-warning').hidden=!incompatible;
  $('ai-compat-reason').textContent=t(aiCompatibilityIssue);
  $('ai-unavailable').hidden=!incompatible||transientMode||fieldReady;
  $('ai-unavailable-reason').textContent=t(aiCompatibilityIssue);
  $('ai-predict').disabled=!aiReady||aiBusy||locked;
  $('ai-predict').hidden=aiBusy;
  $('ai-progress').hidden=!aiBusy;
  $('ai-preset').disabled=aiBusy||locked;
  $('ai-form').setAttribute('aria-busy',String(aiBusy));
  $('app').classList.toggle('field-hidden',transientMode?!transientPlayer?.ready:!fieldReady||aiBusy);
  $('mode-ai').disabled=aiBusy;$('mode-transient').disabled=aiBusy;
  for(const option of $('ai-preset').options){
    const entry=catalog.cases.find(c=>c.id===option.value);
    option.textContent=entry?(getLanguage()==='zh'?entry.title_zh:entry.title_en):t('自定义参数');
  }
  for(let i=0;i<8;i++)$('ai-u'+i).disabled=aiBusy||locked;
  refreshDials();
  let domain='invalid';
  try{domain=controlDomain(controlsFromEngineering(Array.from({length:8},(_,i)=>$('ai-u'+i).valueAsNumber)));}catch{}
  $('ai-domain').dataset.domain=domain;
  $('ai-domain').textContent=t(domain==='inner_box'?'当前参数：训练范围内':domain==='outer_shell'?'当前参数：外推。超出训练范围的参数越多、偏离幅度越大，预测误差可能越大。':'参数超出允许范围或尚未填写完整。');
  $('ai-predict-label').textContent=t('预测稳态流场');
  const phase=t(aiStage==='download'?'下载本机推理模型…':aiStage==='compile'?'准备 GPU 推理…':aiStage==='paths'?'在本机生成流线…':aiStage==='loading'?'读取预测结果…':aiStage==='rendering'?'准备三维展示…':'AI 推理与流线生成…');
  $('ai-progress').textContent=phase;
  $('ai-progress').setAttribute('aria-label',phase);
  $('ai-status').textContent=t(aiMessage);
  $('ai-status').dataset.error=String(aiMessageError);
  if(transientMode)transientPlayer?.refresh();
  for(let i=0;i<6;i++)$('ai-u'+i).setAttribute('aria-label',`${t(i<3?'热功率':'风机倍率')} ${'ABC'[i%3]}`);
}
function bindAI(){
  mountModelAccess($('ai-controls'));
  document.addEventListener('mdc:model-access',()=>{
    if(protectedModels&&!modelUnlocked()&&nominalData){
      ++caseRequest;caseAbort?.abort();aiBusy=false;aiStage='idle';caseLoading=false;
      installField(nominalData);fieldReady=true;fillPresetControls(catalog.cases.find(c=>c.id==='nominal'));
      aiMessage='当前展示名义 CFD 工况；解锁后可在本机运行 AI 预测。';
      refreshLanguage();
    }
    refreshAI();
  });
  refreshDials=bindDials($('ai-dials'));
  $('ai-preset').addEventListener('change',()=>{
    if(aiBusy)return;
    const entry=catalog.cases.find(c=>c.id===$('ai-preset').value);
    if(!entry||entry.id==='ai_prediction')return;
    fillPresetControls(entry);
    aiMessage='预设已填入，点击预测后更新画面。';aiMessageError=false;refreshAI();
  });
  // Keep the active progress visible; reopening after failure can retry service discovery.
  $('ai-controls').querySelector('summary').addEventListener('click',event=>{if(aiBusy)event.preventDefault();});
  async function probe(){
    if(localAI){
      try{
        const status=await browserAIStatus();aiReady=status.ready;
        aiCompatibilityIssue=aiReady?'':status.reason==='webgpu-buffer-limit'?'此设备的 GPU 缓冲区上限不足，无法运行当前 AI 模型。':'当前浏览器或设备未提供可用的 WebGPU，无法运行本地 AI 推理。';
      }catch{aiReady=false;aiCompatibilityIssue='当前浏览器或设备未提供可用的 WebGPU，无法运行本地 AI 推理。';}
      aiMessage=protectedModels&&!modelUnlocked()?'当前展示名义 CFD 工况；解锁后可在本机运行 AI 预测。':aiReady?'本机 GPU 已就绪；首次推理需要准备模型。':'当前设备无法预测稳态流场；可切换到瞬态演示。';aiMessageError=false;
      refreshAI();return;
    }
    try{
      const response=await fetch('./api/ai/status');
      if(!response.ok)throw new Error('unavailable');
      const status=await response.json();
      aiReady=status.ready&&status.model_id===AI_MODEL&&status.geometry_id===AI_GEOMETRY&&JSON.stringify(status.control_range)==='[0.1,0.9]';
      if(!aiReady)throw new Error('identity');
      if(!aiBusy&&aiMessage==='连接本地 AI 服务后可预测。'){aiMessage='AI 服务已就绪 · 可在测试集外框范围内调参。';aiMessageError=false;}
    }catch{aiReady=false;aiMessage='连接本地 AI 服务后可预测。';}
    refreshAI();
  }
  $('ai-controls').addEventListener('toggle',()=>{if($('ai-controls').open)probe();});
  probe();
  $('ai-form').addEventListener('input',event=>{
    if(event.target.id==='ai-preset')return;
    if(!aiBusy){$('ai-preset').value='custom';aiMessage='参数已修改，点击预测后更新画面。';aiMessageError=false;refreshAI();}
  });
  $('ai-form').addEventListener('submit',async event=>{
    event.preventDefault();if(aiBusy||!aiReady||(protectedModels&&!modelUnlocked()))return;
    let values;
    try{values=controlsFromEngineering(Array.from({length:8},(_,i)=>$('ai-u'+i).valueAsNumber));}
    catch{aiMessage='请输入允许范围内的八个参数。';aiMessageError=true;refreshAI();return;}
    const request=++caseRequest;caseAbort?.abort();caseAbort=new AbortController();
    aiBusy=true;aiLastError=null;aiStage='inference';caseLoading=true;caseError=false;
    aiMessage='完成后将显示新的流场与温度。';aiMessageError=false;
    $('selection').hidden=true;$('ai-controls').open=true;refreshAI();applyVisibility();refreshCaseUI();
    $('ai-progress').scrollIntoView({block:'nearest',behavior:'instant'});
    try{
      const prediction=await (localAI?predictBrowserCase:predictCase)(catalog,values,String(request),caseAbort.signal,stage=>{if(request===caseRequest){aiStage=stage;refreshAI();}});
      if(request!==caseRequest)return;
      aiStage='rendering';refreshAI();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(request!==caseRequest)return;
      installField(prediction.data);
      catalog.cases=catalog.cases.filter(c=>c.id!=='ai_prediction');catalog.cases.push(prediction.entry);
      fieldReady=true;
      aiMessage='AI 结果已更新；粒子沿预测速度场运动。';
    }catch(error){
      if(request!==caseRequest)return;
      aiLastError={message:error.message,stage:aiStage};
      aiMessage=localAI?(fieldReady?'本机预测失败，已保留上一结果；请重试。':'本机预测失败，请重试。'):error.message==='busy'?'服务正在处理上一请求，请稍后重试。':(fieldReady?'预测失败，已恢复上一完整结果；可重新预测。':'预测失败，请重试；尚未显示预测结果。');aiMessageError=true;caseError=true;
    }finally{
      if(request===caseRequest){
        // Prepare and render the complete replacement before exposing result UI again.
        aiBusy=false;aiStage='idle';caseLoading=false;applyVisibility();updateParticles();
        renderer.render(world,camera);refreshLanguage();
      }
    }
  });
}
