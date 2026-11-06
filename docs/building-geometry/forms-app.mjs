import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {VERSION,ENGINE,FAMILIES,ROOFS,PARAMETERS,PRESETS,defaults,normalizeConfig,activeParameters,availableRoofs,deriveBuilding} from './forms-model.mjs?v=hip-ridge-20261106';
import {previewSTL,nativeSvg} from './forms-export.mjs?v=forms-o2w-20261105';
import {MATERIAL_VERSION,LOOKS,FacadeMaterials,facadeRelief,installDaylight,contactShadow} from './facade-pbr.mjs?v=hip-ridge-20261106';
import {getRoofBoundaryEdges,facadeRoofProfile} from './roof-wall-junction.mjs?v=roof-envelope-20261105';

const $=id=>document.getElementById(id);
const en={skip:'Skip to the form lab',brand:'Research notes by Leidafang',home:'Research home',library:'Real building map ↗',title:'From footprint to wings and roof.',intro:'Explore how a building encloses, connects and rises. Native procedural geometry, normalized to H = 1, with architectural relationships you can shape.',families:'Building structures',activeCount:'Active shape controls',normalized:'Isotropic normalization',controlsTitle:'Structure & shape',family:'Building structure',roof:'Roof form',randomize:'⤨ Nearby variation',reset:'Reset',controlsNote:'Numeric controls vary continuously within a structure. Structure and roof are discrete choices; this count is not a unified independent shape dimension.',iso:'3D',top:'Top',front:'Front',unitless:'Dimensionless shape',loading:'Generating building…',facadeCaption:'Architectural materials',solidCaption:'Plain geometry · materials hidden',gesture:'Drag to orbit · Scroll to zoom · Right-drag to pan',facade:'Materials',appearance:'Facade finish',appearanceNote:'Display only · geometry preserved',wireframe:'Wireframe',rotate:'Auto rotate',plan:'Footprint & parts',geometryInfo:'Generated geometry',dimensionsLabel:'Width × depth × height',footprint:'Footprint area / H²',partsLabel:'Building parts / courtyards',trianglesLabel:'Mesh triangles',previewState:'Generator preview · CFD mesh not validated',share:'Share shape',stl:'Preview STL ↓',copyLink:'Copy this link to restore structure and parameters',examplesTitle:'Building variation beyond stacked setbacks.',examplesCopy:'Choose a building, then adjust its wings, courtyard, tower position and roof. Every preview comes from the same native generator.',examplesNote:'Parametric examples · keep editing',whyTitle:'See the form. Then see the facade.',whyCopy:'Footprint enclosure, wings, podium-to-tower relationships and roof form define the building. Hide materials to compare the geometry itself.',scopeCopy:'Six structures with verified roof combinations. Facade materials change display only. These previews have not been admitted to a CFD training dataset.',rule1:'Footprints can turn and enclose',rule1Copy:'L / U shapes and polygons with holes express wings, passages and courtyards.',rule2:'Volumes have hierarchy and offsets',rule2Copy:'Low podiums support towers. Wings and twin towers can have different heights.',rule3:'Roofs contribute to the form',rule3Copy:'Flat, gable, hip and shed roof generation.',about:'Generator source, parameter semantics and export scope',aboutCopy:'This page runs the official OSM2World browser module 0.5.0-SNAPSHOT (2026-02-18) on our synthetic parametric footprints and building parts. No real OSM buildings are used. Geometry is isotropically normalized to H=1. Procedural wall and roof materials separate glass, frames and masonry through reflection, roughness and surface relief. Shallow frames, sills, cornices, roof-edge fascia, gutters and attic louvers are display-only and cast shadows; base geometry is preserved without modeled window openings. GLB embeds material maps and STL keeps the base geometry; shallow facade details are not exported. Active numeric controls vary by structure; structures and roofs are discrete choices, so the control count is not a universal independent dimension. JSON records all parameters, active controls, outlines, parts and generator identity. GLB is Y-up; preview STL is Z-up; both are dimensionless. Exports retain the native preview assembly with roof-to-wall gaps matched to the generated roof boundary; shed roofs use an affine plane on native flat-top topology. L/U hip roofs reconstruct the roof and walls with common eaves and equal pitch, recorded as geometry version 1.3 in JSON. Other combinations retain geometry version 1.2. Ground caps and internal contacts are not repaired, and the result is not an accepted closed CFD solid. Courtyard hip roofs are excluded from the verified combinations.',baseline:'Three-band 8D baseline ↗',footer:'Architectural Form Lab · 2026.11',footerMap:'Explore real buildings ↗',group0:'Footprint proportions',group1:'Wings, courtyard or podium',group2:'Tower dimensions & position',group3:'Roof geometry',custom:'Custom building',nearby:'Nearby variation',invalid:'Use a number within the displayed range.',failed:'This combination could not be generated. The last completed shape has been restored.',exportFailed:'Export failed. Please try again.',saved:'Download prepared',copied:'Shape link copied',resetView:'Reset view',sourceFailed:'The native generator could not load. Reload the page to try again.',vectorCopy:'active numeric controls · structure and roof recorded separately',part:'part',roofChanged:'The courtyard structure uses flat, gable or shed roofs.',noteBar:'One footprint. Adjust its proportions, corners and roof.',noteL:'The main wing connects to a side wing; flat roofs allow different heights.',noteU:'Three connected wings define an open court. Side wings can differ in height.',noteCourt:'The courtyard is a real hole through the plan. Hip roofs are excluded here.',notePodium:'A low podium supports a tower whose size and position can vary.',noteTwin:'Two towers share a podium, with controllable spacing and unequal heights.'};
const zh={...Object.fromEntries([...document.querySelectorAll('[data-i18n]')].map(e=>[e.dataset.i18n,e.textContent])),solidCaption:'纯几何外形 · 已隐藏建筑材质',group0:'平面比例',group1:'翼楼、庭院或裙房',group2:'塔楼尺寸与位置',group3:'屋顶形状',custom:'自定义建筑',nearby:'邻近形态变化',invalid:'请输入滑条范围内的有效数值。',failed:'这组参数未能生成，已恢复到上一完整形状。',exportFailed:'导出失败，请重试。',saved:'已准备下载',copied:'已复制当前建筑参数链接',resetView:'重置视角',sourceFailed:'原生生成器未能加载，请刷新页面重试。',vectorCopy:'个有效数值控制 · 构型与屋顶另行记录',part:'部件',roofChanged:'庭院构型当前支持平、双坡和单坡屋顶。',noteBar:'一个主体平面，可调整比例、切角与屋顶。',noteL:'主体与侧翼相连；平屋顶时可以改变侧翼高度。',noteU:'三翼围合出开放庭院，左右翼可以有不同高度。',noteCourt:'庭院是贯穿平面的真实内孔；本页暂不提供庭院四坡组合。',notePodium:'低矮裙房承接塔楼，可以改变塔楼尺寸与偏移。',noteTwin:'两座塔楼共用裙房，可调整净间距与第二塔高度。'};
let language='zh';try{language=localStorage.getItem('building-geometry-language')==='en'?'en':'zh';}catch{}
const t=key=>(language==='en'?en:zh)[key]||key;
const fieldName=spec=>spec[language==='en'?'en':'zh'];
const fmt=(n,d=2)=>Number(n).toFixed(d);
let config={...defaults},floors=14,selected='office',baseline='office',nameKey='',activeKey='width',applied=null;
let renderer,scene,camera,controls,root,overlay,resizeObserver,worker,workerReady=false,inflight=null,queued=null,timer,revision=0,renderCount=0,dirty=true,view='iso',wire=false,facades=true,webgl=false;
let look='auto',facadeMaterials,groundShadow,facadeDetail,disposeEnvironment,edgeMaterial,wireMaterial,toastTimer,surfaceCoverage;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
function shapeName(){const p=PRESETS.find(p=>p.id===selected);return p?fieldName(p):t(nameKey||'custom');}
function familyName(){return fieldName(FAMILIES.find(f=>f.id===config.family));}
function setBusy(value){$('loading').hidden=!value;for(const id of ['download-json','download-glb','download-stl','screenshot','share'])$(id).disabled=value||!applied;$( 'screenshot').disabled=value||!applied||!webgl;document.body.dataset.pending=String(value);}

