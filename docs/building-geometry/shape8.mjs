// Continuous, dimensionless three-band massing. No Blender/Node generator runs here.
export const VERSION = 'normalized-stepped-building-8d-v1';
export const PARAMETERS = Object.freeze([
  {key:'width', symbol:'L₁ / H', min:.30, max:1.60, step:.01, group:0, zh:'底部宽高比', en:'Base width / height', hintZh:'改变底部宽度；上部两段按相对比例一起变化。', hintEn:'Changes the base width. Both upper bands follow their relative width ratios.'},
  {key:'depth', symbol:'D₁ / H', min:.25, max:1.35, step:.01, group:0, zh:'底部深高比', en:'Base depth / height', hintZh:'改变底部进深；上部两段按相对比例一起变化。', hintEn:'Changes the base depth. Both upper bands follow their relative depth ratios.'},
  {key:'width21', symbol:'L₂ / L₁', min:.30, max:1, step:.01, group:1, zh:'中段相对宽度', en:'Middle / base width', hintZh:'控制第一道横向退台；顶部宽度随中段一起变化。', hintEn:'Controls the first width setback. The top width follows the middle band.'},
  {key:'depth21', symbol:'D₂ / D₁', min:.30, max:1, step:.01, group:1, zh:'中段相对进深', en:'Middle / base depth', hintZh:'控制第一道进深退台；顶部进深随中段一起变化。', hintEn:'Controls the first depth setback. The top depth follows the middle band.'},
  {key:'width32', symbol:'L₃ / L₂', min:.30, max:1, step:.01, group:1, zh:'顶部相对宽度', en:'Top / middle width', hintZh:'只改变顶部宽度，控制第二道横向退台。', hintEn:'Changes only the top width, controlling the second width setback.'},
  {key:'depth32', symbol:'D₃ / D₂', min:.30, max:1, step:.01, group:1, zh:'顶部相对进深', en:'Top / middle depth', hintZh:'只改变顶部进深，控制第二道进深退台。', hintEn:'Changes only the top depth, controlling the second depth setback.'},
  {key:'height1', symbol:'h₁ / H', min:.10, max:.65, step:.01, group:2, zh:'底段高度占比', en:'Base height fraction', hintZh:'改变底段高度；中段高度保持不变，顶部吸收剩余高度。', hintEn:'Changes the base height. The middle height stays fixed; the top takes the remainder.'},
  {key:'height2', symbol:'h₂ / H', min:.10, max:.65, step:.01, group:2, zh:'中段高度占比', en:'Middle height fraction', hintZh:'改变中段高度；底段高度保持不变，顶部吸收剩余高度。', hintEn:'Changes the middle height. The base height stays fixed; the top takes the remainder.'}
]);
export const defaults = Object.freeze({width:.78,depth:.60,width21:.72,depth21:.78,width32:.70,depth32:.72,height1:.24,height2:.43});
export const PRESETS = Object.freeze([
  {id:'balanced',zh:'均衡退台',en:'Balanced setbacks',values:defaults},
  {id:'slender',zh:'细高塔楼',en:'Slender tower',values:{width:.38,depth:.32,width21:.84,depth21:.86,width32:.80,depth32:.82,height1:.16,height2:.45}},
  {id:'podium',zh:'宽裙房',en:'Wide podium',values:{width:1.45,depth:1.08,width21:.43,depth21:.48,width32:.82,depth32:.85,height1:.17,height2:.57}},
  {id:'terraces',zh:'层层退台',en:'Deep terraces',values:{width:1.18,depth:1.02,width21:.65,depth21:.65,width32:.56,depth32:.60,height1:.34,height2:.33}},
  {id:'slab',zh:'薄板体量',en:'Slender slab',values:{width:1.40,depth:.29,width21:.84,depth21:.92,width32:.77,depth32:.92,height1:.25,height2:.48}},
  {id:'longbase',zh:'纵深基座',en:'Deep base',values:{width:.58,depth:1.22,width21:.87,depth21:.55,width32:.82,depth32:.61,height1:.22,height2:.39}},
  {id:'lowtop',zh:'低矮冠部',en:'Low crown',values:{width:.92,depth:.78,width21:.87,depth21:.81,width32:.48,depth32:.58,height1:.38,height2:.50}},
  {id:'compact',zh:'紧凑堆叠',en:'Compact stack',values:{width:.85,depth:.85,width21:.93,depth21:.94,width32:.91,depth32:.90,height1:.30,height2:.38}}
]);

export function normalizeConfig(input={}) {
  const p={...defaults,...input};
  for(const spec of PARAMETERS) {
    const raw=p[spec.key];
    if(typeof raw==='boolean'||raw===null||raw==='')throw Error(`Invalid ${spec.key}`);
    p[spec.key]=Number(raw);
    if(!Number.isFinite(p[spec.key])||p[spec.key]<spec.min-1e-10||p[spec.key]>spec.max+1e-10)
      throw Error(`Outside design range: ${spec.key}`);
  }
  if(p.height1+p.height2>.90+1e-10)throw Error('The top height must be at least 0.10 H');
  return Object.fromEntries(PARAMETERS.map(({key})=>[key,p[key]]));
}

export function deriveShape(input={}) {
  const config=normalizeConfig(input),p=config;
  const widths=[p.width,p.width*p.width21,p.width*p.width21*p.width32];
  const depths=[p.depth,p.depth*p.depth21,p.depth*p.depth21*p.depth32];
  const heights=[p.height1,p.height2,1-p.height1-p.height2];
  let z=0;
  const bands=heights.map((height,i)=>{
    const band={width:widths[i],depth:depths[i],height,z0:z,z1:i===2?1:z+height};
    z=band.z1;return band;
  });
  return {config,bands,dimensions:[p.width,p.depth,1],footprintArea:p.width*p.depth,
    volume:bands.reduce((v,b)=>v+b.width*b.depth*b.height,0)};
}

