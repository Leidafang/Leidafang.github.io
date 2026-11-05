export const VERSION='architectural-forms-o2w-v1';
export const ENGINE='OSM2World 0.5.0-SNAPSHOT / 2026-02-18';
export const FAMILIES=[
  {id:'bar',zh:'板式 / 独立主体',en:'Bar / single volume'},
  {id:'l',zh:'L 形翼楼',en:'L-shaped wings'},
  {id:'u',zh:'U 形围合',en:'U-shaped wings'},
  {id:'court',zh:'带内庭院',en:'Courtyard'},
  {id:'podium',zh:'塔楼 + 裙房',en:'Tower + podium'},
  {id:'twin',zh:'双塔 + 裙房',en:'Twin towers + podium'}
];
export const ROOFS=[{id:'flat',zh:'平屋顶',en:'Flat'},{id:'gabled',zh:'双坡屋顶',en:'Gable'},{id:'hipped',zh:'四坡屋顶',en:'Hip'},{id:'skillion',zh:'单坡屋顶',en:'Shed'}];
const spec=(key,zh,en,symbol,min,max,step,group)=>({key,zh,en,symbol,min,max,step,group});
export const PARAMETERS=[
  spec('width','整体宽高比','Overall width / height','L / H',.50,2.80,.01,0),
  spec('depth','整体深高比','Overall depth / height','D / H',.30,1.90,.01,0),
  spec('chamfer','转角切角比例','Corner chamfer ratio','r / min(L,D)',0,.16,.01,0),
  spec('leftWidth','左翼相对宽度','Left wing width','wₗ / L',.14,.38,.01,1),
  spec('rightWidth','右翼相对宽度','Right wing width','wᵣ / L',.14,.38,.01,1),
  spec('crossDepth','连接翼进深','Cross-wing depth','d꜀ / D',.16,.42,.01,1),
  spec('rightReach','右翼伸出长度','Right wing length','lᵣ / D',.55,1,.01,1),
  spec('leftHeight','左翼高度','Left wing height','hₗ / H',.55,1,.01,1),
  spec('rightHeight','右翼高度','Right wing height','hᵣ / H',.55,1,.01,1),
  spec('courtWidth','庭院相对宽度','Courtyard width','L꜀ / L',.28,.65,.01,1),
  spec('courtDepth','庭院相对进深','Courtyard depth','D꜀ / D',.28,.65,.01,1),
  spec('courtX','庭院横向偏移','Courtyard X offset','Δx / available',-.8,.8,.01,1),
  spec('courtY','庭院纵向偏移','Courtyard Y offset','Δy / available',-.8,.8,.01,1),
  spec('podiumHeight','裙房高度','Podium height','hₚ / H',.10,.32,.01,1),
  spec('towerWidth','塔楼相对宽度','Tower width','Lₜ / L',.24,.62,.01,2),
  spec('towerDepth','塔楼相对进深','Tower depth','Dₜ / D',.28,.78,.01,2),
  spec('towerX','塔楼横向偏移','Tower X offset','Δx / available',-.85,.85,.01,2),
  spec('towerY','塔楼纵向偏移','Tower Y offset','Δy / available',-.85,.85,.01,2),
  spec('twinWidth','单塔相对宽度','Width of each tower','Lₜ / L',.18,.30,.01,2),
  spec('towerGap','两塔净间距','Clear tower separation','s / L',.08,.25,.01,2),
  spec('secondHeight','第二塔高度','Second tower height','h₂ / H',.60,.95,.01,2),
  spec('roofRise','屋顶高度占比','Roof rise','hᵣₒₒꜰ / H',.05,.26,.01,3),
  spec('roofDirection','屋面方向','Roof direction','α',0,180,1,3)
];
export const defaults=Object.freeze({family:'podium',roof:'flat',width:1.40,depth:.95,chamfer:0,leftWidth:.25,rightWidth:.23,crossDepth:.26,rightReach:.90,leftHeight:.82,rightHeight:.92,courtWidth:.54,courtDepth:.52,courtX:0,courtY:0,podiumHeight:.18,towerWidth:.40,towerDepth:.52,towerX:.26,towerY:-.18,twinWidth:.25,towerGap:.18,secondHeight:.78,roofRise:.17,roofDirection:90});
export const PRESETS=[
  {id:'office',zh:'偏心塔楼与裙房',en:'Offset office tower',floors:14,values:{...defaults}},
  {id:'slab',zh:'板式住宅',en:'Residential slab',floors:10,values:{...defaults,family:'bar',width:1.40,depth:.34,chamfer:0}},
  {id:'l-wings',zh:'L 形公共建筑',en:'L-shaped public building',floors:7,values:{...defaults,family:'l',width:1.40,depth:1.05,leftWidth:.23,crossDepth:.28,leftHeight:.77}},
  {id:'u-wings',zh:'U 形围合建筑',en:'U-shaped building',floors:6,values:{...defaults,family:'u',width:1.45,depth:1.12,leftWidth:.22,rightWidth:.24,crossDepth:.28,rightReach:.90,leftHeight:.85,rightHeight:.94}},
  {id:'courtyard',zh:'内庭院建筑',en:'Courtyard block',floors:5,values:{...defaults,family:'court',width:1.75,depth:1.35,courtWidth:.53,courtDepth:.50,courtX:.14,courtY:.04}},
  {id:'twins',zh:'双塔综合体',en:'Twin-tower complex',floors:16,values:{...defaults,family:'twin',width:1.75,depth:1.02,twinWidth:.25,towerGap:.18,towerDepth:.52,towerY:.10,podiumHeight:.16,secondHeight:.79}},
  {id:'house',zh:'双坡屋顶住宅',en:'Gabled residence',floors:3,values:{...defaults,family:'bar',roof:'gabled',width:1.85,depth:1.15,roofRise:.25,roofDirection:90}},
  {id:'hip',zh:'四坡屋顶办公楼',en:'Hip-roof office',floors:4,values:{...defaults,family:'bar',roof:'hipped',width:1.65,depth:1.05,roofRise:.19,roofDirection:90,chamfer:0}}
];