function populateSelectors(){
  for(const [id,items] of [['family',FAMILIES],['roof',availableRoofs(config.family)]]){
    $(id).replaceChildren(...items.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=fieldName(item);return option;}));$(id).value=config[id];
  }
  $('appearance').replaceChildren(...LOOKS.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=fieldName(item);return option;}));$('appearance').value=look;$('appearance').setAttribute('aria-label',t('appearance'));
}

function updateAppearanceCaption(){
  const names=language==='en'?{office:'Office glazing',residential:'Light residential',stone:'Stone & glass',brick:'Warm masonry'}:{office:'办公玻璃',residential:'浅色住宅',stone:'石材与玻璃',brick:'暖色砖石'};
  $('view-caption').textContent=facades?`${names[facadeMaterials?.style]||t('facadeCaption')} · ${language==='en'?'daylight & material reflections':'日光与材质反射'}`:t('solidCaption');
}

function exportMetadata(){return {...applied.metadata,presentation:{version:MATERIAL_VERSION,appearance:look,material_style:facadeMaterials?.style||null,materials_visible:facades,display_only:true,source_geometry_modified:false,window_openings_modeled:false,glb_material_maps_embedded:facades&&webgl,shallow_facade_relief_exported:false,roof_detail_clearance:facadeDetail?.userData.stats.clearanceVersion||null,roof_edge_trim:facadeDetail?.userData.stats.roofTrim.version||null}};}