export function randomConfig(random=Math.random) {
  const p=Object.fromEntries(PARAMETERS.map(s=>[s.key,s.min+random()*(s.max-s.min)]));
  // Rejection preserves a uniform density over the constrained height polygon.
  do{p.height1=.1+random()*.55;p.height2=.1+random()*.55;}while(p.height1+p.height2>.9);
  return normalizeConfig(p);
}

// Build the exposed boundary of the union on a shared rectangular grid. Shared
// subdivisions prevent T-junctions; interfaces never contain duplicate caps.
export function buildSurface(input={}) {
  const shape=deriveShape(input),{bands}=shape;
  const unique=values=>[...new Set(values)].sort((a,b)=>a-b);
  const xs=unique(bands.flatMap(b=>[-b.width/2,b.width/2]));
  const ys=unique(bands.flatMap(b=>[-b.depth/2,b.depth/2]));
  const zs=[0,bands[0].z1,bands[1].z1,1];
  const vertices=bands.map(()=>[]);
  function occupied(i,j,k) {
    if(i<0||j<0||k<0||i>=xs.length-1||j>=ys.length-1||k>=3)return false;
    return Math.abs((xs[i]+xs[i+1])/2)<bands[k].width/2 && Math.abs((ys[j]+ys[j+1])/2)<bands[k].depth/2;
  }
  function quad(points,k,normal) {
    let [a,b,c,d]=points;
    const ab=b.map((x,i)=>x-a[i]),ac=c.map((x,i)=>x-a[i]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    if(n.reduce((v,x,i)=>v+x*normal[i],0)<0)[b,d]=[d,b];
    vertices[k].push(...a,...b,...c,...a,...c,...d);
  }
  for(let k=0;k<3;k++)for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++) {
    if(!occupied(i,j,k))continue;
    const [x0,x1]=[xs[i],xs[i+1]],[y0,y1]=[ys[j],ys[j+1]],[z0,z1]=[zs[k],zs[k+1]];
    if(!occupied(i-1,j,k))quad([[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]],k,[-1,0,0]);
    if(!occupied(i+1,j,k))quad([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],k,[1,0,0]);
    if(!occupied(i,j-1,k))quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],k,[0,-1,0]);
    if(!occupied(i,j+1,k))quad([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],k,[0,1,0]);
    if(!occupied(i,j,k-1))quad([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],k,[0,0,-1]);
    if(!occupied(i,j,k+1))quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],k,[0,0,1]);
  }
  const positions=[],groups=[];
  for(let i=0;i<3;i++){groups.push({start:positions.length/3,count:vertices[i].length/3,materialIndex:i});positions.push(...vertices[i]);}
  return {...shape,positions,groups,triangles:positions.length/9};
}

export function inspectSurface(positions) {
  const edges=new Map();let volume=0,degenerateTriangles=0;
  const key=p=>p.map(x=>Math.round(x*1e9)).join(',');
  for(let i=0;i<positions.length;i+=9) {
    const a=positions.slice(i,i+3),b=positions.slice(i+3,i+6),c=positions.slice(i+6,i+9);
    const ab=b.map((x,j)=>x-a[j]),ac=c.map((x,j)=>x-a[j]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    if(n.reduce((s,x)=>s+x*x,0)<1e-28)degenerateTriangles++;
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    const keys=[a,b,c].map(key);
    for(let j=0;j<3;j++) {
      const [u,v]=[keys[j],keys[(j+1)%3]],id=u<v?`${u}|${v}`:`${v}|${u}`;
      const e=edges.get(id)||{count:0,orientation:0};e.count++;e.orientation+=u<v?1:-1;edges.set(id,e);
    }
  }
  const badEdges=[...edges.values()].filter(e=>e.count!==2||e.orientation!==0).length;
  return {closed:badEdges===0,badEdges,degenerateTriangles,signedVolume:volume,triangles:positions.length/9};
}

export function exportParameters(input) {
  const shape=deriveShape(input);
  return {generator:VERSION,shape_dimension:8,normalization:{total_height:1,units:'dimensionless',scale:'isotropic',origin:'base footprint center',stl_up_axis:'Z',glb_up_axis:'Y'},
    parameter_order:PARAMETERS.map(p=>p.key),vector:PARAMETERS.map(p=>shape.config[p.key]),parameters:shape.config,
    definitions:Object.fromEntries(PARAMETERS.map(p=>[p.key,p.symbol])),bands:shape.bands,
    constraints:{centered:true,aligned:true,nested:true,min_band_height:.1},
    scope:'Independent browser implementation of the centered, aligned three-band 8D family; no upstream CLI execution.',
    cfd_mesh_validated:false};
}

export function asciiSTL(input) {
  const {positions}=buildSurface(input),lines=['solid normalized_8d_building'];
  for(let i=0;i<positions.length;i+=9) {
    const a=positions.slice(i,i+3),b=positions.slice(i+3,i+6),c=positions.slice(i+6,i+9);
    const ab=b.map((x,j)=>x-a[j]),ac=c.map((x,j)=>x-a[j]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...n);
    lines.push(`facet normal ${n.map(x=>x/length).join(' ')}`,' outer loop',... [a,b,c].map(p=>`  vertex ${p.join(' ')}`),' endloop','endfacet');
  }
  lines.push('endsolid normalized_8d_building');return lines.join('\n')+'\n';
}