export function normalizeConfig(input={}){
  const p={...defaults,...input};
  if(!FAMILIES.some(f=>f.id===p.family)||!ROOFS.some(r=>r.id===p.roof))throw Error('Unknown building structure or roof');
  if(p.family==='court'&&p.roof==='hipped')throw Error('Courtyard hip roof is not included in this verified preview');
  for(const s of PARAMETERS){
    if(p[s.key]===null||p[s.key]===''||typeof p[s.key]==='boolean')throw Error(`Invalid ${s.key}`);
    p[s.key]=Number(p[s.key]);if(!Number.isFinite(p[s.key])||p[s.key]<s.min-1e-9||p[s.key]>s.max+1e-9)throw Error(`Outside range: ${s.key}`);
  }
  return Object.fromEntries(['family','roof',...PARAMETERS.map(s=>s.key)].map(k=>[k,p[k]]));
}

export const availableRoofs=family=>ROOFS.filter(r=>family!=='court'||r.id!=='hipped');

export function activeParameters(input){
  const p=normalizeConfig(input),keys=['width','depth'];
  if(p.family==='bar')keys.push('chamfer');
  if(p.family==='l')keys.push('leftWidth','crossDepth');
  if(p.family==='u')keys.push('leftWidth','rightWidth','crossDepth','rightReach');
  if(p.family==='l'&&p.roof==='flat')keys.push('leftHeight');
  if(p.family==='u'&&p.roof==='flat')keys.push('leftHeight','rightHeight');
  if(p.family==='court')keys.push('courtWidth','courtDepth','courtX','courtY');
  if(['podium','twin'].includes(p.family))keys.push('podiumHeight','towerDepth','towerY');
  if(p.family==='podium')keys.push('towerWidth','towerX');
  if(p.family==='twin')keys.push('twinWidth','towerGap','secondHeight');
  if(p.roof!=='flat')keys.push('roofRise');
  if(['gabled','skillion'].includes(p.roof))keys.push('roofDirection');
  return PARAMETERS.filter(s=>keys.includes(s.key));
}