function focusParameter(key){
  activeKey=key;const specs=activeParameters(config),index=specs.findIndex(s=>s.key===key),s=specs[index]||specs[0];
  $('focus-index').textContent=String(Math.max(0,index)+1).padStart(2,'0');
  $('focus-copy').textContent=fieldName(s)+' · '+s.symbol+(language==='en'?' — change this value to explore the current structure.':'：在当前构型内调整这个形状量。');
}

function makeControls(){
  const specs=activeParameters(config),fields=[];
  for(let group=0;group<4;group++){
    const members=specs.filter(s=>s.group===group);if(!members.length)continue;
    const field=document.createElement('fieldset');field.className='parameter-group';const legend=document.createElement('legend');legend.innerHTML=`<span>${t('group'+group)}</span><small>${String(members.length).padStart(2,'0')}</small>`;field.append(legend);
    for(const s of members){
      const row=document.createElement('div');row.className='control';row.dataset.key=s.key;
      const label=document.createElement('label');label.htmlFor=s.key;label.innerHTML=`<span class="parameter-index">${String(specs.indexOf(s)+1).padStart(2,'0')}</span><span>${fieldName(s)}</span>`;
      const wrap=document.createElement('div');wrap.className='number-wrap';const symbol=document.createElement('span');symbol.className='symbol';symbol.textContent=s.symbol;
      const number=document.createElement('input');number.type='number';number.id=s.key+'-number';number.inputMode='decimal';
      const range=document.createElement('input');range.type='range';range.id=s.key;
      for(const input of [number,range]){
        input.min=s.min;input.max=s.max;input.step=s.step;input.setAttribute('aria-label',fieldName(s)+' '+s.symbol);
        input.addEventListener('input',()=>{
          if(input.value===''){input.setAttribute('aria-invalid','true');return;}
          try{const next=normalizeConfig({...config,[s.key]:Number(input.value)});input.removeAttribute('aria-invalid');config=next;selected=null;nameKey='custom';requestGeneration();}
          catch{input.setAttribute('aria-invalid','true');$('focus-copy').textContent=t('invalid');}
        });
        input.addEventListener('change',()=>{if(input.getAttribute('aria-invalid')==='true'){syncControls();toast(t('invalid'));}});
      }
      row.addEventListener('focusin',()=>focusParameter(s.key));row.addEventListener('pointerdown',()=>focusParameter(s.key));
      wrap.append(symbol,number);row.append(label,wrap,range);field.append(row);
    }
    fields.push(field);
  }
  $('controls').replaceChildren(...fields);syncControls();
}

