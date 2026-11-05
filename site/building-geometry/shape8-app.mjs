import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {VERSION,PARAMETERS,PRESETS,defaults,normalizeConfig,deriveShape,buildSurface,inspectSurface,randomConfig,exportParameters,asciiSTL} from './shape8.mjs?v=shape8-20261105';

const $=id=>document.getElementById(id);
const english={skip:'Skip to the parameter lab',brand:'Research notes by Leidafang',home:'Research home',library:'Real building map ↗',title:'Eight parameters. One building.',intro:'Fix total height at H = 1. Explore how proportions, setbacks and height fractions shape a building within one continuous design space.',dimensions:'Independent shape parameters',bands:'Stacked volumes',normalized:'Isotropic normalization',controlsTitle:'Proportions & setbacks',remaining:'Top height · derived',heightNote:'Each band is at least 0.10 H. Each height slider is limited by the other band.',randomize:'⤨ Random shape',reset:'Reset',iso:'3D',top:'Top',front:'Front',unitless:'Dimensionless shape',base:'Base',middle:'Middle',crown:'Top',gesture:'Drag to orbit · Scroll to zoom · Right-drag to pan',wireframe:'Wireframe',rotate:'Auto rotate',plan:'Overlaid plans',derived:'Derived band dimensions',unitLabel:'Width × depth × height / H',volume:'Normalized volume V / H³',surfaceState:'Closed surface · H = 1 · Z-up',share:'Share shape',copyLink:'Copy this link to restore the current shape',vectorCopy:'The same eight values reproduce the entire shape.',examplesTitle:'Continuous variation. One shape family.',examplesCopy:'Every example changes the same eight values. Load one, then keep exploring.',examplesNote:'Example settings · not discrete classes',whyTitle:'Remove scale. Keep shape.',whyCopy:'Isotropic normalization removes overall size. Width-to-height and depth-to-height ratios, relative setbacks and height fractions still define the building.',scopeCopy:'Three centered, aligned, flat-roofed bands; each upper band fits inside the one below. Sliders define this demo’s range, not all buildings or a validated training domain.',equation1:'Base proportions',equation2:'Two setbacks',equation3:'Height fractions',about:'Generation method, exports and scope',aboutCopy:'Inspired by the band-based massing in glb-buildings-skill, this page independently implements a fixed, three-band, continuous 8D shape family. It does not run the upstream CLI. Floating-point ratios define the union surface, with interior contact faces removed. JSON records parameter order, normalization and derived dimensions. STL is dimensionless Z-up; GLB is dimensionless Y-up. Apply a physical CFD scale before meshing. No volume meshing, CFD or AI prediction runs here.',footer:'8D Building Shape Lab · 2026.11',footerMap:'Explore real buildings ↗',custom:'Custom shape',random:'Random shape',group0:'Base proportions',group1:'Relative setbacks',group2:'Height fractions',invalid:'Use a value within the displayed range. The top band must retain at least 0.10 H.',saved:'Download prepared',copied:'Shape link copied',failed:'Export failed. Please try again.',no3d:'Interactive WebGL is unavailable. A live shape preview and geometry exports remain available.',resetView:'Reset view',png:'Download current view as PNG'};
const chinese={...Object.fromEntries([...document.querySelectorAll('[data-i18n]')].map(e=>[e.dataset.i18n,e.textContent])),custom:'自定义形状',random:'随机形状',group0:'底部比例',group1:'相对退台',group2:'高度分配',invalid:'请输入范围内的数值；顶部至少保留 0.10 H。',saved:'已准备下载',copied:'已复制当前形状链接',failed:'导出失败，请重试。',no3d:'当前浏览器无法启用 WebGL，已切换为实时形状预览，仍可导出几何。',resetView:'重置视角',png:'下载当前视图 PNG'};
let language='zh';try{language=localStorage.getItem('building-geometry-language')==='en'?'en':'zh';}catch{}
const t=key=>(language==='en'?english:chinese)[key]||key;
const colors=['#7394a8','#7a9d96','#bf886d'];
let config={...defaults},selectedPreset='balanced',shapeName='',activeParameter=0,view='iso';
let surface,geometry,mesh,edges,wireMesh,renderer,scene,camera,controls,webgl=false,dirty=true,resizeObserver;
let materials,edgeMaterial,wireMaterial,toastTimer,shareError=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const format=(value,digits=2)=>Number(value).toFixed(digits);

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function name(){const preset=PRESETS.find(p=>p.id===selectedPreset);return preset?preset[language==='en'?'en':'zh']:t(shapeName||'custom');}
function makeControls(){
  const groups=[0,1,2].map((group,i)=>{
    const field=document.createElement('fieldset');field.className='parameter-group';
    const legend=document.createElement('legend');legend.innerHTML=`<span>${t('group'+i)}</span><small>${i===0?'01—02':i===1?'03—06':'07—08'}</small>`;field.append(legend);
    for(const [index,s] of PARAMETERS.entries()){
      if(s.group!==group)continue;
      const row=document.createElement('div');row.className='control';row.dataset.key=s.key;
      const label=document.createElement('label');label.htmlFor=s.key;label.innerHTML=`<span class="parameter-index">${String(index+1).padStart(2,'0')}</span><span>${s[language==='en'?'en':'zh']}</span>`;
      const numberWrap=document.createElement('div');numberWrap.className='number-wrap';
      const symbol=document.createElement('span');symbol.className='symbol';symbol.textContent=s.symbol;
      const number=document.createElement('input');number.type='number';number.id=s.key+'-number';number.inputMode='decimal';
      const range=document.createElement('input');range.type='range';range.id=s.key;
      for(const input of [number,range]){
        input.min=s.min;input.max=s.max;input.step=s.step;input.setAttribute('aria-label',s[language==='en'?'en':'zh']+' '+s.symbol);
        input.addEventListener('input',()=>{
          if(input.value===''){input.setAttribute('aria-invalid','true');return;}
          try{
            config=normalizeConfig({...config,[s.key]:Number(input.value)});selectedPreset=null;shapeName='custom';
            input.removeAttribute('aria-invalid');update();
          }catch{input.setAttribute('aria-invalid','true');$('focus-copy').textContent=t('invalid');}
        });
        input.addEventListener('change',()=>{if(input.getAttribute('aria-invalid')==='true'){syncUI();toast(t('invalid'));}});
      }
      row.addEventListener('pointerdown',()=>focusParameter(index));row.addEventListener('focusin',()=>focusParameter(index));
      numberWrap.append(symbol,number);row.append(label,numberWrap,range);field.append(row);
    }
    return field;
  });
  $('controls').replaceChildren(...groups);
}

