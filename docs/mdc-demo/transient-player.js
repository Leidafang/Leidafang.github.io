// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import * as THREE from 'three';
import {getLanguage} from './i18n.js';
import {temperatureRGB} from './flow-math.js';
import {PARTICLE_SAMPLES,TRAIL_STEP_S,particleGeometry,particleMaterial,particleColors,particleVertex,historyVisible} from './particle-style.js';
import {createSteadyReferenceFlow} from './steady-reference-flow.js';
import {solidRGB} from './solid-fields.js';
const $=id=>document.getElementById(id);
const text=(zh,en)=>getLanguage()==='zh'?zh:en;
const palette=`vec3 ramp(float t, bool solid){float x=clamp(t,0.,1.);if(solid){vec3 a=vec3(.12,.08,.31),b=vec3(.39,.16,.55),c=vec3(.74,.26,.45),d=vec3(.96,.52,.29),e=vec3(1.,.91,.58);return x<.25?mix(a,b,x*4.):x<.5?mix(b,c,x*4.-1.):x<.75?mix(c,d,x*4.-2.):mix(d,e,x*4.-3.);}vec3 a=vec3(24.,80.,255.)/255.,b=vec3(0.,169.,255.)/255.,c=vec3(32.,221.,242.)/255.,d=vec3(255.,181.,32.)/255.,e=vec3(255.,76.,12.)/255.,f=vec3(255.,24.,66.)/255.;return x<.25?mix(a,b,x/.25):x<.46?mix(b,c,(x-.25)/.21):x<.54?mix(c,d,(x-.46)/.08):x<.75?mix(d,e,(x-.54)/.21):mix(e,f,(x-.75)/.25);}`;
export function createTransientPlayer(world,onChange){
  const group=new THREE.Group();world.add(group);group.visible=false;
  let active=false,ready=false,loading=false,error=false,meta,positions,solids,slices,valid,target,phase='initial',time=0,playing=false,speed=1,view='solid',kind='racks',last=-1;
  let particles,trails,sliceMesh,solidTexture,sliceTexture;const meshes=[];
  let displayCount=1000,cpuUpdateMs=0,color;
  let reference,referenceFlow,referenceSlice,referenceLoading=false,referenceError=false,referenceRequest=0,referencePromise;
  let initial,initialFlow,initialSlice,initialSolids;
  const steady=()=>phase==='initial'||phase==='target';
  const currentFlow=()=>phase==='initial'?initialFlow:referenceFlow;
  const endTime=()=>meta?.end_s??30;
  const ranges=()=>meta.sequence_ranges??meta.ranges;
  const root='./transient/load/';
  async function asset(spec,byte=false,json=false){const r=await fetch(root+spec.name);if(!r.ok)throw Error('asset');const b=await r.arrayBuffer();const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');if(sha!==spec.sha256)throw Error('integrity');return json?JSON.parse(new TextDecoder().decode(b)):byte?new Uint8Array(b):new Float32Array(b);}
  function texture(n){const t=new THREE.DataTexture(new Float32Array(n),n,1,THREE.RedFormat,THREE.FloatType);t.needsUpdate=true;return t;}
  function surface(pos,ids,tex,range,solid){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('cell',new THREE.BufferAttribute(ids,1));
    const mat=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:!solid,depthWrite:solid,uniforms:{field:{value:tex},width:{value:tex.image.width},range:{value:new THREE.Vector2(...range)},cutX:{value:100},cutZ:{value:100}},vertexShader:`attribute float cell;uniform sampler2D field;uniform float width;varying float temp;varying vec3 p;void main(){p=position;temp=texture2D(field,vec2((cell+.5)/width,.5)).r;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform vec2 range;uniform float cutX,cutZ;varying float temp;varying vec3 p;${palette}void main(){if(p.x>cutX||p.z>cutZ)discard;gl_FragColor=vec4(ramp((temp-range.x)/(range.y-range.x),${solid?'true':'false'}),${solid?'1.':'.72'});}`});
    const mesh=new THREE.Mesh(g,mat);group.add(mesh);return mesh;
  }
  async function load(){
    if(ready||loading)return;loading=true;error=false;refresh();onChange();
    try{
      const r=await fetch(root+'manifest.json');if(!r.ok)throw Error('manifest');meta=await r.json();if(meta.schema!=='mdc-transient-preview-v1'||!Number.isInteger(meta.frames)||meta.frames<2||meta.frames>2401||meta.dt!==.05||Math.abs((meta.frames-1)*meta.dt-meta.end_s)>1e-8||meta.solid_cells!==6360)throw Error('schema');
      if(!Number.isInteger(meta.particles)||meta.particles<1||meta.particles>10000)throw Error('particle capacity');
      displayCount=Math.min(meta.particles,meta.selection?.default_count??1000);
      const [geo,sg,tgt]=await Promise.all([asset(meta.geometry_file),asset(meta.slice_geometry_file),asset(meta.target_file)]);target=tgt;
      positions=new Float32Array(meta.frames*meta.particles*4);solids=new Float32Array(meta.frames*meta.solid_cells);slices=new Float32Array(meta.frames*meta.slice_cells);valid=new Uint8Array(meta.frames*meta.particles);
      // Selected prototype is compact enough to preload in bounded 5 s blocks.
      let loadedFrames=0;
      await Promise.all(meta.chunks.map(async c=>{const arrays=await Promise.all([asset(c.files.particles),asset(c.files.solid),asset(c.files.slice),asset(c.files.valid,true)]);[positions,solids,slices,valid].forEach((a,i)=>a.set(arrays[i],c.first*[meta.particles*4,meta.solid_cells,meta.slice_cells,meta.particles][i]));loadedFrames+=c.frames;$('transient-message').textContent=text('准备瞬态数据','Preparing transient data')+` · ${Math.round(loadedFrames/meta.frames*100)}%`;}));
      if(!positions.every(Number.isFinite)||!solids.every(Number.isFinite)||!slices.every(Number.isFinite))throw Error('nonfinite');
      await Promise.all([loadInitial(),loadReference()]);
      solidTexture=texture(meta.solid_cells);sliceTexture=texture(meta.slice_cells);
      for(const reg of meta.regions){const pos=new Float32Array(reg.count*3),ids=new Float32Array(reg.count);for(let i=0;i<reg.count;i++){const k=(reg.offset+i)*4;pos.set(geo.subarray(k,k+3),i*3);ids[i]=geo[k+3];}const m=surface(pos,ids,solidTexture,meta.ranges[reg.name==='coil'?'coil':'racks'],true);m.userData.region=reg.name;meshes.push(m);}
      const ids=new Float32Array(sg.length/3);for(let i=0;i<ids.length;i++)ids[i]=Math.floor(i/6);sliceMesh=surface(sg,ids,sliceTexture,meta.ranges.air,false);
      color=particleColors(ranges().air);particles=new THREE.Points(particleGeometry(meta.particles),particleMaterial());trails=new THREE.Points(particleGeometry(meta.particles*(PARTICLE_SAMPLES-1)),particleMaterial());for(const points of [trails,particles]){points.frustumCulled=false;points.renderOrder=3;}group.add(trails,particles);ready=true;playing=active&&phase==='initial';render(true);
    }catch(e){error=true;console.warn('Transient loading failed',e.message);}finally{loading=false;refresh();onChange();}
  }
  async function readEndpoint(spec,id,controls){
    const info=await asset(spec,false,true);
    if(info.schema!=='mdc-target-steady-v1'||info.case_id!==id||info.source_kind!=='cfd_steady_reference'||JSON.stringify(info.engineering_controls)!==JSON.stringify(controls))throw Error('Steady identity');
    const [paths,slice,solid]=await Promise.all([asset(info.path_file),asset(info.slice_file),info.solid_file?asset(info.solid_file):Promise.resolve(target)]);
    if(slice.length!==meta.slice_cells||solid.length!==meta.solid_cells||![paths,slice,solid].every(a=>a.every(Number.isFinite))||!info.paths.length)throw Error('Steady field');
    let offset=0;for(const p of info.paths){if(p.offset!==offset||p.count<2||!(p.duration_s>0))throw Error('Steady path');offset+=p.count;}if(offset*5!==paths.length)throw Error('Steady size');
    return {info,slice,solid,flow:createSteadyReferenceFlow(group,{...info,ranges:ranges()},paths)};
  }
  async function loadInitial(){
    if(initialFlow)return;
    const r=await readEndpoint(meta.initial_flow_file,meta.p0,meta.controls_before);
    initial=r.info;initialSlice=r.slice;initialSolids=r.solid;initialFlow=r.flow;
  }
  function loadReference(){
    if(!referencePromise)referencePromise=readEndpoint(meta.target_flow_file,meta.p1,meta.controls_after).then(r=>{
      reference=r.info;referenceSlice=r.slice;referenceFlow=r.flow;
    }).catch(e=>{referencePromise=null;throw e;});
    return referencePromise;
  }
  function showSteady(next){
    if(!ready||phase===next)return;
    phase=next;time=next==='initial'?0:endTime();playing=true;change();
  }
  function cancelReference(){referenceRequest++;referenceLoading=false;referenceError=false;}
  function drawLegend(canvas,min,mid,max,range,solid=false){const c=$(canvas).getContext('2d');for(let i=0;i<300;i++){c.fillStyle=`rgb(${(solid?solidRGB:temperatureRGB)(range[0]+(range[1]-range[0])*i/299,...range).map(x=>Math.round(x*255)).join(',')})`;c.fillRect(i,0,1,12);}$(min).textContent=range[0].toFixed(1);$(mid).textContent=((range[0]+range[1])/2).toFixed(1);$(max).textContent=range[1].toFixed(1);}
  function sampleParticle(frame,n,out){const f=Math.min(meta.frames-1,Math.max(0,frame)),a=Math.floor(f),b=Math.min(a+1,meta.frames-1),mix=valid[b*meta.particles+n]?f-a:0,base=(a*meta.particles+n)*4,next=(b*meta.particles+n)*4;for(let k=0;k<4;k++)out[k]=positions[base+k]*(1-mix)+positions[next+k]*mix;}
  const p=new Float32Array(4);
  function render(force=false){
    if(!ready||!active)return;const f=time/meta.dt,a=Math.min(meta.frames-1,Math.floor(f)),b=Math.min(a+1,meta.frames-1),mix=f-a;
    if(force||last!==time){
      const started=performance.now();
      const data=solidTexture.image.data;for(let i=0;i<data.length;i++)data[i]=phase==='target'?target[i]:phase==='initial'?initialSolids[i]:solids[a*data.length+i]*(1-mix)+solids[b*data.length+i]*mix;solidTexture.needsUpdate=true;
      const sd=sliceTexture.image.data;for(let i=0;i<sd.length;i++)sd[i]=phase==='target'?referenceSlice[i]:phase==='initial'?initialSlice[i]:slices[a*sd.length+i]*(1-mix)+slices[b*sd.length+i]*mix;sliceTexture.needsUpdate=true;
      const pg=particles.geometry.attributes,tg=trails.geometry.attributes;let at=0;
      for(let n=0;n<displayCount;n++){
        sampleParticle(f,n,p);particleVertex(pg,n,p,color(p[3]),0);
        for(let k=1;k<PARTICLE_SAMPLES;k++){
          const older=f-k*TRAIL_STEP_S/meta.dt;sampleParticle(older,n,p);
          const opacity=historyVisible(valid,meta.particles,n,older,f)?1:0;
          particleVertex(tg,at++,p,color(p[3]),k,opacity);
        }
      }
      particles.geometry.setDrawRange(0,displayCount);trails.geometry.setDrawRange(0,at);
      for(const [attrs,n] of [[pg,displayCount],[tg,at]])Object.values(attrs).forEach(x=>{x.clearUpdateRanges();x.addUpdateRange(0,n*x.itemSize);x.needsUpdate=true;});last=time;
      $('transient-time').value=String(time);$('transient-seconds').textContent=phase==='target'?'P1':phase==='initial'?'P0':`${time.toFixed(2)} / ${endTime().toFixed(2)} s`;
      const stat=(s)=>s[a]*(1-mix)+s[b]*mix;
      $('transient-air').textContent=(phase==='target'?reference.ranges.air[1]:phase==='initial'?initial.ranges.air[1]:stat(meta.stats.air_max)).toFixed(1)+' °C';$('transient-rack').textContent=(phase==='target'?Math.max(...target.subarray(0,3840)):phase==='initial'?initial.ranges.racks[1]:stat(meta.stats.rack_max)).toFixed(1)+' °C';drawChart();cpuUpdateMs=performance.now()-started;
    }
  }
  function drawChart(){const canvas=$('transient-chart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const means=meta.stats.solid_means,low=Math.floor(Math.min(...means.map(r=>Math.min(...r.slice(0,6))))/5)*5,high=Math.ceil(Math.max(...means.map(r=>Math.max(...r.slice(0,6))))/5)*5;const yy=v=>h-24-(v-low)/(high-low)*(h-43);ctx.font='11px sans-serif';ctx.strokeStyle='#dae6ed';ctx.fillStyle='#5c7384';for(const v of [low,(low+high)/2,high]){const y=yy(v);ctx.beginPath();ctx.moveTo(28,y);ctx.lineTo(w-6,y);ctx.stroke();ctx.fillText(v+'°',0,y+4);}['#007eb9','#00a6c2','#65a844','#96b946','#d58c25','#d34c3a'].forEach((color,j)=>{ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.beginPath();for(let i=0;i<means.length;i++){const x=28+i/(meta.frames-1)*(w-34),y=yy(means[i][j]);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();});ctx.fillStyle='#5c7384';ctx.fillText('0 s',28,h-4);ctx.fillText(`${endTime().toFixed(0)} s`,w-31,h-4);if(phase!=='target'){const x=28+time/endTime()*(w-34);ctx.strokeStyle='#173e59';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,8);ctx.lineTo(x,h-24);ctx.stroke();ctx.setLineDash([]);}}
  function refresh(){
    $('transient-time').max=String(endTime());
    document.querySelectorAll('.transient-time-ticks span').forEach((n,i)=>n.textContent=`${(endTime()*i/3).toFixed(0)} s`);
    $('transient-range-caption').textContent=text(`低热容增载演示 · 0–${endTime().toFixed(0)}秒`,`Low-capacity load increase · 0–${endTime().toFixed(0)} s`);
    const density=$('transient-density');density.disabled=!ready;density.max=String(meta?.particles??4000);density.min=String(Math.min(500,meta?.particles??500));density.value=String(displayCount);$('transient-density-value').textContent=String(displayCount);$('transient-density-max').textContent=density.max;
    $('transient-density-note').textContent=steady()?text('粒子沿当前稳态流线运动；数量只改变粒子疏密，流线数量保持不变。','Particles follow the current steady streamlines; particle count does not change line density.'):meta?.selection?text(`已预筛选：连续 ${meta.selection.continuous_seconds} 秒低于 ${meta.selection.threshold_m_s} m/s 的轨迹不展示。粒子疏密不代表空气浓度。`,`Preselected: tracks below ${meta.selection.threshold_m_s} m/s for ${meta.selection.continuous_seconds} consecutive seconds are excluded. Density does not represent air concentration.`):text('粒子数量仅控制展示密度。','Particle count controls display density only.');
    $('transient-message').textContent=referenceLoading?text('正在读取目标稳态流场…','Loading target steady field…'):referenceError?text('目标稳态读取失败，点击目标稳态参考重试。','Target loading failed; select the reference to retry.'):error?text('数据读取失败，点击重试。','Loading failed. Retry.'):loading?text('正在准备瞬态数据…','Preparing transient data…'):phase==='initial'?text('P0 初始稳态 · 点击按钮开始工况切换','P0 steady state · start the transition when ready'):phase==='target'?text('当前为 P1 稳态 · 可重新播放工况切换','P1 steady state · replay the transition at any time'):text('真实 CFD 瞬态 · 播放结束后自动进入 P1 稳态','CFD transient · automatically continues with the P1 steady state');
    $('transient-start').disabled=loading||!ready&&!error;$('transient-start').textContent=error?text('重新加载','Retry'):phase==='initial'?text('开始工况切换','Start transition'):phase==='target'?text('重新播放工况切换','Replay transition'):playing?text('暂停切换','Pause transition'):time>=endTime()?text('重新播放工况切换','Replay transition'):text('继续播放','Resume');
    $('transient-animation').hidden=!steady()||!ready;$('transient-animation').textContent=playing?text('暂停粒子动画','Pause particles'):text('播放粒子动画','Play particles');
    for(const [id,value,zh,en] of [['transient-initial','initial','P0 初始稳态','P0 Initial steady'],['transient-target','target','P1 目标稳态','P1 Target steady']]){
      $(id).disabled=!ready;$(id).textContent=text(zh,en);$(id).setAttribute('aria-pressed',String(phase===value));
    }
    $('transient-endpoints').setAttribute('aria-label',text('查看两端稳态','Inspect steady endpoints'));
    $('transient-final').disabled=!ready;$('transient-final').textContent=text(`查看 ${endTime().toFixed(0)} 秒瞬态末帧`,`View final transient frame (${endTime().toFixed(0)} s)`);
    $('transient-final').setAttribute('aria-pressed',String(phase==='transient'&&time>=endTime()));
    $('transient-reset').disabled=!ready;$('transient-time').disabled=!ready;
    $('transient-phase').textContent=text(phase==='target'?'P1 · 目标稳态参考':phase==='initial'?'P0 · 初始稳态':time>=endTime()?`${endTime().toFixed(0)} s · 当前数据结束`:'工况切换中',phase==='target'?'P1 · steady reference':phase==='initial'?'P0 · initial steady state':time>=endTime()?`${endTime().toFixed(0)} s · end of available data`:'Transition');
    if(!active)return;flowLabels();
    $('source-label').textContent=phase==='target'?text('CFD稳态 · P1','CFD steady · P1'):phase==='initial'?text('CFD稳态 · P0','CFD steady · P0'):text('CFD瞬态 · 低热容演示','CFD transient · low heat capacity');
    if(meta){const c=phase==='initial'?meta.controls_before:meta.controls_after;const pow=c.total_heat_kW.toFixed(1);$('header-power').textContent=pow;document.querySelector('.panel-status').textContent=pow+' kW';
      $('transient-controls').innerHTML=`<thead><tr><th>${text('参数','Control')}</th><th>P0</th><th>P1</th></tr></thead><tbody>`+[[text('总热功率 kW','Total heat kW'),'total_heat_kW'],[text('回风倍率 ×','Return fan ×'),'return_fan_multiplier'],[text('水流量 kg/s','Water kg/s'),'water_mass_flow_kg_s']].map(([label,k])=>`<tr><th>${label}</th><td>${meta.controls_before[k].toFixed(2)}</td><td>${meta.controls_after[k].toFixed(2)}</td></tr>`).join('')+['A','B','C'].map((g,i)=>`<tr><th>${g} · ${text('热功率 kW','Heat kW')}</th><td>${meta.controls_before.group_heat_kW[i].toFixed(2)}</td><td>${meta.controls_after.group_heat_kW[i].toFixed(2)}</td></tr><tr><th>${g} · ${text('风机倍率 ×','Fan ×')}</th><td>${meta.controls_before.rack_fan_multipliers[i].toFixed(2)}</td><td>${meta.controls_after.rack_fan_multipliers[i].toFixed(2)}</td></tr>`).join('')+'</tbody>';
      drawLegend('colorbar','tmin','tmid','tmax',ranges().air);if(kind!=='off'){drawLegend('solid-colorbar','solid-min','solid-mid','solid-max',ranges()[kind],true);}
    }
    $('case-status').textContent='';$('view-help').textContent=steady()?text('当前稳态速度场的流线与温度粒子；可旋转查看各区域。','Streamlines and temperature particles from the current steady field.'):text('温度随时间更新；粒子短尾迹表示时变速度场中的运动。','Temperature evolves over time; short trails follow the time-varying velocity field.');
    $('solid-note').textContent=steady()?text('显示实际计算板件温度；P0、瞬态与P1共用固定色标。','Actual plate temperatures; fixed scales across P0, transient and P1.'):text('显示实际计算板件温度；整段播放使用固定色标。','Actual CFD plate temperatures; fixed scales throughout playback.');
  }
  function flowLabels(){
    document.querySelector('.transient-flow .panel-help').textContent=steady()?text('粒子沿当前稳态速度场运动，以当地空气温度着色。','Particles follow the current steady velocity field, colored by local air temperature.'):text('粒子按时变速度场运动，零速处保留；短尾迹显示最近约0.2秒的运动。','Particles follow the time-varying field and remain at zero speed. Trails show the last 0.2 s.');
    $('transient-particles').nextElementSibling.textContent=steady()?text('显示稳态粒子','Steady particles'):text('显示瞬态粒子','Transient particles');
    $('transient-trails').nextElementSibling.textContent=steady()?text('显示流线','Streamlines'):text('显示短尾迹','Short trails');
    for(const node of [document.querySelector('.transient-chart-title'),$('transient-chart'),document.querySelector('.transient-rack-key')])node.hidden=steady();
  }
  function visibility(options={}){view=options.view??view;kind=options.kind??kind;group.visible=active&&ready;if(!ready||!active)return;meshes.forEach(m=>{m.visible=(m.userData.region==='coil'?'coil':'racks')===kind;m.material.uniforms.cutX.value=view==='section'?2.1:100;m.material.uniforms.range.value.set(...ranges()[m.userData.region==='coil'?'coil':'racks']);});sliceMesh.material.uniforms.range.value.set(...ranges().air);sliceMesh.visible=$('transient-slice').checked&&view!=='plenum';for(const o of [particles,trails,sliceMesh]){o.material.uniforms.cutX.value=view==='section'?2.1001:100;o.material.uniforms.cutZ.value=view==='plenum'?-.035:100;}particles.visible=!steady()&&$('transient-particles').checked;trails.visible=particles.visible&&$('transient-trails').checked;if(initialFlow)initialFlow.group.visible=phase==='initial';if(referenceFlow)referenceFlow.group.visible=phase==='target';if(steady())currentFlow().configure(view,displayCount,$('transient-particles').checked,$('transient-trails').checked);document.querySelector('.legend:not(.solid-legend)').hidden=false;refresh();render(true);}
  function change(){last=-1;visibility();onChange();}
  $('transient-start').addEventListener('click',()=>{if(!ready){load();return;}cancelReference();if(steady()||time>=endTime()){time=0;phase='transient';playing=true;}else playing=!playing;change();});
  $('transient-animation').addEventListener('click',()=>{if(!ready||!steady())return;playing=!playing;refresh();});
  $('transient-reset').addEventListener('click',()=>{cancelReference();time=0;playing=true;phase='initial';change();});
  $('transient-initial').addEventListener('click',()=>showSteady('initial'));
  $('transient-target').addEventListener('click',()=>showSteady('target'));
  $('transient-final').addEventListener('click',()=>{if(!ready)return;phase='transient';time=endTime();playing=false;change();});
  $('transient-time').addEventListener('input',e=>{cancelReference();time=Number(e.target.value);playing=false;phase='transient';change();});
  $('transient-speed').addEventListener('change',e=>{speed=Number(e.target.value);});
  $('transient-density').addEventListener('input',e=>{if(!ready)return;const value=Number(e.target.value);if(!Number.isFinite(value))return;displayCount=Math.max(Math.min(500,meta.particles),Math.min(meta.particles,Math.round(value)));$('transient-density-value').textContent=String(displayCount);if(steady())currentFlow().configure(view,displayCount,$('transient-particles').checked,$('transient-trails').checked);render(true);});
  for(const id of ['transient-slice','transient-particles','transient-trails'])$(id).addEventListener('change',()=>visibility());
  document.addEventListener('mdc:languagechange',()=>{refresh();render(true);});
  return {get active(){return active;},get ready(){return ready;},get time(){return steady()?currentFlow()?.clock??0:time;},get playing(){return playing;},get speed(){return speed;},get engineering(){return meta?(phase==='initial'?meta.controls_before:meta.controls_after):null;},setActive(value){cancelReference();active=value;playing=value&&ready&&steady();group.visible=value&&ready;if(value&&!ready)load();visibility();},visibility,refresh,
    tick(dt){if(!active||!ready)return;if(playing){if(steady()){currentFlow().update(dt*speed);return;}time=Math.min(endTime(),time+dt*speed);if(time>=endTime()){phase='target';playing=true;change();return;}render();}},
    diagnostics:()=>({active,ready,loading,error,time,phase,playing,referenceLoading,referenceError,reference:referenceFlow?.diagnostics(),initial:initialFlow?.diagnostics(),particles:displayCount,particleCapacity:meta?.particles,particleStyle:'soft-temperature-v1',trailSeconds:(PARTICLE_SAMPLES-1)*TRAIL_STEP_S,particleDrawCount:particles?.geometry.drawRange.count,trailDrawCount:trails?.geometry.drawRange.count,cpuUpdateMs,selection:meta?.selection,source:steady()?'cfd_steady_reference':meta?.source_kind,transport:meta?.transport,temperatureProbe:solidTexture?Array.from(solidTexture.image.data.slice(0,5)):[],particleProbe:particles?Array.from(particles.geometry.attributes.position.array.slice(0,9)):[],ranges:meta?ranges():null,solidVisible:meshes.filter(m=>m.visible).map(m=>m.userData.region),sliceVisible:sliceMesh?.visible})};
}