function syncControls(){
  const specs=activeParameters(config);
  for(const s of specs){
    if(!$(s.key))continue;
    for(const id of [s.key,s.key+'-number']){$(id).value=Number(config[s.key].toFixed(6));$(id).removeAttribute('aria-invalid');}
    $(s.key).style.setProperty('--fill',`${100*(config[s.key]-s.min)/(s.max-s.min)}%`);
  }
  $('control-count').textContent=String(specs.length).padStart(2,'0');
  $('structure-note').textContent=t({bar:'noteBar',l:'noteL',u:'noteU',court:'noteCourt',podium:'notePodium',twin:'noteTwin'}[config.family]);
  $('family').value=config.family;$('roof').value=config.roof;
  $('vector-summary').textContent=`${specs.length} ${t('vectorCopy')}`;
  $('vector').innerHTML=specs.map((s,i)=>`<div class="vector-cell" style="--fill:${100*(config[s.key]-s.min)/(s.max-s.min)}%"><small>${s.symbol}<i>${i+1}</i></small><strong>${fmt(config[s.key],s.step===1?0:2)}</strong></div>`).join('');
  focusParameter(activeKey);
  document.querySelectorAll('[data-preset]').forEach(b=>{const on=b.dataset.preset===selected;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}

function drawPlan(){
  if(!applied)return;
  const b=deriveBuilding(applied.metadata.parameters),scale=Math.min(172/b.config.width,104/b.config.depth),ns='http://www.w3.org/2000/svg',svg=$('plan');svg.replaceChildren();
  const points=poly=>poly.map(([x,y])=>`${105+x*scale},${63-y*scale}`).join(' ');
  const path=poly=>poly.map(([x,y],i)=>`${i?'L':'M'}${105+x*scale},${63-y*scale}`).join(' ')+' Z';
  const background=document.createElementNS(ns,'path');background.setAttribute('d',[b.outline,...b.holes].map(path).join(' '));background.setAttribute('fill-rule','evenodd');background.setAttribute('fill','#d4d0c5');background.setAttribute('stroke','#9c9588');background.setAttribute('stroke-width','1');svg.append(background);
  if(!b.holes.length)b.parts.forEach((part,i)=>{
    const polygon=document.createElementNS(ns,'polygon');polygon.setAttribute('points',points(part.outer));polygon.setAttribute('fill',i===0?'#b4afa0':'#7d9199');polygon.setAttribute('fill-opacity',i===0?'.28':'.52');polygon.setAttribute('stroke',i===0?'#aaa292':'#6e8692');polygon.setAttribute('stroke-width','1');svg.append(polygon);
  });
  const label=document.createElementNS(ns,'text');label.setAttribute('x','105');label.setAttribute('y','128');label.setAttribute('text-anchor','middle');label.textContent=`${fmt(b.config.width)} × ${fmt(b.config.depth)}`;svg.append(label);
}

function showAppliedInfo(){
  if(!applied)return;const bounds=applied.bounds;
  $('shape-title').textContent=shapeName();$('dimensions').textContent=[0,1,2].map(k=>fmt(bounds[1][k]-bounds[0][k],3)).join(' × ');
  $('footprint').textContent=fmt(applied.footprintArea,3);$('parts').textContent=`${applied.metadata.parts.length} / ${applied.metadata.holes.length}`;$('triangles').textContent=String(applied.triangles);drawPlan();
}

function drawGallery(){
  $('gallery').replaceChildren(...PRESETS.map((p,i)=>{
    const button=document.createElement('button');button.type='button';button.className='sample';button.dataset.preset=p.id;
    button.innerHTML=`<div class="sample-image"><img src="./assets/forms/${p.id}.webp?v=hip-ridge-20261106" alt="${fieldName(p)}" width="360" height="210" loading="lazy"><span class="sample-index">${String(i+1).padStart(2,'0')}</span><span class="sample-arrow">↗</span></div><div class="sample-copy"><h3>${fieldName(p)}</h3><p>${fieldName(FAMILIES.find(f=>f.id===p.values.family))} · ${fieldName(ROOFS.find(r=>r.id===p.values.roof))}</p></div>`;
    button.addEventListener('click',()=>choosePreset(p.id,true));return button;
  }));
}

function choosePreset(id,scroll=false){
  const p=PRESETS.find(p=>p.id===id);config=normalizeConfig(p.values);floors=p.floors;selected=id;baseline=id;nameKey='';populateSelectors();makeControls();requestGeneration(0);
  if(scroll&&innerWidth<621)$('lab').scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});
}

function syncUrl(){
  const url=new URL(location.href);url.searchParams.delete('p');url.searchParams.set('model',config.family);url.searchParams.set('roof',config.roof);url.searchParams.set('q',PARAMETERS.map(s=>Number(config[s.key].toFixed(6))).join(','));url.searchParams.set('floors',floors);url.searchParams.set('look',look);url.searchParams.set('materials',facades?'1':'0');history.replaceState(null,'',url);$('share-url').value=url.href;
}

