import * as THREE from './vendor/three.module.js';
import {STLLoader} from './vendor/STLLoader.js';
import {MeshView} from './mesh-view.mjs';
import {surfaceAudit} from './surface-audit.mjs';

const $=id=>document.getElementById(id),number=(x,d=1)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:d}).format(x);
const stlLoader=new STLLoader(),cache=new Map(),layers=new Map();
const downloadButtons=['download-source','download-meta','download-vtp','download-h1','download-stl'];
let catalog=null,entry=null,view=null,map=null,footprintLayer=null,tiles=null;
let busy=false,ready=false,revision=0,active=null,currentAudit=null,lastError='',query='',toastTimer,basemapOn=true;
let footprintFeatures=[],tileLoads=0,tileErrors=0;
const parameters=new URLSearchParams(location.search);
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2500);}
function notice(text=''){$('notice').textContent=text;$('notice').hidden=!text;lastError=text;}
function loading(on,text='正在读取所选建筑…'){
  busy=on;$('loading').hidden=!on;$('loading-text').textContent=text;
  for(const id of downloadButtons)$(id).disabled=on||!entry;
  $('download-vtp').hidden=!entry?.vtp;
}
async function fetchBytes(url,signal,max=16*1024*1024){
  const response=await fetch(url,{signal,credentials:'omit'});
  if(!response.ok)throw Error(`文件读取失败（HTTP ${response.status}）`);
  if(Number(response.headers.get('Content-Length'))>max)throw Error('该建筑超过单栋预览大小上限，请下载源文件。');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>max)throw Error('文件超过单栋预览大小上限。');return bytes;
}
async function checkHash(buffer,expected){
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  const actual=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw Error('模型文件与索引不一致，请刷新后重试。');
}
function inHeight(height){const range=$('height-filter').value;return range==='all'||range==='low'&&height<20||range==='mid'&&height>=20&&height<60||range==='high'&&height>=60;}
function filtered(){return catalog.samples.filter(s=>inHeight(s.height_m)&&(!query||[s.sample_id,s.source_id,s.building_id,s.attributes.usage_description].some(v=>String(v||'').toLowerCase().includes(query))));}
function renderList(){
  if(!catalog)return;const list=filtered();$('result-count').textContent=`${list.length} 栋`;
  const nodes=list.slice(0,60).map(sample=>{
    const button=document.createElement('button');button.className='entry';button.dataset.sample=sample.sample_id;
    button.classList.toggle('selected',entry?.source_id===sample.source_id);button.setAttribute('aria-pressed',String(entry?.source_id===sample.source_id));
    const name=document.createElement('strong');name.textContent=sample.sample_id;
    const id=document.createElement('span');id.textContent=sample.building_id||sample.source_id;
    const height=document.createElement('small');height.textContent=number(sample.height_m)+' m';
    button.append(name,id,height);button.addEventListener('click',()=>selectBuilding(sample,{focus:true,scroll:true}));return button;
  });
  if(list.length>60||!list.length){const note=document.createElement('p');note.className='empty-list';note.textContent=list.length?'列表显示前 60 栋。可在地图点选，或输入编号进一步筛选。':'当前筛选无结果，可清空条件后在地图选取。';nodes.push(note);}
  $('entries').replaceChildren(...nodes);
}
function baseStyle(feature){const props=feature.properties,chosen=entry?.source_id===props.source_id;
  return {color:chosen?'#a45c41':props.preview_available?'#6e8d9f':'#9da5ac',weight:chosen?2.5:1,
    fillColor:chosen?'#c48662':props.preview_available?'#8faebf':'#c7ccd0',fillOpacity:chosen ? 0.78 : 0.58,
    dashArray:props.preview_available?null:'3 3'};
}
function refreshMap(){
  footprintLayer?.eachLayer(layer=>layer.setStyle(baseStyle(layer.feature)));
  const selected=layers.get(entry?.source_id);selected?.bringToFront();
  const visible=footprintFeatures.filter(f=>inHeight(f.properties.height_m));
  $('map-count').textContent=`${visible.length} 栋轮廓 · ${catalog.stats.preview_available} 栋可预览`;
}
function renderFootprints(){
  if(!map)return;
  if(footprintLayer)map.removeLayer(footprintLayer);layers.clear();
  footprintLayer=L.geoJSON(footprintFeatures.filter(f=>inHeight(f.properties.height_m)),{
    style:baseStyle,onEachFeature(feature,layer){
      const sample=catalog.samples.find(s=>s.source_id===feature.id);if(!sample)return;layers.set(feature.id,layer);
      const tip=document.createElement('div');tip.textContent=`${sample.sample_id} · ${sample.building_id||'PLATEAU'} · ${number(sample.height_m)} m`;
      layer.bindTooltip(tip,{sticky:true,direction:'top'});
      layer.on('click',()=>selectBuilding(sample,{scroll:true}));
      layer.on('mouseover',()=>{if(entry?.source_id!==feature.id)layer.setStyle({weight:2,fillOpacity:.8});});
      layer.on('mouseout',()=>layer.setStyle(baseStyle(feature)));
      layer.on('add',()=>{const path=layer.getElement();if(path){path.dataset.building=sample.sample_id;path.setAttribute('role','button');path.setAttribute('aria-label',`${sample.sample_id}，${number(sample.height_m)}米，点击预览三维`);}});
    }
  }).addTo(map);refreshMap();
}
function toggleBasemap(on){
  if(!map||!tiles)return;
  basemapOn=on;$('basemap').setAttribute('aria-pressed',String(on));
  if(on&&!map.hasLayer(tiles))tiles.addTo(map);if(!on&&map.hasLayer(tiles))map.removeLayer(tiles);
  if(!on)$('basemap-status').hidden=true;
}
function focusBuilding(sample=entry){
  if(!sample?.map_bounds)return;
  map.fitBounds(sample.map_bounds,{padding:[45,45],maxZoom:19,animate:false});
}
function initMap(geojson){
  map=L.map('map',{zoomControl:true,scrollWheelZoom:true,minZoom:12,maxZoom:22,zoomSnap:0.25,zoomDelta:0.5,zoomAnimation:false,fadeAnimation:false});
  map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>');
  tiles=L.tileLayer(catalog.map.tiles,{maxNativeZoom:18,maxZoom:22,keepBuffer:1,updateWhenIdle:true,
    attribution:'出典：<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'});
  tiles.on('tileload',()=>{tileLoads++;$('basemap-status').hidden=true;});
  tiles.on('tileerror',()=>{tileErrors++;if(basemapOn&&tileLoads===0&&tileErrors>=3)$('basemap-status').hidden=false;});
  footprintFeatures=geojson.features;renderFootprints();
  map.fitBounds(catalog.map.bounds,{padding:[20,20],animate:false});
  toggleBasemap(parameters.get('basemap')!=='off');
  new ResizeObserver(()=>map.invalidateSize({animate:false})).observe($('map'));
}
function attr(key,fallback='未提供'){const value=entry.attributes[key];return value===null||value===undefined||value===''?fallback:String(value);}
function updateInfo(){
  $('model-title').textContent=`${entry.sample_id} · PLATEAU`;
  $('model-subtitle').textContent=`LoD ${entry.source_lod} · ${entry.building_id||'源记录未提供建筑 ID'}`;
  $('object-id').textContent=entry.source_id;$('building-id').textContent=entry.building_id||'源数据未提供';
  const attrs=entry.attributes;
  const rows=[['发布集 / 年度','千代田区发布集 / 2023'],['源行政区码',attr('city_code')],['地理瓦片','53394509'],
    ['原库类别',attrs.class_description?`${attrs.class} · ${attrs.class_description}`:attr('class')],
    ['用途',attrs.usage_description?`${attrs.usage} · ${attrs.usage_description}`:attr('usage')],
    ['原库地上层数',attr('storeysAboveGround')],['轮廓来源',entry.footprint_source||'未提供']];
  $('facts').replaceChildren(...rows.map(([label,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);return row;}));
  const dims=view.dimensions();$('metric-width').textContent=number(dims[0]);$('metric-depth').textContent=number(dims[1]);$('metric-height').textContent=number(dims[2]);
  $('metric-faces').textContent=number(currentAudit.triangles,0);$('metric-components').textContent=String(currentAudit.components);$('height-max').textContent=number(dims[2]);
  $('quality').classList.toggle('review',!entry.closed);
  $('quality').querySelector('strong').textContent=entry.closed?'源几何：封闭边检查通过':'源几何：边拓扑需复核';
  $('quality').querySelector('p').textContent='未进行额外补洞、平滑或简化；自交与 CFD 网格未在本页验收。';
  $('attribute-json').textContent=JSON.stringify(attrs,null,2);$('source-link').href=entry.source_url;$('dataset-link').href=catalog.source_links.plateau_dataset;
  $('download-source').textContent=entry.original_compressed?'CityGML.gz ↓':'CityGML ↓';
  $('map-selection').textContent=`已选 ${entry.sample_id} · ${entry.building_id||entry.source_id} · 几何高度 ${number(dims[2])} m`;
  loading(false);renderList();refreshMap();ready=true;
}
async function selectBuilding(sample,{focus=false,scroll=false}={}){
  active?.abort();const controller=new AbortController();active=controller;const ticket=++revision;notice();
  if(!sample.preview_available){loading(false);notice(`此源几何未通过转换：${sample.conversion_error||'待复核'}。仍保留当前预览。`);return;}
  loading(true,`正在读取 ${sample.sample_id} · 三维几何…`);
  const started=performance.now();
  try{
    let bytes=cache.get(sample.source_id);
    if(!bytes){bytes=await fetchBytes(new URL(sample.model,import.meta.url),controller.signal);await checkHash(bytes,sample.model_sha256);cache.set(sample.source_id,bytes);}
    if(ticket!==revision)return;
    const geometry=stlLoader.parse(bytes.slice(0)),audit=surfaceAudit(geometry);
    view.setGeometry(geometry);entry=sample;currentAudit=audit;updateInfo();
    $('load-summary').textContent=`${sample.sample_id} · ${number(bytes.byteLength/1024)} KB · ${number((performance.now()-started)/1000,2)} s`;
    const url=new URL(location.href);url.searchParams.set('id',sample.sample_id);history.replaceState(null,'',url);
    if(focus){if(!inHeight(sample.height_m)){$('height-filter').value='all';renderFootprints();}focusBuilding(sample);}
    if(scroll&&matchMedia('(max-width:760px)').matches)$('preview').scrollIntoView({block:'start',behavior:'instant'});
  }catch(error){
    if(ticket!==revision||error.name==='AbortError')return;
    loading(false);notice(error.message+(entry?`；仍显示 ${entry.sample_id}。`:'。'));
  }
}
function findEntry(value){const q=value.trim().toLowerCase();return catalog?.samples.find(s=>[s.sample_id,s.source_id,s.building_id].some(v=>String(v||'').toLowerCase()===q));}
function lookup(){const value=$('lookup').value.trim(),sample=findEntry(value);if(sample){selectBuilding(sample,{focus:true,scroll:true});return;}notice(value?'当前瓦片未收录此编号。请清空检索条件，在地图点选建筑。':'直接点选地图中的有色轮廓即可查看，也可输入 P18 等本地编号。');}
function save(blob,name){const anchor=document.createElement('a'),url=URL.createObjectURL(blob);anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('已准备下载');}
function saveURL(url,name){const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();}
async function exportSTL(normalize=false){
  if(!entry||busy)return;if(!normalize){saveURL(entry.model,entry.sample_id+'.stl');return;}
  const {STLExporter}=await import('./vendor/exporters/STLExporter.js');
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(view.geometry,material);mesh.scale.setScalar(1/view.dimensions()[2]);mesh.updateMatrixWorld(true);
  const bytes=new STLExporter().parse(mesh,{binary:true});material.dispose();save(new Blob([bytes],{type:'application/octet-stream'}),entry.sample_id+'-H1.stl');
}
$('fit-map').addEventListener('click',()=>map?.fitBounds(catalog.map.bounds,{padding:[20,20],animate:false}));
$('focus-building').addEventListener('click',()=>{if(entry&&!inHeight(entry.height_m)){$('height-filter').value='all';renderFootprints();renderList();}focusBuilding();});
$('basemap').addEventListener('click',()=>toggleBasemap(!basemapOn));
$('back-map').addEventListener('click',()=>$('map').scrollIntoView({block:'start',behavior:'instant'}));
$('height-filter').addEventListener('change',()=>{renderFootprints();renderList();});
$('lookup-form').addEventListener('submit',event=>{event.preventDefault();lookup();});
$('lookup').addEventListener('input',()=>{query=$('lookup').value.trim().toLowerCase();renderList();});
$('copy-id').addEventListener('click',async()=>{if(!entry)return;try{await navigator.clipboard.writeText(entry.source_id);toast('已复制原始 ID');}catch{const range=document.createRange();range.selectNodeContents($('object-id'));getSelection().removeAllRanges();getSelection().addRange(range);toast('已选中原始 ID，可手动复制');}});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>view?.fit(button.dataset.view)));
$('reset-view').addEventListener('click',()=>view?.fit('iso'));
$('wireframe').addEventListener('click',()=>{if(view){view.setWire(!view.wire);$('wireframe').setAttribute('aria-pressed',String(view.wire));}});
$('height-color').addEventListener('click',()=>{if(view){view.setColor(!view.colored);$('height-color').setAttribute('aria-pressed',String(view.colored));$('height-legend').hidden=!view.colored;}});
$('rotate').addEventListener('click',()=>{if(view){view.controls.autoRotate=!view.controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(view.controls.autoRotate));}});
$('screenshot').addEventListener('click',()=>view?.screenshot(blob=>{if(blob)save(blob,`${entry?.sample_id||'building'}-view.png`);}));
$('download-stl').addEventListener('click',()=>exportSTL().catch(error=>notice(error.message)));
$('download-h1').addEventListener('click',()=>exportSTL(true).catch(error=>notice(error.message)));
$('download-vtp').addEventListener('click',()=>{if(entry?.vtp)saveURL(entry.vtp,entry.sample_id+'.vtp');});
$('download-source').addEventListener('click',()=>{if(entry&&!busy)saveURL(entry.original,entry.sample_id+(entry.original_compressed?'.gml.gz':'.gml'));});
$('download-meta').addEventListener('click',()=>{if(entry&&!busy)save(new Blob([JSON.stringify({...entry,units:'metres',up_axis:'Z',preview_surface_check:currentAudit,training_eligible:false},null,2)+'\n'],{type:'application/json'}),entry.sample_id+'-metadata.json');});
window.__buildingLibrary=()=>({ready,busy,mode:'plateau-map',sample_id:entry?.sample_id,source:entry?.source,source_id:entry?.source_id,
  building_id:entry?.building_id,attributes:entry?.attributes,dimensions:view?.dimensions(),triangles:currentAudit?.triangles,audit:currentAudit,
  sourceCount:catalog?.samples.length,footprintCount:footprintFeatures.length,mapLayers:layers.size,mapSelected:entry?.source_id,
  basemapOn,tileLoads,tileErrors,mapZoom:map?.getZoom(),mapCenter:map?.getCenter(),revision,error:lastError,
  view:view?.mode,wire:view?.wire,heightColor:view?.colored,renderCount:view?.renderCount||0,
  visibleCount:catalog?filtered().length:0});