function focusParameter(index){activeParameter=index;const spec=PARAMETERS[index];$('focus-index').textContent='θ'+String(index+1).replace(/\d/g,d=>'₀₁₂₃₄₅₆₇₈₉'[Number(d)]);$('focus-copy').textContent=spec[language==='en'?'hintEn':'hintZh'];}

function miniature(input,width=280,height=160){
  const {bands}=deriveShape(input);
  const project=([x,y,z])=>[.84*(x-y),.40*(x+y)-z];
  const points=bands.flatMap(b=>[b.z0,b.z1].flatMap(z=>[-1,1].flatMap(x=>[-1,1].map(y=>project([x*b.width/2,y*b.depth/2,z])))));
  const xmin=Math.min(...points.map(p=>p[0])),xmax=Math.max(...points.map(p=>p[0])),ymin=Math.min(...points.map(p=>p[1])),ymax=Math.max(...points.map(p=>p[1]));
  const scale=Math.min((width-62)/(xmax-xmin),(height-35)/(ymax-ymin));
  const xy=p=>{const [x,y]=project(p);return `${width/2+(x-(xmin+xmax)/2)*scale},${height/2+5+(y-(ymin+ymax)/2)*scale}`;};
  const polygon=(p,color)=>`<polygon points="${p.map(xy).join(' ')}" fill="${color}" stroke="#48636f" stroke-opacity=".13" stroke-width=".65" stroke-linejoin="round"/>`;
  const shades=[['#88a4b5','#68899e','#b2c6d0'],['#8caaa3','#6c9188','#b5cbc4'],['#c4967d','#ad7c63','#dec1aa']];
  let content='';
  bands.forEach((b,i)=>{
    const x=b.width/2,y=b.depth/2,z=b.z0,Z=b.z1;
    content+=polygon([[x,-y,z],[x,y,z],[x,y,Z],[x,-y,Z]],shades[i][0]);
    content+=polygon([[-x,y,z],[x,y,z],[x,y,Z],[-x,y,Z]],shades[i][1]);
    content+=polygon([[-x,-y,Z],[x,-y,Z],[x,y,Z],[-x,y,Z]],shades[i][2]);
  });
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${content}</svg>`;
}

function drawPlan(){
  const {bands}=surface,w=surface.config.width,d=surface.config.depth;
  const scale=Math.min(165/w,98/d),svg=$('plan'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
  for(let x=0;x<210;x+=15){const path=document.createElementNS(ns,'path');path.setAttribute('d',`M${x} 0V135`);path.setAttribute('stroke','#e3e9ed');path.setAttribute('stroke-width','.5');svg.append(path);}
  for(let y=0;y<135;y+=15){const path=document.createElementNS(ns,'path');path.setAttribute('d',`M0 ${y}H210`);path.setAttribute('stroke','#e3e9ed');path.setAttribute('stroke-width','.5');svg.append(path);}
  bands.forEach((b,i)=>{const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',105-b.width*scale/2);rect.setAttribute('y',63-b.depth*scale/2);rect.setAttribute('width',b.width*scale);rect.setAttribute('height',b.depth*scale);rect.setAttribute('fill',colors[i]);rect.setAttribute('fill-opacity','.50');rect.setAttribute('stroke',colors[i]);rect.setAttribute('stroke-width','1.2');svg.append(rect);});
  const text=document.createElementNS(ns,'text');text.setAttribute('x','105');text.setAttribute('y','128');text.setAttribute('text-anchor','middle');text.textContent=`${format(w)} × ${format(d)}`;svg.append(text);
}

function syncUI(){
  for(const spec of PARAMETERS){
    const max=spec.key==='height1'?Math.min(spec.max,.9-config.height2):spec.key==='height2'?Math.min(spec.max,.9-config.height1):spec.max;
    for(const id of [spec.key,spec.key+'-number']){const input=$(id);input.max=Number(max.toFixed(8));input.value=Number(config[spec.key].toFixed(6));input.removeAttribute('aria-invalid');input.setAttribute('aria-valuetext',format(config[spec.key],3));}
    $(spec.key).style.setProperty('--fill',`${100*(config[spec.key]-spec.min)/(max-spec.min)}%`);
  }
  $('height3').textContent=format(surface.bands[2].height);$('shape-title').textContent=name();
  const labels=[t('base'),t('middle'),t('crown')];
  $('band-dimensions').innerHTML=surface.bands.map((b,i)=>`<div class="band-row"><span><i class="swatch ${['base','middle','top'][i]}"></i>${labels[i]}</span><code>${[b.width,b.depth,b.height].map(v=>format(v,3)).join(' × ')}</code></div>`).join('');
  $('height-stack').innerHTML=surface.bands.map((b,i)=>`<span style="width:${b.height*100}%;background:${colors[i]}" title="${labels[i]}: ${format(b.height)}">${format(b.height)}</span>`).join('');
  $('height-stack').setAttribute('aria-label',surface.bands.map((b,i)=>`${labels[i]} ${format(b.height)}`).join(', '));
  $('volume').textContent=format(surface.volume,4);
  $('vector').innerHTML=PARAMETERS.map((s,i)=>`<div class="vector-cell" style="--fill:${100*(config[s.key]-s.min)/(s.max-s.min)}%"><small>${s.symbol}<i>θ${i+1}</i></small><strong>${format(config[s.key])}</strong></div>`).join('');
  document.querySelectorAll('[data-preset]').forEach(button=>{const active=button.dataset.preset===selectedPreset;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  drawPlan();focusParameter(activeParameter);
  if(!shareError)$('surface-state').textContent=t('surfaceState');
  const url=new URL(location.href);url.searchParams.set('p',PARAMETERS.map(s=>Number(config[s.key].toFixed(8))).join(','));history.replaceState(null,'',url);$('share-url').value=url.href;
}

function makeGallery(){
  $('gallery').replaceChildren(...PRESETS.map((preset,index)=>{
    const button=document.createElement('button');button.type='button';button.className='sample';button.dataset.preset=preset.id;
    button.innerHTML=`<div class="sample-image">${miniature(preset.values)}<span class="sample-index">0${index+1}</span><span class="sample-arrow">↗</span></div><div class="sample-copy"><h3>${preset[language==='en'?'en':'zh']}</h3><p>L₁/H ${format(preset.values.width)} · D₁/H ${format(preset.values.depth)}</p></div>`;
    button.addEventListener('click',()=>{config=normalizeConfig(preset.values);selectedPreset=preset.id;shapeName='';update();if(innerWidth<621)$('lab').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});});
    return button;
  }));
}

function update(){
  const next=buildSurface(config),checks=inspectSurface(next.positions);
  if(!checks.closed||checks.degenerateTriangles||Math.abs(checks.signedVolume-next.volume)>1e-8)throw Error('Surface construction failed');
  surface=next;
  if(webgl){
    for(const object of [mesh,edges,wireMesh])if(object){object.removeFromParent();object.geometry.dispose();}
    geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(surface.positions,3));
    surface.groups.forEach(g=>geometry.addGroup(g.start,g.count,g.materialIndex));geometry.computeVertexNormals();
    mesh=new THREE.Mesh(geometry,materials);mesh.name=VERSION;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
    edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,20),edgeMaterial);scene.add(edges);
    wireMesh=new THREE.LineSegments(new THREE.WireframeGeometry(geometry),wireMaterial);wireMesh.visible=$('wireframe').getAttribute('aria-pressed')==='true';scene.add(wireMesh);
    dirty=true;
  }else $('fallback').innerHTML=miniature(config,650,460);
  syncUI();document.body.dataset.shapeVersion=VERSION;document.body.dataset.ready='true';
}

function fitCamera(preset){
  if(!webgl)return;
  if(preset)view=preset;
  const target=new THREE.Vector3(0,0,.48);
  let direction=camera.position.clone().sub(controls.target).normalize();
  if(preset==='top')direction=new THREE.Vector3(0,-.0001,1).normalize();
  if(preset==='front')direction=new THREE.Vector3(0,-1,.0001).normalize();
  if(preset==='iso')direction=new THREE.Vector3(1.5,-2,1.35).normalize();
  controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,6);camera.lookAt(target);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),xs=[],ys=[];
  // The same reference box frames every shape; parameter changes never rescale it.
  for(const x of [-.8,.8])for(const y of [-.675,.675])for(const z of [0,1]){const p=new THREE.Vector3(x,y,z).sub(target);xs.push(p.dot(right));ys.push(p.dot(up));}
  const aspect=$('stage').clientWidth/$('stage').clientHeight;
  const height=Math.max((Math.max(...ys)-Math.min(...ys))*1.18,(Math.max(...xs)-Math.min(...xs))/aspect*1.18,1.25);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.zoom=1;camera.updateProjectionMatrix();controls.update();dirty=true;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
}

function initialize3d(){
  scene=new THREE.Scene();scene.background=new THREE.Color(0xedf1f3);
  camera=new THREE.OrthographicCamera(-2,2,2,-2,.001,50);camera.up.set(0,0,1);camera.position.set(3,-4,2.5);
  renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  materials=colors.map(color=>new THREE.MeshStandardMaterial({color,roughness:.85}));
  edgeMaterial=new THREE.LineBasicMaterial({color:0x3d5a68,transparent:true,opacity:.28});wireMaterial=new THREE.LineBasicMaterial({color:0x466170,transparent:true,opacity:.28});
  scene.add(new THREE.HemisphereLight(0xe5f0ff,0x8c999b,2.7));
  const sun=new THREE.DirectionalLight(0xffe8d3,3.3);sun.position.set(-2.5,-3,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:12});sun.shadow.normalBias=.002;sun.shadow.bias=-.00012;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xe1efff,1.3);fill.position.set(3,2,3);scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:0xeaf0f3,roughness:1}));ground.position.z=-.001;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(6,30,0xa1b4bf,0xc2cfd8);grid.rotation.x=Math.PI/2;grid.position.z=-.0005;grid.material.transparent=true;grid.material.opacity=.27;scene.add(grid);
  const guidePositions=[.98,.78,0,.98,.78,1,.94,.78,0,1.02,.78,0,.94,.78,1,1.02,.78,1];
  const guide=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(guidePositions,3)),new THREE.LineBasicMaterial({color:0x9fb2bd,transparent:true,opacity:.55}));scene.add(guide);
  controls=new OrbitControls(camera,$('scene'));controls.enableDamping=true;controls.dampingFactor=.1;controls.autoRotateSpeed=.65;controls.minZoom=.4;controls.maxZoom=5;controls.listenToKeyEvents($('scene'));controls.addEventListener('change',()=>dirty=true);
  controls.addEventListener('start',()=>{view='free';document.querySelectorAll('[data-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});});
  webgl=true;$('fallback').hidden=true;
  const resize=()=>{renderer.setSize($('stage').clientWidth,$('stage').clientHeight,false);fitCamera();dirty=true;};
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe($('stage'));resize();fitCamera('iso');
  const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{const changed=controls.update(Math.min(clock.getDelta(),.05));if(dirty||changed||controls.autoRotate){renderer.render(scene,camera);dirty=false;}});
  document.body.dataset.renderer='webgl';
}

function refreshLanguage(){
  document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'8D Building Shape Lab · Leidafang':'8 维建筑形状实验室 · Leidafang';
  document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));
  $('language').textContent=language==='en'?'中文':'EN';$('language').setAttribute('aria-label',language==='en'?'切换到中文':'Switch to English');
  $('reset-view').setAttribute('aria-label',t('resetView'));$('reset-view').title=t('resetView');$('screenshot').setAttribute('aria-label',t('png'));
  $('scene').setAttribute('aria-label',language==='en'?'3D building. Drag to orbit, scroll to zoom, right-drag to pan.':'三维建筑，拖动旋转、滚轮缩放、右键平移');
  $('plan').setAttribute('aria-label',language==='en'?'Overlaid plans of the three bands':'三段体量的叠合平面');
  makeControls();makeGallery();if(surface)syncUI();
}

function download(data,filename,type){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(t('saved'));}
async function exportGLB(){
  const button=$('download-glb');button.disabled=true;
  try{
    const {GLTFExporter}=await import('./vendor/exporters/GLTFExporter.js');
    const s=buildSurface(config),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));s.groups.forEach(group=>g.addGroup(group.start,group.count,group.materialIndex));g.computeVertexNormals();
    const exportMaterials=colors.map(color=>new THREE.MeshStandardMaterial({color,roughness:.85}));
    try{const object=new THREE.Mesh(g,exportMaterials);object.name=VERSION;object.rotation.x=-Math.PI/2;object.userData=exportParameters(config);object.updateMatrixWorld(true);
      const result=await new GLTFExporter().parseAsync(object,{binary:true});download(result,'building-8d-H1.glb','model/gltf-binary');
    }finally{g.dispose();exportMaterials.forEach(m=>m.dispose());}
  }catch(error){console.error(error);toast(t('failed'));}finally{button.disabled=false;}
}

const incoming=new URL(location.href).searchParams.get('p');
if(incoming){try{const values=incoming.split(',');if(values.length!==8)throw Error('Expected 8 parameters');config=normalizeConfig(Object.fromEntries(PARAMETERS.map((s,i)=>[s.key,values[i]])));selectedPreset=null;shapeName='custom';}catch{shareError=true;setTimeout(()=>toast(t('invalid')),500);}}
refreshLanguage();
try{initialize3d();}catch(error){console.warn('WebGL unavailable:',error);webgl=false;renderer?.setAnimationLoop(null);renderer?.dispose();$('scene').hidden=true;$('fallback').hidden=false;document.body.dataset.renderer='svg';for(const id of ['wireframe','rotate','screenshot','reset-view'])$(id).disabled=true;document.querySelectorAll('[data-view]').forEach(b=>b.disabled=true);toast(t('no3d'));}
update();
$('language').addEventListener('click',()=>{language=language==='zh'?'en':'zh';try{localStorage.setItem('building-geometry-language',language);}catch{}refreshLanguage();});
$('reset').addEventListener('click',()=>{config={...defaults};selectedPreset='balanced';shapeName='';update();});
$('randomize').addEventListener('click',()=>{const p=randomConfig();config=normalizeConfig(Object.fromEntries(PARAMETERS.map(s=>[s.key,Number(p[s.key].toFixed(2))])));selectedPreset=null;shapeName='random';update();});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>fitCamera(button.dataset.view)));
$('reset-view').addEventListener('click',()=>{controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');fitCamera('iso');});
$('wireframe').addEventListener('click',()=>{wireMesh.visible=!wireMesh.visible;$('wireframe').setAttribute('aria-pressed',String(wireMesh.visible));dirty=true;});
$('rotate').addEventListener('click',()=>{controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));dirty=true;});
$('download-json').addEventListener('click',()=>download(JSON.stringify(exportParameters(config),null,2)+'\n','building-8d-parameters.json','application/json'));
$('download-stl').addEventListener('click',()=>download(asciiSTL(config),'building-8d-H1.stl','model/stl'));
$('download-glb').addEventListener('click',exportGLB);
$('screenshot').addEventListener('click',()=>{renderer.render(scene,camera);$('scene').toBlob(blob=>{if(blob)download(blob,'building-8d-H1.png','image/png');});});
$('share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);toast(t('copied'));}catch{$('share-fallback').hidden=false;$('share-url').value=location.href;$('share-url').select();}});
addEventListener('pagehide',()=>{resizeObserver?.disconnect();renderer?.setAnimationLoop(null);controls?.dispose();});