function requestGeneration(delay=150){
  revision++;queued={ticket:revision,config:{...config},floors};clearTimeout(timer);syncControls();setBusy(true);timer=setTimeout(pump,delay);
}
function pump(){if(!workerReady||inflight||!queued)return;inflight=queued;queued=null;worker.postMessage(inflight);}

function installWorker(){
  worker=new Worker(new URL('./o2w-worker.mjs?v=roof-envelope-20261105',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){workerReady=true;pump();return;}
    const job=inflight;inflight=null;
    if(data.ticket===revision){
      if(data.type==='geometry'){
        applied=data.result;installGeometry();showAppliedInfo();syncUrl();setBusy(false);document.body.dataset.ready='true';
      }else{
        if(applied){config=normalizeConfig(applied.metadata.parameters);floors=applied.metadata.visual_floor_divisions;selected=null;nameKey='custom';populateSelectors();makeControls();showAppliedInfo();syncUrl();setBusy(false);}
        else{setBusy(false);document.body.dataset.error='generation';}
        toast(t('failed'));
      }
    }
    pump();
  };
  worker.onerror=()=>{workerReady=false;inflight=null;queued=null;$('loading').hidden=true;toast(t('sourceFailed'));document.body.dataset.error='worker';};
}

function disposeModel(){
  for(const object of [root,overlay])if(object){object.traverse(o=>o.geometry?.dispose());object.removeFromParent();}
  if(facadeDetail){const geometries=new Set();facadeDetail.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)o.dispose();o.material?.dispose();});geometries.forEach(g=>g.dispose());facadeDetail.removeFromParent();facadeDetail=null;}
  if(groundShadow){groundShadow.geometry.dispose();groundShadow.material.map.dispose();groundShadow.material.dispose();groundShadow.removeFromParent();groundShadow=null;}
}