window.__buildingMapPoint=(lat,lon)=>{if(!map)return null;const point=map.latLngToContainerPoint([lat,lon]),rect=$('map').getBoundingClientRect();return {x:rect.left+point.x,y:rect.top+point.y,inside:point.x>=0&&point.x<rect.width&&point.y>=0&&point.y<rect.height};};
async function boot(){
  loading(true,'正在读取 PLATEAU 建筑地图…');
  try{
    const response=await fetch(new URL('./assets/catalog.json',import.meta.url));if(!response.ok)throw Error('建筑索引读取失败');catalog=await response.json();
    const footprints=await fetch(new URL(catalog.map.footprints,import.meta.url));if(!footprints.ok)throw Error('地图轮廓读取失败');
    initMap(await footprints.json());view=new MeshView($('scene'),$('stage'),$('plan'));
    $('total-count').textContent=number(catalog.stats.buildings,0);
    $('coverage-note').textContent=`东京 2023 · 瓦片 53394509。共 ${catalog.stats.buildings} 栋，${catalog.stats.preview_available} 栋可预览；三维模型按点选加载。此处不是日本全国索引。`;
    renderList();const initial=parameters.get('id'),sample=initial?findEntry(initial):catalog.samples.find(s=>s.sample_id==='P01')||catalog.samples[0];
    if(sample)await selectBuilding(sample,{focus:Boolean(initial)});else{loading(false);notice('此编号不在当前 PLATEAU 瓦片中，请直接在地图选建筑。');}
  }catch(error){loading(false);notice('查看器初始化失败：'+error.message);}
}
boot();