export function deriveBuilding(input={}){
  const p=normalizeConfig(input),w=p.width,d=p.depth,x=-w/2,y=-d/2;
  const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  const outer=rectangle(x,y,x+w,y+d),holes=[],parts=[];
  let outline=outer;
  const add=(id,poly,height=1,base=0,roof=p.roof)=>parts.push({id,outer:poly,holes:[],height,base,roof,roofRise:roof==='flat'?0:Math.min(p.roofRise,height*.35),roofDirection:p.roofDirection});
  if(p.family==='bar'){
    const c=Math.min(w,d)*p.chamfer;
    outline=c?[[x+c,y],[x+w-c,y],[x+w,y+c],[x+w,y+d-c],[x+w-c,y+d],[x+c,y+d],[x,y+d-c],[x,y+c]]:outer;
    add('main',outline);
  }else if(p.family==='l'){
    const a=w*p.leftWidth,b=d*p.crossDepth;
    outline=[[x,y],[x+w,y],[x+w,y+b],[x+a,y+b],[x+a,y+d],[x,y+d]];
    if(p.roof==='flat'){
      add('main',rectangle(x,y,x+w,y+b));add('left-wing',rectangle(x,y+b,x+a,y+d),p.leftHeight);
    }else add('main',outline);
  }else if(p.family==='u'){
    const a=w*p.leftWidth,b=w*p.rightWidth,c=d*p.crossDepth,r=d*p.rightReach;
    outline=[[x,y],[x+w,y],[x+w,y+r],[x+w-b,y+r],[x+w-b,y+c],[x+a,y+c],[x+a,y+d],[x,y+d]];
    if(p.roof==='flat'){
      add('main',rectangle(x,y,x+w,y+c));add('left-wing',rectangle(x,y+c,x+a,y+d),p.leftHeight);add('right-wing',rectangle(x+w-b,y+c,x+w,y+r),p.rightHeight);
    }else add('main',outline);
  }else if(p.family==='court'){
    const cw=w*p.courtWidth,cd=d*p.courtDepth,cx=(w-cw)/2*p.courtX,cy=(d-cd)/2*p.courtY;
    holes.push(rectangle(cx-cw/2,cy-cd/2,cx+cw/2,cy+cd/2));add('main',outer);parts[0].holes=holes;
  }else{
    add('podium',outer,p.podiumHeight,0,'flat');
    const tw=w*(p.family==='podium'?p.towerWidth:p.twinWidth),td=d*p.towerDepth,cy=(d-td)/2*p.towerY;
    if(p.family==='podium'){
      const cx=(w-tw)/2*p.towerX;add('tower',rectangle(cx-tw/2,cy-td/2,cx+tw/2,cy+td/2),1,p.podiumHeight);
    }else{
      const cx=(w*p.towerGap+tw)/2;
      add('tower-1',rectangle(-cx-tw/2,cy-td/2,-cx+tw/2,cy+td/2),1,p.podiumHeight);
      add('tower-2',rectangle(cx-tw/2,cy-td/2,cx+tw/2,cy+td/2),p.secondHeight,p.podiumHeight);
    }
  }
  const area=poly=>Math.abs(poly.reduce((s,a,i)=>{const b=poly[(i+1)%poly.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
  const footprintArea=area(outline)-holes.reduce((s,h)=>s+area(h),0);
  return {config:p,outline,holes,parts,footprintArea,controls:activeParameters(p)};
}

export function buildOsmData(input={},floors=10){
  const shape=deriveBuilding(input),referenceHeight=30,elements=[],nodes=new Map();let nodeId=1,wayId=101,relationId=10001;
  const node=([x,y])=>{
    const key=`${x.toFixed(10)},${y.toFixed(10)}`;
    if(!nodes.has(key)){
      const id=nodeId++;nodes.set(key,id);elements.push({type:'node',id,lat:y*referenceHeight/111319.49079327358,lon:x*referenceHeight/111319.49079327358});
    }
    return nodes.get(key);
  };
  const way=(poly,tags={})=>{const ids=poly.map(node),id=wayId++;elements.push({type:'way',id,nodes:[...ids,ids[0]],tags});return id;};
  const metres=value=>String(Number((value*referenceHeight).toFixed(6)));
  const tagsFor=part=>({
    height:metres(part.height),min_height:metres(part.base),
    'roof:shape':part.roof,'roof:height':metres(part.roofRise),
    'roof:direction':String(part.roofDirection),'building:colour':'#d4ccbf','roof:colour':'#807568','building:material':'concrete'
  });
  if(shape.parts.length===1){
    const part=shape.parts[0],tags={building:'yes',...tagsFor(part)};
    if(part.holes.length){
      const members=[{type:'way',ref:way(part.outer),role:'outer'},...part.holes.map(h=>({type:'way',ref:way(h),role:'inner'}))];
      elements.push({type:'relation',id:relationId++,tags:{type:'multipolygon',...tags},members});
    }else way(part.outer,tags);
  }else{
    if(['podium','twin'].includes(shape.config.family)){
      // Put the podium tags on the outer building itself. A duplicate identical
      // outer way is deduplicated by the native OSM reader and loses its tags.
      way(shape.outline,{building:'yes',...tagsFor(shape.parts[0])});
      for(const part of shape.parts.slice(1))way(part.outer,{'building:part':'yes',...tagsFor(part)});
    }else{
      way(shape.outline,{building:'yes'});
      for(const part of shape.parts)way(part.outer,{'building:part':'yes',...tagsFor(part)});
    }
  }
  return {shape,referenceHeight,osm:{version:.6,generator:VERSION,elements}};
}

export function exportParameters(input,floors=10){
  const b=deriveBuilding(input),active=activeParameters(input);
  return {generator:VERSION,engine:ENGINE,source:'Synthetic parametric footprints and building parts; no real OSM buildings',
    normalization:{height:1,units:'dimensionless',isotropic:true,stl_up_axis:'Z',glb_up_axis:'Y'},
    structure:b.config.family,roof:b.config.roof,parameters:b.config,
    active_parameter_order:active.map(s=>s.key),active_parameter_values:active.map(s=>b.config[s.key]),
    active_numeric_control_count:active.length,control_count_is_not_global_independent_dimension:true,
    visual_floor_divisions:floors,outline:b.outline,holes:b.holes,parts:b.parts,
    cfd_mesh_validated:false};
}

export function randomConfig(input={},random=Math.random){
  const p=normalizeConfig(input);
  for(const s of activeParameters(p)){
    const current=p[s.key],span=(s.max-s.min)*.16;
    p[s.key]=Number(Math.max(s.min,Math.min(s.max,current+(random()*2-1)*span)).toFixed(s.step===1?0:2));
  }
  return normalizeConfig(p);
}