function wallBasis(mesh,i){
  const p=mesh.positions,n=mesh.normals,mid=[0,1,2].map(k=>(p[i+k]+p[i+3+k]+p[i+6+k])/3);
  for(const part of applied.metadata.parts){
    if(mid[2]<part.base-1e-5||mid[2]>part.height+1e-5)continue;
    // OSM2World's native planar frame mirrors the synthetic northing. Match
    // presentation coordinates to that frame without moving source vertices.
    for(const [ringIndex,sourceRing] of [part.outer,...part.holes].entries()){
      const ring=sourceRing.map(([x,y])=>[x,-y]);
      for(let j=0;j<ring.length;j++){
      const a=ring[j],b=ring[(j+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),tx=dx/length,ty=dy/length;
      const along=(mid[0]-a[0])*tx+(mid[1]-a[1])*ty,away=Math.abs((mid[0]-a[0])*ty-(mid[1]-a[1])*tx);
      if(away>1e-4||along<-.0001||along>length+.0001||Math.abs(n[i]*ty-n[i+1]*tx)<.9)continue;
      const height=part.height-part.roofRise-part.base,rows=Math.max(1,Math.round((part.height-part.base)*applied.metadata.visual_floor_divisions)),columns=Math.max(1,Math.round(length/(height/rows*.96)));
      return {a,tx,ty,length,base:part.base,height,rows,columns,part,edge:ringIndex*1000+j,normal:[n[i],n[i+1]]};
      }
    }
  }
  return null;
}
function installGeometry(){
  if(!webgl){$('poster').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(nativeSvg(applied.meshes));return;}
  disposeModel();root=new THREE.Group();root.name=applied.metadata.generator;overlay=new THREE.Group();facadeMaterials.begin(applied.metadata,look);surfaceCoverage={verticalTriangles:0,mappedTriangles:0,horizontalTriangles:0};const walls=new Map(),roofEdges=getRoofBoundaryEdges(applied.meshes);
  for(const [i,m] of applied.meshes.entries()){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));
    const uv=new Float32Array(m.positions.length/3*2),materials=[],materialIndices=new Map();
    for(let j=0;j<m.positions.length;j+=9){
      let basis=m.role==='wall'?wallBasis(m,j):null;
      if(basis){const id=basis.part.id+'/'+basis.edge;if(walls.has(id))basis=walls.get(id);else{basis.roofProfile=facadeRoofProfile(basis,roofEdges);walls.set(id,basis);}}
      if(m.role==='wall'){if(Math.abs(m.normals[j+2])<.1){surfaceCoverage.verticalTriangles++;if(basis)surfaceCoverage.mappedTriangles++;}else surfaceCoverage.horizontalTriangles++;}
      const flatRoof=m.role==='roof'&&m.normals[j+2]>.99&&Math.max(m.positions[j+2],m.positions[j+5],m.positions[j+8])-Math.min(m.positions[j+2],m.positions[j+5],m.positions[j+8])<1e-6;
      const material=m.role==='roof'?facadeMaterials.roof(flatRoof?'flat':applied.metadata.parameters.roof):basis?facadeMaterials.wall(basis):facadeMaterials.plainWall;
      if(!materialIndices.has(material)){materialIndices.set(material,materials.length);materials.push(material);}
      const materialIndex=materialIndices.get(material),last=g.groups.at(-1);
      if(last?.materialIndex===materialIndex)last.count+=3;else g.addGroup(j/3,3,materialIndex);
      const roofNormal=m.role==='roof'?new THREE.Vector3(...m.normals.slice(j,j+3)):null;
      const roofU=roofNormal&&!flatRoof?new THREE.Vector3(roofNormal.y,-roofNormal.x,0).normalize():null,roofV=roofU?new THREE.Vector3().crossVectors(roofNormal,roofU).normalize():null;
      for(let k=0;k<9;k+=3){const q=j+k,[x,y,z]=m.positions.slice(q,q+3),p=roofU?new THREE.Vector3(x,y,z):null;
        uv[q/3*2]=basis?((x-basis.a[0])*basis.tx+(y-basis.a[1])*basis.ty)/basis.length:roofU?p.dot(roofU)*8:x*6;
        uv[q/3*2+1]=basis?(z-basis.base)/(basis.part.height-basis.part.base):roofV?p.dot(roofV)*8:y*6;
      }
    }
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(g,materials);facadeMaterials.bind(mesh,materials);mesh.userData.role=m.role;mesh.name=`native-${m.role}-${i}`;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    const lines=new THREE.LineSegments(new THREE.EdgesGeometry(g,25),edgeMaterial);overlay.add(lines);
    const wireLines=new THREE.LineSegments(new THREE.WireframeGeometry(g),wireMaterial);wireLines.userData.wire=true;wireLines.visible=wire;overlay.add(wireLines);
  }
  facadeMaterials.finish();facadeMaterials.setVisible(root,facades);groundShadow=contactShadow(applied.metadata);facadeDetail=facadeRelief([...walls.values()],facadeMaterials.style,applied.meshes);facadeDetail.visible=facades;scene.add(root,overlay,groundShadow,facadeDetail);updateAppearanceCaption();$('poster').hidden=true;dirty=true;
}

function fitCamera(preset){
  if(!webgl)return;if(preset)view=preset;
  const target=new THREE.Vector3(0,0,.45);let direction=camera.position.clone().sub(controls.target).normalize();
  if(preset==='iso')direction=new THREE.Vector3(1.6,-2.2,1.55).normalize();if(preset==='top')direction=new THREE.Vector3(0,-.0001,1).normalize();if(preset==='front')direction=new THREE.Vector3(0,-1,.0001).normalize();
  controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,8);camera.lookAt(target);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),xs=[],ys=[];
  for(const x of [-1.1,1.1])for(const y of [-.85,.85])for(const z of [0,1]){const p=new THREE.Vector3(x,y,z).sub(target);xs.push(p.dot(right));ys.push(p.dot(up));}
  const aspect=$('stage').clientWidth/$('stage').clientHeight;
  const height=Math.max((Math.max(...ys)-Math.min(...ys))*1.12,(Math.max(...xs)-Math.min(...xs))/aspect*1.12,1.3);
  Object.assign(camera,{left:-height*aspect/2,right:height*aspect/2,top:height/2,bottom:-height/2,zoom:1});camera.updateProjectionMatrix();controls.update();dirty=true;
  document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}

