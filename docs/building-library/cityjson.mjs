// CityJSON display conversion. Retains source rings/holes; never repairs meshes.
import * as THREE from './vendor/three.module.js';

export function canonicalBAGId(input){
  const text=String(input).trim();
  if(/^\d{16}$/.test(text))return 'NL.IMBAG.Pand.'+text;
  if(/^NL\.IMBAG\.Pand\.\d{16}$/i.test(text))return 'NL.IMBAG.Pand.'+text.slice(-16);
  return null;
}

export function surfaceAudit(geometry){
  const p=geometry.getAttribute('position'),index=geometry.index;
  const count=index?index.count:p.count,edges=new Map(),parent=new Map();let volume=0,degenerate=0;
  const point=i=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i):i);
  const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e6)).join(',');
  function find(k){if(!parent.has(k))parent.set(k,k);let root=k;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(k)!==k){const next=parent.get(k);parent.set(k,root);k=next;}return root;}
  function unite(a,b){const x=find(a),y=find(b);if(x!==y)parent.set(x,y);}
  for(let i=0;i<count;i+=3){
    const v=[point(i),point(i+1),point(i+2)];
    if(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq()<1e-18)degenerate++;
    volume+=v[0].dot(v[1].clone().cross(v[2]))/6;
    for(let j=0;j<3;j++){
      const a=key(v[j]),b=key(v[(j+1)%3]),id=a<b?a+'|'+b:b+'|'+a;
      unite(a,b);
      const item=edges.get(id)||[0,0];item[0]++;item[1]+=a<b?1:-1;edges.set(id,item);
    }
  }
  const boundary=[...edges.values()].filter(e=>e[0]===1).length;
  const nonmanifold=[...edges.values()].filter(e=>e[0]!==2).length;
  const winding=[...edges.values()].filter(e=>e[0]===2&&e[1]!==0).length;
  return {triangles:count/3,boundary_edges:boundary,nonmanifold_edges:nonmanifold,
    winding_conflicts:winding,degenerate_triangles:degenerate,
    closed:nonmanifold===0&&winding===0&&degenerate===0,volume_m3:volume,
    components:new Set([...parent.keys()].map(find)).size,
    self_intersections_checked:false,cfd_mesh_validated:false};
}

function surfaces(geometry){
  const b=geometry.boundaries;
  if(geometry.type==='Solid')return b.flat(1);
  if(['MultiSurface','CompositeSurface'].includes(geometry.type))return b;
  if(['MultiSolid','CompositeSolid'].includes(geometry.type))return b.flat(2);
  throw Error('Unsupported CityJSON geometry: '+geometry.type);
}

export function decodeCityJSON(document,lod='best'){
  const feature=document.feature||document;
  const meta=document.feature?document.metadata:document;
  if(!feature.CityObjects||!Array.isArray(feature.vertices))throw Error('Expected CityJSON building geometry');
  if(feature.vertices.length>300000)throw Error('Building is too large for this preview');
  const transform=meta.transform||{scale:[1,1,1],translate:[0,0,0]};
  const all=Object.values(feature.CityObjects).flatMap(o=>o.geometry||[]);
  const available=[...new Set(all.map(g=>String(g.lod)).filter(x=>Number(x)>0))].sort((a,b)=>Number(a)-Number(b));
  const chosen=lod==='best'?available.at(-1):String(lod);
  if(!available.includes(chosen))throw Error('Requested LoD is not available');
  const polygons=all.filter(g=>String(g.lod)===chosen).flatMap(surfaces);
  if(!polygons.length)throw Error('No surfaces at the selected LoD');
  const ids=[...new Set(polygons.flat(2))];
  if(ids.some(i=>!Number.isInteger(i)||i<0||i>=feature.vertices.length))throw Error('Invalid source vertex index');
  const global=id=>feature.vertices[id].map((x,k)=>x*transform.scale[k]+transform.translate[k]);
  const points=ids.map(global);
  if(points.some(p=>p.length!==3||p.some(x=>!Number.isFinite(x))))throw Error('Invalid source coordinates');
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
  if(hi.some((x,k)=>x-lo[k]<1e-7))throw Error('Source building has no positive three-dimensional extent');
  const origin=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]];
  const vertex=id=>new THREE.Vector3(...global(id).map((x,k)=>x-origin[k]));
  const output=[];let removedDegenerate=0;
  for(const polygon of polygons){
    const rings=polygon.map(r=>{
      const ids=[...r];if(ids.length>1&&ids[0]===ids.at(-1))ids.pop();
      const vertices=ids.map(vertex);if(vertices.length>1&&vertices[0].equals(vertices.at(-1)))vertices.pop();return vertices;
    });
    if(!rings.length||rings[0].length<3)throw Error('Invalid polygon ring');
    const outer=rings[0],normal=new THREE.Vector3();
    for(let i=0;i<outer.length;i++)normal.add(outer[i].clone().cross(outer[(i+1)%outer.length]));
    if(normal.lengthSq()<1e-20){removedDegenerate++;continue;}
    const abs=normal.toArray().map(Math.abs),drop=abs.indexOf(Math.max(...abs));
    const keep=[0,1,2].filter(i=>i!==drop);
    const project=p=>{const a=p.toArray();return new THREE.Vector2(a[keep[0]],a[keep[1]]);};
    const projected=rings.map(r=>r.map(project));
    const faces=THREE.ShapeUtils.triangulateShape(projected[0],projected.slice(1));
    const flat=rings.flat();
    if(!faces.length)throw Error('Source polygon cannot be triangulated');
    for(const face of faces){
      let [a,b,c]=face.map(i=>flat[i]);
      const n=b.clone().sub(a).cross(c.clone().sub(a));
      if(n.lengthSq()<1e-20){removedDegenerate++;continue;}
      if(n.dot(normal)<0)[b,c]=[c,b];
      output.push(...a.toArray(),...b.toArray(),...c.toArray());
    }
  }
  if(!output.length||output.length>9000000)throw Error('Geometry is empty or exceeds the preview limit');
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(output,3));
  geometry.computeVertexNormals();geometry.computeBoundingBox();
  const parent=Object.entries(feature.CityObjects).find(([,o])=>o.type==='Building');
  return {geometry,lod:chosen,availableLods:available,origin,dimensions:hi.map((v,k)=>v-lo[k]),
    source_id:parent?.[0]||feature.id||document.id,attributes:parent?.[1]?.attributes||{},
    crs:meta.metadata?.referenceSystem||'Source CRS unspecified',format_version:meta.version||null,
    source_polygons:polygons.length,removedDegenerate,audit:surfaceAudit(geometry)};
}
