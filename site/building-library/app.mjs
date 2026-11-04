import * as THREE from './vendor/three.module.js';
import {STLLoader} from './vendor/STLLoader.js';
import {MeshView} from './mesh-view.mjs';
import {canonicalBAGId,decodeCityJSON,surfaceAudit} from './cityjson.mjs';

const $=id=>document.getElementById(id),number=(x,d=1)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:d}).format(x);
let catalog=null,entry=null,view=null,currentRaw=null,currentBuffer=null,currentAudit=null;
let sourceFilter='all',query='',revision=0,active=null,busy=false,mode='snapshot',lastError='',renderReady=false;
let sourceDocument=null,onlineResult=null,toastTimer;
const stlLoader=new STLLoader(),cache=new Map();
const downloadButtons=['download-source','download-meta','download-vtp','download-h1','download-stl'];

function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function notice(text=''){$('notice').textContent=text;$('notice').hidden=!text;lastError=text;}
function loading(on,text='正在下载单栋几何…'){
  busy=on;$('loading').hidden=!on;$('loading-text').textContent=text;
  for(const name of downloadButtons)$(name).disabled=on||!entry;
  $('download-vtp').hidden=mode!=='snapshot';
  $('lod').disabled=on||mode!=='online';
}
function begin(text){active?.abort();active=new AbortController();const ticket=++revision;notice();loading(true,text);return {ticket,controller:active,signal:active.signal,start:performance.now()};}
async function fetchBytes(url,signal,max=16*1024*1024){
  const response=await fetch(url,{signal,credentials:'omit'});
  if(!response.ok)throw Error(response.status===404?'未找到该编号对应的数据（HTTP 404）':`下载失败（HTTP ${response.status}）`);
  if(Number(response.headers.get('Content-Length'))>max)throw Error('该文件超过单栋预览大小上限，请使用原始来源下载。');
  const reader=response.body.getReader(),chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;
    if(total>max){await reader.cancel();throw Error('该文件超过单栋预览大小上限。');}
    chunks.push(value);$('loading-text').textContent=`正在读取几何 · ${number(total/1024,0)} KB`;
  }
  const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return bytes.buffer;
}
async function checkHash(buffer,expected){
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==expected)throw Error('模型文件与索引校验值不一致，请刷新后重试。');
}
function filtered(){
  const height=$('height-filter').value;
  return catalog.samples.filter(x=>
    (sourceFilter==='all'||x.source===sourceFilter)&&
    (!query||[x.sample_id,x.source_id,x.building_id,x.region,JSON.stringify(x.attributes)].some(v=>String(v||'').toLowerCase().includes(query)))&&
    (height==='all'||height==='low'&&x.height_m<20||height==='mid'&&x.height_m>=20&&x.height_m<60||height==='high'&&x.height_m>=60))
    .sort((a,b)=>$('sort').value==='height'?b.height_m-a.height_m:$('sort').value==='faces'?b.triangles-a.triangles:a.sample_id.localeCompare(b.sample_id));
}
function renderList(){
  if(!catalog)return;const samples=filtered();$('result-count').textContent=`${samples.length} 栋`;
  if(!samples.length){const p=document.createElement('p');p.className='empty-list';p.textContent='当前筛选无已收录模型。完整 BAG 编号可尝试官方在线读取。';$('entries').replaceChildren(p);return;}
  $('entries').replaceChildren(...samples.map(sample=>{
    const button=document.createElement('button');button.className='entry'+(!sample.closed?' review':'');
    button.classList.toggle('selected',mode==='snapshot'&&entry?.sample_id===sample.sample_id);button.dataset.sample=sample.sample_id;
    button.setAttribute('aria-pressed',String(mode==='snapshot'&&entry?.sample_id===sample.sample_id));
    const id=document.createElement('span');id.className='entry-id';id.textContent=sample.sample_id;
    const main=document.createElement('span');main.className='entry-main';
    const line=document.createElement('strong');line.textContent=`${number(sample.height_m)} m · ${number(sample.triangles,0)} 面`;
    const sub=document.createElement('small');sub.textContent=sample.source+' · LoD '+sample.source_lod;
    const dot=document.createElement('span');dot.className='entry-quality';dot.title=sample.closed?'源记录：封闭边检查通过':'源记录：边拓扑需复核';
    main.append(line,sub);button.append(id,main,dot);button.addEventListener('click',()=>loadSnapshot(sample));return button;
  }));
}
function attributeLabel(attributes,key,fallback='未提供'){const value=attributes?.[key];return value===null||value===undefined||value===''?fallback:String(value);}
function updateInfo(){
  if(!entry)return;const attrs=entry.attributes||{};
  $('source-label').textContent=mode==='online'?'3DBAG / OFFICIAL API':'REAL BUILDING / SOURCE SNAPSHOT';
  $('model-title').textContent=entry.sample_id?`${entry.sample_id} · ${entry.source}`:`${entry.source} · ${entry.source_id.slice(-16)}`;
  $('model-subtitle').textContent=`${mode==='online'?'官方在线读取':'已收录快照'} · LoD ${entry.source_lod} · ${entry.region}`;
  $('object-id').textContent=entry.source_id;$('building-id').textContent=entry.building_id||'源数据未提供';
  const rows=[['数据源',entry.source],['本地编号',entry.sample_id||'未收录'],['发布集 / 快照',entry.region]];
  if(entry.source==='3DBAG'){
    const roof=attributeLabel(attrs,'b3_dak_type');const names={flat:'平屋顶',slanted:'斜屋顶',multiple:'多种屋面'};
    rows.push(['原库屋顶标签',names[roof]||roof],['建造年份',attributeLabel(attrs,'oorspronkelijkbouwjaar')],['点云年份',attributeLabel(attrs,'b3_pw_datum')]);
  }else{
    rows.push(['原库类别',attrs.class_description?`${attrs.class} · ${attrs.class_description}`:'未提供'],
      ['用途',attrs.usage_description?`${attrs.usage} · ${attrs.usage_description}`:'未提供'],['原库地上层数',attributeLabel(attrs,'storeysAboveGround')],['源行政区码',attributeLabel(attrs,'city_code')]);
  }
  $('facts').replaceChildren(...rows.map(([key,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;row.append(dt,dd);return row;}));
  const dims=view.dimensions();$('metric-width').textContent=number(dims[0]);$('metric-depth').textContent=number(dims[1]);$('metric-height').textContent=number(dims[2]);
  $('metric-faces').textContent=number(view.geometry.getAttribute('position').count/3,0);$('metric-components').textContent=String(entry.components??currentAudit.components);
  $('height-max').textContent=number(dims[2]);
  const q=$('quality');q.classList.toggle('review',!entry.closed);
  q.querySelector('strong').textContent=entry.closed?(mode==='online'?'浏览器转换：封闭边检查通过':'源几何：封闭边检查通过'):'边拓扑需进一步复核';
  q.querySelector('p').textContent=mode==='online'?`边界边 ${currentAudit.boundary_edges} · 定向冲突 ${currentAudit.winding_conflicts}；自交 / CFD 网格未验收。`:'源几何完整保留；自交及 CFD 网格未在本页验收。';
  $('attribute-json').textContent=JSON.stringify(attrs,null,2);
  $('source-link').href=entry.source_url;$('source-link').textContent=entry.source==='PLATEAU'?'官方 CityGML · 约128 MiB ↗':'官方建筑数据 ↗';
  $('dataset-link').href=entry.source==='PLATEAU'?catalog.source_links.plateau_dataset:catalog.source_links['3dbag'];
  $('download-source').textContent=entry.source==='PLATEAU'?'CityGML 片段 ↓':mode==='online'?'API JSON ↓':'CityJSON ↓';
  const lods=mode==='online'?onlineResult.availableLods:[String(entry.source_lod)];
  $('lod').replaceChildren(...lods.map(lod=>{const option=document.createElement('option');option.value=lod;option.textContent='LoD '+lod;return option;}));
  $('lod').value=String(entry.source_lod);
  loading(false);renderList();renderReady=true;
}
function commit(geometry,next,raw,buffer,nextMode,audit){
  view.setGeometry(geometry);entry=next;currentRaw=raw;currentBuffer=buffer;mode=nextMode;currentAudit=audit;
  updateInfo();notice();
}
function failure(error,request){
  if(request.ticket!==revision||error.name==='AbortError')return;
  notice(error.message+(entry?`；仍显示 ${entry.sample_id||entry.source_id}。`:'。'));
  loading(false);
}
async function loadSnapshot(sample){
  const request=begin(`正在读取 ${sample.sample_id} · 单栋几何`);
  try{
    let buffer=cache.get(sample.sample_id);
    if(!buffer){buffer=await fetchBytes(new URL(sample.model,import.meta.url),request.signal);await checkHash(buffer,sample.model_sha256);cache.set(sample.sample_id,buffer);}
    if(request.ticket!==revision)return;
    $('loading-text').textContent='正在构建三维表面…';
    const geometry=stlLoader.parse(buffer.slice(0));const audit=surfaceAudit(geometry);
    sourceDocument=null;onlineResult=null;commit(geometry,sample,null,buffer,'snapshot',audit);
    $('load-summary').textContent=`${sample.sample_id} · ${number(buffer.byteLength/1024)} KB · 本站来源快照 · ${number((performance.now()-request.start)/1000,2)} s`;
  }catch(error){failure(error,request);}
}
function buildOnlineDocument(document,id,lod='best'){
  const decoded=decodeCityJSON(document,lod);
  const alias=catalog.samples.find(x=>x.source_id===id);
  const next={sample_id:alias?.sample_id||null,source:'3DBAG',source_id:decoded.source_id,
    building_id:id.slice(-16),source_lod:decoded.lod,region:'BAG 发号市镇 '+id.slice(-16,-12),
    source_crs:decoded.crs,origin_m:decoded.origin,dimensions_m:decoded.dimensions,height_m:decoded.dimensions[2],
    source_polygons:decoded.source_polygons,triangles:decoded.audit.triangles,components:decoded.audit.components,
    closed:decoded.audit.closed,attributes:decoded.attributes,source_url:'https://api.3dbag.nl/collections/pand/items/'+id,
    self_intersections_checked:false,cfd_accepted:false,training_eligible:false,
    conversion:'Browser CityJSON display conversion; original rings and holes retained; no geometry repair.',
    format_version:decoded.format_version};
  onlineResult=decoded;commit(decoded.geometry,next,document,null,'online',decoded.audit);
}
async function loadOnline(input){
  const id=canonicalBAGId(input);
  if(!id){notice('请输入 16 位 BAG 编号或 NL.IMBAG.Pand. 开头的建筑 ID。PLATEAU 当前请从已收录编号中选择。');return;}
  const request=begin('正在请求 3DBAG 官方 API…');
  const timeout=setTimeout(()=>request.controller.abort(),25000);
  try{
    const buffer=await fetchBytes('https://api.3dbag.nl/collections/pand/items/'+id,request.signal,8*1024*1024);
    if(request.ticket!==revision)return;
    const document=JSON.parse(new TextDecoder().decode(buffer));
    buildOnlineDocument(document,id);sourceDocument=document;
    $('load-summary').textContent=`官方 API · ${number(buffer.byteLength/1024)} KB · ${number((performance.now()-request.start)/1000,2)} s`;
  }catch(error){if(error.name==='AbortError'&&request.ticket===revision)error=new Error('请求超时或已取消，请稍后重试');failure(error,request);}
  finally{clearTimeout(timeout);}
}
function findEntry(text){const q=text.trim().toLowerCase();return catalog.samples.find(x=>[x.sample_id,x.source_id,x.building_id].some(v=>String(v||'').toLowerCase()===q));}
function lookup(){
  const value=$('lookup').value.trim(),sample=findEntry(value);
  if(sample){loadSnapshot(sample);return;}
  const failed=catalog.failed_samples.find(x=>x.sample_id.toLowerCase()===value.toLowerCase());
  if(failed){notice(`${failed.sample_id} 的源轮廓未通过转换，未生成替代模型。原始 ID：${failed.source_id}`);return;}
  if(canonicalBAGId(value)){loadOnline(value);return;}
  notice(value?'此编号不在当前已收录索引中。PLATEAU 需结合城市、年度和瓦片定位，不能仅凭 UUID 判断建筑不存在。':'请输入本地编号或原始建筑 ID，也可在列表中选择。');
}
function save(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('已准备下载');}
function saveURL(url,name){const a=document.createElement('a');a.href=url;a.download=name;a.click();}
function metadata(){return {...entry,viewer_mode:mode,units:'metres',up_axis:'Z',preview_surface_check:currentAudit,
  download_note:'STL is local metric float32; VTP retains source-library precision. H=1 is isotropic normalization only.',training_eligible:false};}
async function exportSTL(normalize=false){
  if(!entry||busy)return;
  if(!normalize&&mode==='snapshot'){saveURL(entry.model,entry.sample_id+'.stl');return;}
  const {STLExporter}=await import('./vendor/exporters/STLExporter.js');
  const mesh=new THREE.Mesh(view.geometry,new THREE.MeshBasicMaterial());
  if(normalize){const h=view.dimensions()[2];mesh.scale.setScalar(1/h);}
  mesh.updateMatrixWorld(true);
  const bytes=new STLExporter().parse(mesh,{binary:true});mesh.material.dispose();
  save(new Blob([bytes],{type:'application/octet-stream'}),`${entry.sample_id||entry.source_id}${normalize?'-H1':''}.stl`);
}

$('lookup-form').addEventListener('submit',event=>{event.preventDefault();lookup();});
$('lookup').addEventListener('input',()=>{query=$('lookup').value.trim().toLowerCase();renderList();});
$('height-filter').addEventListener('change',renderList);$('sort').addEventListener('change',renderList);
document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('click',()=>{
  sourceFilter=button.dataset.source;query='';$('lookup').value='';
  document.querySelectorAll('[data-source]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
  renderList();const first=filtered()[0];if(first&&(sourceFilter!=='all'&&entry?.source!==sourceFilter))loadSnapshot(first);
}));
$('load-online').addEventListener('click',()=>{
  const value=$('lookup').value.trim(),sample=findEntry(value);
  loadOnline(sample?.source==='3DBAG'?sample.source_id:canonicalBAGId(value)||(!value&&entry?.source==='3DBAG'?entry.source_id:value));
});
$('try-online').addEventListener('click',()=>{$('lookup').value='0503100000032914';query='';renderList();loadOnline($('lookup').value);});
$('lod').addEventListener('change',()=>{
  if(mode!=='online'||!sourceDocument)return;
  try{const id=entry.source_id;buildOnlineDocument(sourceDocument,id,$('lod').value);$('load-summary').textContent='已下载的官方数据 · 切换 LoD，无额外网络请求';}
  catch(error){notice(error.message);}
});
$('copy-id').addEventListener('click',async()=>{if(!entry)return;try{await navigator.clipboard.writeText(entry.source_id);toast('已复制原始 ID');}catch{const range=document.createRange();range.selectNodeContents($('object-id'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);toast('已选中原始 ID，可手动复制');}});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>view?.fit(button.dataset.view)));
$('reset-view').addEventListener('click',()=>view?.fit('iso'));
$('wireframe').addEventListener('click',()=>{if(!view)return;view.setWire(!view.wire);$('wireframe').setAttribute('aria-pressed',String(view.wire));});
$('height-color').addEventListener('click',()=>{if(!view)return;view.setColor(!view.colored);$('height-color').setAttribute('aria-pressed',String(view.colored));$('height-legend').hidden=!view.colored;});
$('rotate').addEventListener('click',()=>{if(!view)return;view.controls.autoRotate=!view.controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(view.controls.autoRotate));});
$('screenshot').addEventListener('click',()=>view?.screenshot(blob=>{if(blob)save(blob,`${entry?.sample_id||'building'}-view.png`);}));
$('download-stl').addEventListener('click',()=>exportSTL().catch(error=>notice('导出失败：'+error.message)));$('download-h1').addEventListener('click',()=>exportSTL(true).catch(error=>notice('导出失败：'+error.message)));
$('download-meta').addEventListener('click',()=>{if(entry)save(new Blob([JSON.stringify(metadata(),null,2)+'\n'],{type:'application/json'}),`${entry.sample_id||entry.source_id}-metadata.json`);});
$('download-vtp').addEventListener('click',()=>{if(entry?.vtp)saveURL(entry.vtp,entry.sample_id+'.vtp');});
$('download-source').addEventListener('click',()=>{
  if(mode==='snapshot')saveURL(entry.original,entry.sample_id+(entry.source==='PLATEAU'?'.gml':'.city.json'));
  else save(new Blob([JSON.stringify(currentRaw,null,2)+'\n'],{type:'application/json'}),entry.source_id+'.api.json');
});
const mobile=matchMedia('(max-width:620px)');function foldList(){$('sample-list').open=!mobile.matches;}mobile.addEventListener('change',foldList);foldList();
window.__buildingLibrary=()=>({ready:renderReady,busy,mode,sample_id:entry?.sample_id,source:entry?.source,source_id:entry?.source_id,
  building_id:entry?.building_id,lod:entry?.source_lod,dimensions:view?.dimensions(),triangles:view?.geometry?.getAttribute('position').count/3,
  audit:currentAudit,attributes:entry?.attributes,revision,error:lastError,renderCount:view?.renderCount||0,
  view:view?.mode,wire:view?.wire,heightColor:view?.colored,sourceCount:catalog?.samples.length,visibleCount:catalog?filtered().length:0});

async function boot(){
  loading(true,'正在读取几何索引…');
  try{
    const response=await fetch(new URL('./assets/catalog.json',import.meta.url));if(!response.ok)throw Error('几何索引读取失败');catalog=await response.json();
    renderList();view=new MeshView($('scene'),$('stage'),$('plan'));
    const initial=new URLSearchParams(location.search).get('id');
    if(initial){loading(false);$('lookup').value=initial;lookup();}else await loadSnapshot(catalog.samples.find(x=>x.sample_id==='B01'));
  }catch(error){notice('查看器初始化失败：'+error.message);loading(false);}
}
boot();