function initialize3d(){
  scene=new THREE.Scene();scene.background=new THREE.Color(0xe7ebed);camera=new THREE.OrthographicCamera(-2,2,2,-2,.001,60);camera.up.set(0,0,1);camera.position.set(3,-4,3);
  renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  facadeMaterials=new FacadeMaterials();disposeEnvironment=installDaylight(renderer,scene);edgeMaterial=new THREE.LineBasicMaterial({color:0x575c5c,transparent:true,opacity:.12});wireMaterial=new THREE.LineBasicMaterial({color:0x4f6470,transparent:true,opacity:.3});
  scene.add(new THREE.HemisphereLight(0xd9e8ff,0x8e8980,.65));const sun=new THREE.DirectionalLight(0xffeed7,3.4);sun.position.set(-3,-4,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-2.5,right:2.5,top:2.5,bottom:-2.5,near:.1,far:15});sun.shadow.normalBias=.0008;sun.shadow.bias=-.00003;sun.shadow.radius=3;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xdceaff,.4);fill.position.set(4,2,4);scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:0xd5d9d8,roughness:1}));ground.position.z=-.002;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(8,40,0xafbbc2,0xc9d2d8);grid.rotation.x=Math.PI/2;grid.position.z=-.0018;grid.material.transparent=true;grid.material.opacity=.12;scene.add(grid);
  controls=new OrbitControls(camera,$('scene'));controls.enableDamping=true;controls.dampingFactor=.1;controls.minZoom=.35;controls.maxZoom=5;controls.autoRotateSpeed=.65;controls.listenToKeyEvents($('scene'));controls.addEventListener('change',()=>dirty=true);
  controls.addEventListener('start',()=>{view='free';document.querySelectorAll('[data-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});});webgl=true;
  resizeObserver=new ResizeObserver(()=>{renderer.setSize($('stage').clientWidth,$('stage').clientHeight,false);fitCamera();dirty=true;});resizeObserver.observe($('stage'));renderer.setSize($('stage').clientWidth,$('stage').clientHeight,false);fitCamera('iso');
  const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{const changed=controls.update(Math.min(clock.getDelta(),.05));if(dirty||changed||controls.autoRotate){renderer.render(scene,camera);dirty=false;renderCount++;}});document.body.dataset.renderer='webgl';
}

function refreshLanguage(){
  document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'Architectural Form Lab · Leidafang':'建筑形态实验室 · Leidafang';document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));$('language').textContent=language==='en'?'中文':'EN';$('language').setAttribute('aria-label',language==='en'?'切换到中文':'Switch to English');$('reset-view').setAttribute('aria-label',t('resetView'));populateSelectors();makeControls();drawGallery();syncControls();showAppliedInfo();updateAppearanceCaption();
}

function download(data,name,type){const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(t('saved'));}
async function downloadGlb(){
  if(!applied)return;const button=$('download-glb');button.disabled=true;let temporary;
  try{const {GLTFExporter}=await import('./vendor/exporters/GLTFExporter.js');const group=new THREE.Group();group.name=applied.metadata.generator;group.rotation.x=-Math.PI/2;const copy=root?root.clone():new THREE.Group();
    if(!root){temporary=copy;for(const m of applied.meshes){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(m.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));copy.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:new THREE.Color(...m.color)})));}}
    copy.userData=exportMetadata();group.add(copy);group.updateMatrixWorld(true);const data=await new GLTFExporter().parseAsync(group,{binary:true});download(data,'architectural-form-H1.glb','model/gltf-binary');}
  catch(error){console.error(error);toast(t('exportFailed'));}finally{temporary?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});button.disabled=document.body.dataset.pending==='true';}
}

function boot(){
  const url=new URL(location.href);
  if(LOOKS.some(l=>l.id===url.searchParams.get('look')))look=url.searchParams.get('look');facades=url.searchParams.get('materials')!=='0';$('facade').setAttribute('aria-pressed',String(facades));
  if(url.searchParams.has('model')){
    try{const q=url.searchParams.get('q')?.split(',');if(!q||q.length!==PARAMETERS.length)throw Error('Invalid parameter vector');config=normalizeConfig({family:url.searchParams.get('model'),roof:url.searchParams.get('roof'),...Object.fromEntries(PARAMETERS.map((s,i)=>[s.key,q[i]]))});floors=Math.max(2,Math.min(20,Number(url.searchParams.get('floors'))||10));selected=null;nameKey='custom';baseline=PRESETS.find(p=>p.values.family===config.family).id;}
    catch{config={...defaults};setTimeout(()=>toast(t('invalid')),500);}
  }
  refreshLanguage();try{initialize3d();}catch(error){console.warn('WebGL unavailable',error);webgl=false;renderer?.setAnimationLoop(null);$('scene').hidden=true;document.body.dataset.renderer='poster';for(const id of ['appearance','facade','wireframe','rotate','reset-view','screenshot'])$(id).disabled=true;document.querySelectorAll('[data-view]').forEach(b=>b.disabled=true);}
  installWorker();requestGeneration(0);
  $('family').addEventListener('change',()=>{const p=PRESETS.find(p=>p.values.family===$('family').value);choosePreset(p.id);});
  $('roof').addEventListener('change',()=>{config=normalizeConfig({...config,roof:$('roof').value});selected=null;nameKey='custom';makeControls();requestGeneration(0);});
  $('reset').addEventListener('click',()=>choosePreset(baseline));$('randomize').addEventListener('click',async()=>{const {randomConfig}=await import('./forms-model.mjs?v=hip-ridge-20261106');config=randomConfig(config);selected=null;nameKey='nearby';requestGeneration(0);});
  $('language').addEventListener('click',()=>{language=language==='zh'?'en':'zh';try{localStorage.setItem('building-geometry-language',language);}catch{}refreshLanguage();});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>fitCamera(b.dataset.view)));
  $('reset-view').addEventListener('click',()=>{controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');fitCamera('iso');});
  $('appearance').addEventListener('change',()=>{look=$('appearance').value;if(applied)installGeometry();syncUrl();});
  $('facade').addEventListener('click',()=>{facades=!facades;facadeMaterials?.setVisible(root,facades);if(facadeDetail)facadeDetail.visible=facades;$('facade').setAttribute('aria-pressed',String(facades));updateAppearanceCaption();syncUrl();dirty=true;});
  $('wireframe').addEventListener('click',()=>{wire=!wire;overlay?.traverse(o=>{if(o.userData.wire)o.visible=wire;});$('wireframe').setAttribute('aria-pressed',String(wire));dirty=true;});
  $('rotate').addEventListener('click',()=>{controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));dirty=true;});
  $('download-json').addEventListener('click',()=>download(JSON.stringify(exportMetadata(),null,2)+'\n','architectural-form-parameters.json','application/json'));
  $('download-stl').addEventListener('click',()=>download(previewSTL(applied.meshes),'architectural-form-H1-preview.stl','model/stl'));$('download-glb').addEventListener('click',downloadGlb);
  $('screenshot').addEventListener('click',()=>{renderer.render(scene,camera);$('scene').toBlob(blob=>{if(blob)download(blob,'architectural-form-H1.png','image/png');});});
  $('share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);toast(t('copied'));}catch{$('share-fallback').hidden=false;$('share-url').value=location.href;$('share-url').select();}});
  window.__formsDiagnostics=()=>({ready:Boolean(applied),pending:document.body.dataset.pending==='true',renderer:document.body.dataset.renderer,config:applied?.metadata.parameters,requestedConfig:config,activeControls:activeParameters(config).map(s=>s.key),parts:applied?.metadata.parts.length,holes:applied?.metadata.holes.length,triangles:applied?.triangles,bounds:applied?.bounds,renderCount,view,wire,facades,look,materials:facadeMaterials?.diagnostics(),surfaceCoverage,gpu:renderer?.info.memory,roofJunctions:applied?.metadata.output.roof_wall_junctions,roofSeams:applied?.metadata.output.roof_wall_seam_audit,roofDetails:facadeDetail?.userData.stats,roofDetailsVisible:facadeDetail?.visible,roofConstruction:applied?.metadata.output.roof_construction,engine:ENGINE,revision});
  addEventListener('pagehide',()=>{clearTimeout(timer);worker?.terminate();resizeObserver?.disconnect();controls?.dispose();renderer?.setAnimationLoop(null);disposeModel();facadeMaterials?.dispose();disposeEnvironment?.();renderer?.dispose();});
  addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
}

const initialUrl=new URL(location.href);
if(initialUrl.searchParams.has('p')&&!initialUrl.searchParams.has('model')){initialUrl.pathname=initialUrl.pathname.replace(/(?:index\.html)?$/,'shape8.html');location.replace(initialUrl);}
else boot();
